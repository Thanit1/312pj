const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const dbConnection = require('./db');
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const forumRoutes = require('./routes/forum');
const newsRoutes = require('./routes/news');
const adminRoutes = require('./routes/admin');

const app = express();
const port = 3000;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ storage: storage });

app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));
app.use(express.static('uploads'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'your_secret_key', 
    name: 'session',
    keys: ['key1', 'key2'],
    maxAge: 3600 * 1000 // 1hr
}));

app.set('view engine', 'ejs');
app.post('/verify-code', async (req, res) => {
    const { access_code } = req.body;
    try {
        // สร้างวันที่และเวลาปัจจุบันในรูปแบบที่ PostgreSQL ยอมรับ
        const thaiCurrentTime = new Date().toLocaleString('en-US', { 
            timeZone: 'Asia/Bangkok',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2');
        
        const query = 'SELECT * FROM room_requests WHERE access_code = $1 AND is_used = FALSE';
        const result = await dbConnection.query(query, [access_code]);

        if (result.rows.length > 0) {
            const insertUsageQuery = 'INSERT INTO code_usage_logs (user_id, access_code, usage_time) VALUES ($1, $2, $3::timestamp)';
            await dbConnection.query(insertUsageQuery, [result.rows[0].user_id, access_code, thaiCurrentTime]);

            const updateQuery = 'UPDATE room_requests SET is_used = TRUE WHERE access_code = $1';
            await dbConnection.query(updateQuery, [access_code]);
            console.log('บันทึกการใช้รหัสสำเร็จ');
            res.json({ status: 1 });
        } else {
            res.json({ status: 0 });
        }
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการตรวจสอบรหัส:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบรหัส' });
    }
});
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/forum', forumRoutes);
app.use('/news', newsRoutes);
app.use('/admin', adminRoutes);


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
