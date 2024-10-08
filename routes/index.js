const express = require('express');
const router = express.Router();
const dbConnection = require('../db');

function isnotlogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

router.get('/index', isnotlogin, async (req, res) => {
    try {
        const query = 'SELECT access_code FROM room_requests WHERE user_id = $1 AND is_used = FALSE ORDER BY request_time DESC LIMIT 1';
        const result = await dbConnection.query(query, [req.session.user.number]);
        
        let activeCode = null;
        if (result.rows.length > 0) {
            activeCode = result.rows[0].access_code;
        }
        
        res.render('index', { 
            user: req.session.user, 
            id: req.session.user.id,
            activeCode: activeCode
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูล:', error);
        res.status(500).send('เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์');
    }
});

router.get('/', async (req, res) => {
    try {
        // ดึงข้อมูลข่าวล่าสุด
        const newsQuery = 'SELECT id, title, content, image_url, reference, created_at FROM news ORDER BY created_at DESC LIMIT 5';
        const newsResult = await dbConnection.query(newsQuery);
        const news = newsResult.rows;

        // ดึงข้อมูลโพสต์ล่าสุด
        const postsQuery = `
            SELECT p.id, p.title, u.firstname || ' ' || u.lastname AS author
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
            LIMIT 3
        `;
        const postsResult = await dbConnection.query(postsQuery);
        const posts = postsResult.rows;

        // ดึงข้อมูลกิจกรรม
        const eventsQuery = 'SELECT * FROM events ORDER BY date ASC LIMIT 5';
        const eventsResult = await dbConnection.query(eventsQuery);
        const events = eventsResult.rows;

        // ส่งค่าทั้งหมดไปยังเทมเพลต
        res.render('computer_engineering', { 
            user: req.session.user, 
            currentPage: 'computer_engineering',
            news: news,
            posts: posts,
            events: events  // เพิ่มบรรทัดนี้
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูล:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการโหลดหน้า');
    }
});
router.post('/room', isnotlogin, async (req, res) => {
    const userId = req.session.user.number;

    try {
        const checkExistingCodeQuery = 'SELECT access_code FROM room_requests WHERE user_id = $1 AND is_used = FALSE';
        const existingCodeResult = await dbConnection.query(checkExistingCodeQuery, [userId]);

        if (existingCodeResult.rows.length > 0) {
            const existingCode = existingCodeResult.rows[0].access_code;
            return res.render('index', { 
                user: req.session.user,
                id: userId,
                activeCode: existingCode,
                message: 'คุณมีรหัสที่ยังไม่ได้ใช้อยู่แล้ว กรุณาใช้รหัสนี้ก่อนที่จะขอรหัสใหม่'
            });
        }

        const generateRandomCode = () => {
            return Math.floor(100000 + Math.random() * 900000).toString();
        };

        let randomCode;
        let isCodeUnique = false;

        while (!isCodeUnique) {
            randomCode = generateRandomCode();
            const checkCodeQuery = 'SELECT * FROM room_requests WHERE access_code = $1 AND is_used = FALSE';
            const checkCodeResult = await dbConnection.query(checkCodeQuery, [randomCode]);
            if (checkCodeResult.rows.length === 0) {
                isCodeUnique = true;
            }
        }

        const currentTime = new Date();
        const thaiCurrentTime = new Date(currentTime.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        
        const query = 'INSERT INTO room_requests (user_id, request_time, access_code, is_used) VALUES ($1, $2, $3, FALSE)';
        const result = await dbConnection.query(query, [userId, thaiCurrentTime, randomCode]);
        
        if (result.rowCount > 0) {
            res.render('index', { 
                user: req.session.user,
                id: userId,
                activeCode: randomCode, 
                message: 'รหัสใหม่ถูกสร้างขึ้นและสามารถใช้ได้หนึ่งครั้ง'
            });
        } else {
            res.render('index', { 
                user: req.session.user,
                id: userId,
                activeCode: null,
                error: 'เกิดข้อผิดพลาดในการสร้างรหัสใหม่'
            });
        }
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการบันทึกข้อมูลการขอใช้ห้อง:', err);
        res.render('index', { 
            error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลการขอใช้ห้อง', 
            user: req.session.user, 
            id: userId,
            activeCode: null
        });
    }
});



router.get('/all-code', async (req, res) => {
    try {
        const query = 'SELECT access_code FROM room_requests WHERE expiration_time > NOW() AND is_used = FALSE';
        const result = await dbConnection.query(query);

        if (result.rows.length > 0) {
            res.json(result.rows);
        } else {
            res.status(404).json({ error: 'ไม่พบรหัสที่ยังไม่หมดอายุและยังไม่ถูกใช้' });
        }
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการตรวจสอบรหัส:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบรหัส' });
    }
});

router.get('/locker', isnotlogin, (req, res) => {
    res.render('locker', { 
        user: req.session.user, 
    });
});

module.exports = router;