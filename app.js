const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const dbConnection = require('./db');
const session = require('express-session');
const exceljs = require('exceljs');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const app = express();
const port = 3000;
const nodemailer = require('nodemailer'); // เพิ่มการนำเข้า nodemailer
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'your_secret_key', 
    name: 'session',
    keys: ['key1', 'key2'],
    maxAge: 3600 * 1000 // 1hr
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
        const query = 'SELECT access_code FROM room_requests WHERE user_id = $1 AND is_used = FALSE ORDER BY request_time DESC LIMIT 1';
        const result = await dbConnection.query(query, [req.session.user.number]);
        
        // กำหนดค่าเริ่มต้นให้กับ activeCode
        let activeCode = null;

        if (result.rows.length > 0) {
            activeCode = result.rows[0].access_code;
        }
        
        // ส่งค่าทั้งหมดไปยังเทมเพลต
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

app.get('/', isnotlogin, async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    try {
        const query = 'SELECT access_code FROM room_requests WHERE user_id = $1 AND is_used = FALSE ORDER BY request_time DESC LIMIT 1';
        const result = await dbConnection.query(query, [req.session.user.number]);
        
        // กำหนดค่าเริ่มต้นให้กับ activeCode
        let activeCode = null;

        if (result.rows.length > 0) {
            activeCode = result.rows[0].access_code;
        }
        
        // ส่งค่าทั้งหมดไปยังเทมเพลต
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
app.get('/register', islogin, (req, res) => {
    res.render('register', { error: null, success: null });
});

app.post('/register', async (req, res) => {
    const { number, firstname, lastname, email, password } = req.body;
    
    try {
        // ตรวจสอบว่ามี number นี้ในฐานข้อมูลแล้วหรือไม่
        const checkQuery = 'SELECT * FROM users WHERE number = $1';
        const checkResult = await dbConnection.query(checkQuery, [number]);
        
        if (checkResult.rows.length > 0) {
            return res.render('register', { error: 'รหัสนักศึกษานี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น' });
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
        res.render('register', { error: 'เกิดข้อผิดพลาดในการสมัครสมาชิก' });
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
    const userId = req.session.user.number;

    try {
        // ตรวจสอบว่ามีรหัสที่ยังไม่ได้ใช้อยู่หรือไม่
        const checkExistingCodeQuery = 'SELECT access_code FROM room_requests WHERE user_id = $1 AND is_used = FALSE';
        const existingCodeResult = await dbConnection.query(checkExistingCodeQuery, [userId]);

        if (existingCodeResult.rows.length > 0) {
            // มีรหัสที่ยังไม่ได้ใช้อยู่
            const existingCode = existingCodeResult.rows[0].access_code;
            return res.render('index', { 
                user: req.session.user,
                id: userId,
                activeCode: existingCode,
                message: 'คุณมีรหัสที่ยังไม่ได้ใช้อยู่แล้ว กรุณาใช้รหัสนี้ก่อนที่จะขอรหัสใหม่'
            });
        }

        // ถ้าไม่มีรหัสที่ยังไม่ได้ใช้ ให้สร้างรหัสใหม่
        const generateRandomCode = () => {
            return Math.floor(100000 + Math.random() * 900000).toString();
        };

        let randomCode;
        let isCodeUnique = false;

        while (!isCodeUnique) {
            randomCode = generateRandomCode();
            // ตรวจสอบว่ารหัสซ้ำหรือไม่
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
app.post('/verify-code', async (req, res) => {
    const { access_code } = req.body;
    try {
        const currentTime = new Date();
        const thaiCurrentTime = new Date(currentTime.toLocaleString('th-th', { timeZone: 'Asia/Bangkok' }));
        
        // เพิ่มเงื่อนไข AND is_used = FALSE ในการตรวจสอบรหัส
        const query = 'SELECT * FROM room_requests WHERE access_code = $1 AND is_used = FALSE';
        const result = await dbConnection.query(query, [access_code]);

        if (result.rows.length > 0) {
            // รหัสถูกต้อง ยังไม่หมดอายุ และยังไม่ถูกใช้
            const insertUsageQuery = 'INSERT INTO code_usage_logs (user_id, access_code, usage_time) VALUES ($1, $2, $3)';
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

// แก้ไข endpoint สำหรับดึงรหัสทั้งหมดที่ยังใช้ได้
app.get('/all-code', async (req, res) => {
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
// ... existing code ...

app.get('/reset-password', (req, res) => {
    res.render('reset-password', { error: null, success: null });
});

app.post('/reset-password', async (req, res) => {
    const { email } = req.body;

    try {
        // ตรวจสอบว่าอีเมลมีอยู่ในฐานข้อมูลหรือไม่
        const query = 'SELECT * FROM users WHERE email = $1';
        const result = await dbConnection.query(query, [email]);

        if (result.rows.length === 0) {
            return res.render('reset-password', { error: 'ไม่พบอีเมลนี้ในระบบ', success: null });
        }

        const token = crypto.randomBytes(20).toString('hex');
        const updateQuery = 'UPDATE users SET verification_token = $1 WHERE email = $2';
        await dbConnection.query(updateQuery, [token, email]);

        // ส่งอีเมลสำหรับรีเซ็ตรหัสผ่าน
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'thanit.sn02@gmail.com',
                pass: 'ogxi yywv crlg ezzr'
            }
        });

        const mailOptions = {
            from: 'thanit.sn02@gmail.com',
            to: email,
            subject: 'รีเซ็ตรหัสผ่าน',
            text: `กรุณาคลิกที่ลิงก์นี้เพื่อตั้งรหัสผ่านใหม่: http://172.25.11.151:5900/new-password?token=${token}`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log('เกิดข้อผิดพลาดในการส่งอีเมล:', error);
            }
            console.log('อีเมลถูกส่ง:', info.response);
        });

        res.render('reset-password', { success: 'ลิงก์รีเซ็ตรหัสผ่านถูกส่งไปยังอีเมลของคุณ', error: null });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน:', error);
        res.render('reset-password', { error: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน', success: null });
    }
});

app.get('/new-password', async (req, res) => {
    const token = req.query.token;
    res.render('new-password', { token, error: null, success: null });
});

app.post('/new-password', async (req, res) => {
    const { token, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const updateQuery = 'UPDATE users SET password = $1, verification_token = NULL WHERE verification_token = $2';
        const result = await dbConnection.query(updateQuery, [hashedPassword, token]);

        if (result.rowCount > 0) {
            res.render('login', { success: 'รหัสผ่านของคุณถูกตั้งใหม่เรียบร้อยแล้ว', error: null });
        } else {
            res.render('new-password', { token, error: 'เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่', success: null });
        }
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่:', error);
        res.render('new-password', { token, error: 'เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่', success: null });
    }
});

app.get('/api/room-occupants', async (req, res) => {
    try {
        const result = await dbConnection.query('SELECT occupants_count FROM rooms WHERE id = 1'); // ดึงข้อมูลจำนวนคนในห้อง 312
        
        const count = result.rows.length > 0 ? result.rows[0].occupants_count : 0; // ตรวจสอบว่ามีข้อมูลหรือไม่
        res.json({ count });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลจำนวนคนในห้อง:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลจำนวนคนในห้อง' });
    }
});

app.get('/locker', isnotlogin, (req, res) => {
    res.render('locker', { error: null, success: null });
});
// ... existing code ...

//ระบบแอดมิน

function isAdmin(req, res, next) {
    if (req.session.admin) {
        res.redirect('/adminindex')
        
    }
    next();
}

function isnotAdmin(req, res, next) {
    if (!req.session.admin) {
        res.redirect('/adminlogin');
        
    } 
    next();
}

app.get('/admin', isAdmin, (req, res) => {
    res.render('adminlogin', {error: null, success: null})
})

app.get('/adminlogin', isAdmin, (req, res) => {
    res.render('adminlogin', { error: null, success: null });
});

app.post('/adminlogin', async (req, res) => {
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
        res.redirect('/adminindex');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้:', error);
        res.render('adminlogin', { error: 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้', success: null });
    }
});

// ระบบแอดมิน
app.get('/adminregister', (req, res) => {
    res.render('adminregister', { error: null, success: null });
});

app.post('/adminregister', async (req, res) => {
    const { username, password } = req.body;

    try {
        // ตรวจสอบว่ามีชื่อผู้ใช้นี้ในฐานข้อมูลแล้วหรือไม่
        const checkQuery = 'SELECT * FROM admins WHERE username = $1';
        const checkResult = await dbConnection.query(checkQuery, [username]);

        if (checkResult.rows.length > 0) {
            return res.render('adminregister', { error: 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น', success: null });
        }

        // เข้ารหัสรหัสผ่านด้วย bcrypt
        const hashedPassword = await bcrypt.hash(password, 10);

        // บันทึกข้อมูลผู้ดูแลระบบใหม่
        const insertQuery = 'INSERT INTO admins (username, password) VALUES ($1, $2)';
        await dbConnection.query(insertQuery, [username, hashedPassword]);

        res.render('adminlogin', { success: 'สมัครสมาชิกผู้ดูแลระบบสำเร็จ กรุณาเข้าสู่ระบบ', error: null });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสมัครสมาชิกผู้ดูแลระบบ:', error);
        res.render('adminregister', { error: 'เกิดข้อผิดพลาดในการสมัครสมาชิกผู้ดูแลระบบ', success: null });
    }
});

app.get('/adminindex', isnotAdmin, async (req, res) => {
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

app.get('/adminall-logs', isnotAdmin, async (req, res) => {
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
        res.render('adminall-logs', { error: 'เกิดข้อผิดพลาดในการดึงข้อมูลบันทึกการใช้งานรหัส', all_logs: [] });
    }
});


app.get('/adminlogout', (req, res) => {
    req.session.destroy();
    res.redirect('/adminlogin');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 