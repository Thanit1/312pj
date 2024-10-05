const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const dbConnection = require('./db');
const session = require('express-session');
const exceljs = require('exceljs');
const fs = require('fs');
const crypto = require('crypto'); // เพิ่มการนำเข้า crypto
const bcrypt = require('bcryptjs');
const app = express();
const port = 3000;
const nodemailer = require('nodemailer'); // เพิ่มการนำเข้า nodemailer
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, // เปลี่ยนเป็น false ถ้าไม่ได้ใช้ HTTPS
        maxAge: 30 * 60 * 1000 // 30 นาที
    }
}));

app.set('view engine', 'ejs');

function isnotlogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}
function islogin(req, res, next) {
    if (req.session.user) {
        return res.redirect('/index');  // เปลี่ยนจาก '/' เป็น '/index'
    }
    next();
}
app.get('/index', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    try {
        const currentTime = new Date();
       
        const query = 'SELECT access_code, expiration_time FROM room_requests WHERE user_id = $1 AND expiration_time > $2 ORDER BY expiration_time DESC LIMIT 1';
        const result = await dbConnection.query(query, [req.session.user.number, currentTime]);
        
        // กำหนดค่าเริ่มต้นให้กับ activeCode และ activeExpiration
        let activeCode = null;
        let activeExpiration = null;

        if (result.rows.length > 0) {
            activeCode = result.rows[0].access_code;
            activeExpiration = result.rows[0].expiration_time.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        }
        
        // ส่งค่าทั้งหมดไปยังเทมเพลต
        res.render('index', { 
            user: req.session.user, 
            id: req.session.user.id, // เปลี่ยนจาก req.session.id เป็น req.session.user.id
            activeCode: activeCode, // ส่ง activeCode
            activeExpiration: activeExpiration // ส่ง activeExpiration
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูล:', error);
        res.status(500).send('เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์');
    }
});
app.get('/', isnotlogin, (req, res) => {
    res.render('index', { user: req.session.user, id: req.session.id });
  });

app.get('/resgister', islogin, (req, res) => {
    res.render('resgister', { error: null, success: null });
});

app.post('/resgister', async (req, res) => {
    const { number, firstname, lastname, email, password } = req.body;
    
    try {
        // ตรวจสอบว่ามี number นี้ในฐานข้อมูลแล้วหรือไม่
        const checkQuery = 'SELECT * FROM users WHERE number = $1';
        const checkResult = await dbConnection.query(checkQuery, [number]);
        
        if (checkResult.rows.length > 0) {
            return res.render('resgister', { error: 'รหัสนักศึกษานี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น' });
        }
        
        // ตรวจสอบ number ในไฟล์ Excel ทุกไฟล์ในโฟลเดอร์ datauser
        const dataUserFolder = path.join(__dirname, 'datauser');
        const excelFiles = fs.readdirSync(dataUserFolder).filter(file => file.endsWith('.xlsx'));
        
        let isNumberValid = false;
        
        for (const file of excelFiles) {
            const workbook = new exceljs.Workbook();
            await workbook.xlsx.readFile(path.join(dataUserFolder, file));
            const worksheet = workbook.getWorksheet(1);
            
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1 && row.getCell('A').value === number) {
                    isNumberValid = true;
                }
            });
            
            if (isNumberValid) break;
        }
        
        if (!isNumberValid) {
            return res.render('resgister', { error: 'รหัสนักศึกษาไม่ถูกต้องหรือไม่พบในระบบ' });
        }
        
        // เข้ารหัสรหัสผ่านด้วย bcrypt
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // ถ้า number ถูกต้องและไม่ซ้ำ ดำเนินการบันทึกข้อมูล
        const token = crypto.randomBytes(20).toString('hex');

        // บันทึก token ในฐานข้อมูลพร้อมกับข้อมูลผู้ใช้
        const insertQuery = 'INSERT INTO users (number, firstname, lastname, email, password, verification_token) VALUES ($1, $2, $3, $4, $5, $6)';
        const values = [number, firstname, lastname, email, hashedPassword, token];
        await dbConnection.query(insertQuery, values);
        
        // ส่งอีเมลยืนยัน
        const transporter = nodemailer.createTransport({
            service: 'gmail', // หรือบริการอีเมลที่คุณใช้
            auth: {
                user: 'thanit.sn02@gmail.com', // อีเมลของคุณ
                pass: 'ogxi yywv crlg ezzr' // รหัสผ่านของอีเมล
            }
        });

        const mailOptions = {
            from: 'thanit.sn02@gmail.com',
            to: email,
            subject: 'ยืนยันการสมัครสมาชิก',
            text: `ขอบคุณที่สมัครสมาชิก กรุณายืนยันอีเมลของคุณโดยคลิกที่ลิงก์นี้: http://172.25.11.151:5900/verify-email?token=${token}`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log('เกิดข้อผิดพลาดในการส่งอีเมล:', error);
            }
            console.log('อีเมลถูกส่ง:', info.response);
        });

        res.render('login', { success: 'สมัครสมาชิกสำเร็จ กรุณายืนยันอีเมลของคุณ' });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสมัครสมาชิก:', error);
        res.render('resgister', { error: 'เกิดข้อผิดพลาดในการสมัครสมาชิก' });
    }
});

app.get('/verify-email', async (req, res) => {
    const token = req.query.token;

    // ตรวจสอบ token และอัปเดตสถานะการยืนยันในฐานข้อมูล
    const updateQuery = 'UPDATE users SET is_verified = TRUE WHERE verification_token = $1';
    const result = await dbConnection.query(updateQuery, [token]);

    if (result.rowCount > 0) {
        
        res.render('login', { success: 'อีเมลของคุณได้รับการยืนยันแล้ว.....' });
    } else {
        res.send('เกิดข้อผิดพลาดในการยืนยันอีเมล');
    }
    
});
app.get('/login', islogin, (req, res) => {
    res.render('login', { error: null, success: null });
});

app.post('/login', async (req, res) => {
    const { number, password } = req.body;
    const query = 'SELECT * FROM users WHERE number = $1';
    try {
        const result = await dbConnection.query(query, [number]);
        if (result.rows.length === 0) {
            return res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', success: null });
        }
        const user = result.rows[0];
        if (!user.is_verified) { // ตรวจสอบสถานะการยืนยันอีเมล
            return res.render('login', { error: 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ', success: null });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', success: null });
        }
        req.session.user = user;
        req.session.id = user.number;
        console.log('Login successful. Session:', req.session);
        return res.redirect('/index');
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้:', err);
        return res.render('login', { error: 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้', success: null });
    }
});
// ... existing code ...

app.post('/room', isnotlogin, async (req, res) => {
    const userId = req.session.user.number; // ใช้ ID จาก session แทนที่จะรับจาก body

    try {
        // ตรวจสอบว่าผู้ใช้มีรหัสที่ยังไม่หมดอายุหรือไม่
        const checkQuery = 'SELECT * FROM room_requests WHERE user_id = $1 AND expiration_time > NOW()';
        const checkResult = await dbConnection.query(checkQuery, [userId]);

        if (checkResult.rows.length > 0) {
            // ถ้ามีรหัสที่ยังไม่หมดอายุ ส่งกลับรหัสเดิมและเวลาหมดอายุ
            const existingRequest = checkResult.rows[0];
            const thaiExpirationTime = existingRequest.expiration_time.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
            return res.render('index', { 
                user: req.session.user,
                id: userId,
                activeCode: existingRequest.access_code, 
                activeExpiration: thaiExpirationTime,
                message: 'คุณมีรหัสที่ยังไม่หมดอายุ สามารถใช้รหัสนี้ได้จนกว่าจะถึงเวลาหมดอายุ'
            });
        }

        // สร้างรหัสใหม่
        const generateRandomCode = () => {
            return Math.floor(100000 + Math.random() * 900000).toString();
        };

        let randomCode;
        let isCodeUnique = false;

        while (!isCodeUnique) {
            randomCode = generateRandomCode();
            // ตรวจสอบว่ารหัสซ้ำหรือไม่
            const checkCodeQuery = 'SELECT * FROM room_requests WHERE access_code = $1 AND expiration_time > NOW()';
            const checkCodeResult = await dbConnection.query(checkCodeQuery, [randomCode]);
            if (checkCodeResult.rows.length === 0) {
                isCodeUnique = true;
            }
        }

        const currentTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const expirationTime = new Date(currentTime.getTime() + 30 * 60 * 1000); // 30 นาที
        
        const query = 'INSERT INTO room_requests (user_id, request_time, access_code, expiration_time) VALUES ($1, $2, $3, $4)';
        const result = await dbConnection.query(query, [userId, currentTime, randomCode, expirationTime]);
        
        if (result.rowCount > 0) { // ตรวจสอบว่าการแอดสำเร็จหรือไม่
            const thaiExpirationTime = expirationTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
            res.render('index', { 
                user: req.session.user,
                id: userId,
                activeCode: randomCode, 
                activeExpiration: thaiExpirationTime,
                message: 'รหัสใหม่ถูกสร้างขึ้นและสามารถใช้ได้ 30 นาที'
            });
        } else {
            res.render('index', { 
                user: req.session.user,
                id: userId,
                error: 'เกิดข้อผิดพลาดในการสร้างรหัสใหม่' // แสดงข้อความผิดพลาดถ้าแอดไม่สำเร็จ
            });
        }
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการบันทึกข้อมูลการขอใช้ห้อง:', err);
        res.render('index', { error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลการขอใช้ห้อง', user: req.session.user, id: userId });
    }
});
app.post('/verify-code', async (req, res) => {
    const { access_code } = req.body;

    try {
        // ตรวจสอบรหัสในฐานข้อมูล
        const query = 'SELECT * FROM room_requests WHERE access_code = $1 AND expiration_time > NOW()';
        const result = await dbConnection.query(query, [access_code]);

        if (result.rows.length > 0) {
            // รหัสถูกต้องและยังไม่หมดอายุ
            // บันทึกเวลาที่ใช้รหัส
            const usageTime = new Date();
            const insertUsageQuery = 'INSERT INTO code_usage_logs (user_id, access_code, usage_time) VALUES ($1, $2, $3)';
            await dbConnection.query(insertUsageQuery, [result.rows[0].user_id, access_code, usageTime]);
            console.log('บันทึกการใช้รหัสสำเร็จ');
            res.json({ status: 1 });
        } else {
            // รหัสไม่ถูกต้องหรือหมดอายุแล้ว
            res.json({ status: 0 });
        }
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการตรวจสอบรหัส:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบรหัส' });
    }
});

app.get('/all-code', async (req, res) => {
    try {
        // ตรวจสอบรหัสในฐานข้อมูล
        const query = 'SELECT access_code FROM room_requests WHERE expiration_time > NOW()';
        const result = await dbConnection.query(query);

        if (result.rows.length > 0) {
          
            res.json(result.rows);
        } else {
          
            res.status(404).json({ error: 'ไม่พบรหัสที่ยังไม่หมดอายุ' });
        }
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการตรวจสอบรหัส:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบรหัส' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 