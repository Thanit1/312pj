const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dbConnection = require('../db');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ storage: storage });

function isAdmin(req, res, next) {
    if (req.session.admin) {
        res.redirect('/admin/index')
    }
    next();
}

function isnotAdmin(req, res, next) {
    if (!req.session.admin) {
        res.redirect('/admin/login');
    } 
    next();
}

router.get('/', isAdmin, (req, res) => {
    res.render('adminlogin', {error: null, success: null})
});

router.get('/login', isAdmin, (req, res) => {
    res.render('adminlogin', { error: null, success: null });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const query = 'SELECT * FROM admins WHERE username = $1';
        const result = await dbConnection.query(query, [username]);

        if (result.rows.length === 0) {
            return res.render('adminlogin', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', success: null });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.render('adminlogin', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', success: null });
        }

        req.session.admin = user;
        res.redirect('/admin/index');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้:', error);
        res.render('adminlogin', { error: 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้', success: null });
    }
});

router.get('/register', (req, res) => {
    res.render('adminregister', { error: null, success: null });
});

router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const checkQuery = 'SELECT * FROM admins WHERE username = $1';
        const checkResult = await dbConnection.query(checkQuery, [username]);

        if (checkResult.rows.length > 0) {
            return res.render('adminregister', { error: 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น', success: null });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertQuery = 'INSERT INTO admins (username, password) VALUES ($1, $2)';
        await dbConnection.query(insertQuery, [username, hashedPassword]);

        res.render('adminlogin', { success: 'สมัครสมาชิกผู้ดูแลระบบสำเร็จ กรุณาเข้าสู่ระบบ', error: null });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสมัครสมาชิกผู้ดูแลระบบ:', error);
        res.render('adminregister', { error: 'เกิดข้อผิดพลาดในการสมัครสมาชิกผู้ดูแลระบบ', success: null });
    }
});

router.get('/index', isnotAdmin, async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.number, u.firstname, u.lastname, u.email
            FROM users u
            ORDER BY u.id ASC
        `;
        const result = await dbConnection.query(query);
        const users = result.rows;
        res.render('adminindex', { users });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้:', error);
        res.render('adminindex', { error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้', users: [] });
    }
});

router.get('/all-logs', isnotAdmin, async (req, res) => {
    try {
        const query = `
            SELECT c.id, c.user_id, u.firstname || ' ' || u.lastname AS full_name, c.access_code, c.usage_time
            FROM code_usage_logs c
            JOIN users u ON c.user_id::varchar = u.number
            ORDER BY c.usage_time DESC
        `;
        const result = await dbConnection.query(query);
        const all_logs = result.rows;

        res.render('adminall-logs', { all_logs });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลบันทึกการใช้งานรหัส:', error);
        res.render('adminall-logs', { error: 'เกิดข้อผิดพลาดในการดึงข้อมูลบันทึกการใช้งนรหัส', all_logs: [] });
    }
});

router.get('/news', isnotAdmin, async (req, res) => {
    try {
        const newsQuery = 'SELECT * FROM news ORDER BY created_at DESC';
        const newsResult = await dbConnection.query(newsQuery);
        const news = newsResult.rows;

        const eventsQuery = 'SELECT * FROM events ORDER BY date ASC';
        const eventsResult = await dbConnection.query(eventsQuery);
        const events = eventsResult.rows;

        res.render('admin_news', { news, events });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการโหลดข้อมูล:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการโหลดหน้า');
    }
});

router.post('/add-news', isnotAdmin, upload.single('image'), async (req, res) => {
    try {
        const { title, content, reference } = req.body;
        const imagePath = req.file ? '/uploads/' + req.file.filename : null;

        const query = 'INSERT INTO news (title, content, image_url, reference) VALUES ($1, $2, $3, $4)';
        await dbConnection.query(query, [title, content, imagePath, reference]);
        res.redirect('/admin/news');
    } catch (error) {
        console.error(error);
        res.status(500).send('เกิดข้อผิดพลาดในการเพิ่มข่าว');
    }
});

router.post('/delete-news/:id', isnotAdmin, async (req, res) => {
    try {
        const query = 'DELETE FROM news WHERE id = $1';
        await dbConnection.query(query, [req.params.id]);
        res.redirect('/admin/news');
    } catch (error) {
        console.error(error);
        res.status(500).send('เกิดข้อผิดพลาดในการลบข่าว');
    }
});

router.get('/edit-news/:id', isnotAdmin, async (req, res) => {
    try {
        const query = 'SELECT * FROM news WHERE id = $1';
        const result = await dbConnection.query(query, [req.params.id]);
        const news = result.rows[0];
        res.render('edit_news', { news });
    } catch (error) {
        console.error(error);
        res.status(500).send('เกิดข้อผิดพลาดในการโหลดข่าวสำหรับแก้ไข');
    }
});

router.post('/update-news/:id', isnotAdmin, upload.single('image'), async (req, res) => {
    try {
        const { title, content, reference } = req.body;
        let query, params;
        if (req.file) {
            query = 'UPDATE news SET title = $1, content = $2, image_url = $3, reference = $4 WHERE id = $5';
            params = [title, content, '/uploads/' + req.file.filename, reference, req.params.id];
        } else {
            query = 'UPDATE news SET title = $1, content = $2, reference = $3 WHERE id = $4';
            params = [title, content, reference, req.params.id];
        }
        await dbConnection.query(query, params);
        res.redirect('/admin/news');
    } catch (error) {
        console.error(error);
        res.status(500).send('เกิดข้อผิดพลาดในการอัปเดตข่าว');
    }
});

router.post('/add-event', isnotAdmin, async (req, res) => {
    try {
        const { title, date } = req.body;
        const query = 'INSERT INTO events (title, date) VALUES ($1, $2)';
        await dbConnection.query(query, [title, date]);
        res.redirect('/admin/news');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการเพิ่มกิจกรรม:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการเพิ่มกิจกรรม');
    }
});

router.post('/delete-event/:id', isnotAdmin, async (req, res) => {
    try {
        const query = 'DELETE FROM events WHERE id = $1';
        await dbConnection.query(query, [req.params.id]);
        res.redirect('/admin/news');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการลบกิจกรรม:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการลบกิจกรรม');
    }
});

router.get('/edit-event/:id', isnotAdmin, async (req, res) => {
    try {
        const query = 'SELECT * FROM events WHERE id = $1';
        const result = await dbConnection.query(query, [req.params.id]);
        const event = result.rows[0];
        res.render('edit_event', { event });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการโหลดกิจกรรมสำหรับแก้ไข:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการโหลดกิจกรรมสำหรับแก้ไข');
    }
});

router.post('/update-event/:id', isnotAdmin, async (req, res) => {
    try {
        const { title, date } = req.body;
        const query = 'UPDATE events SET title = $1, date = $2 WHERE id = $3';
        await dbConnection.query(query, [title, date, req.params.id]);
        res.redirect('/admin/news');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการอัปเดตกิจกรรม:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการอัปเดตกิจกรรม');
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// เพิ่มเส้นทางสำหรับการลบผู้ใช้งาน
router.post('/delete-user/:id', isnotAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const query = 'DELETE FROM users WHERE id = $1';
        await dbConnection.query(query, [userId]);
        return res.redirect('/admin/index');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการลบผู้ใช้งาน:', error);
        return res.status(500).render('error', { message: 'เกิดข้อผิดพลาดในการลบผู้ใช้งาน' });
    }
});

module.exports = router;
