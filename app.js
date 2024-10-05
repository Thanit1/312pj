const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const dbConnection = require('./db');
const session = require('express-session');
const exceljs = require('exceljs');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const app = express();
const port = 3000;

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
        
        let activeCode = null;
        let activeExpiration = null;
        if (result.rows.length > 0) {
            activeCode = result.rows[0].access_code;
            activeExpiration = result.rows[0].expiration_time;
        }
        
        res.render('index', { 
            user: req.session.user, 
            id: req.session.user.id, // เปลี่ยนจาก req.session.id เป็น req.session.user.id
            activeCode: activeCode,
            activeExpiration: activeExpiration
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
        const insertQuery = 'INSERT INTO users (number, firstname, lastname, email, password) VALUES ($1, $2, $3, $4, $5)';
        const values = [number, firstname, lastname, email, hashedPassword];
        
        await dbConnection.query(insertQuery, values);
        res.render('login', { success: 'สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ' });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสมัครสมาชิก:', error);
        res.render('resgister', { error: 'เกิดข้อผิดพลาดในการสมัครสมาชิก' });
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
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', success: null });
        }
        req.session.user = user;
        req.session.id = user.number;
        console.log('Login successful. Session:', req.session); // เพิ่ม log
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
            const thaiExpirationTime = existingRequest.expiration_time;
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

        const currentTime = new Date();
        const expirationTime = new Date(currentTime.getTime() + 30 * 60 * 1000); // 30 นาที
        
        const query = 'INSERT INTO room_requests (user_id, request_time, access_code, expiration_time) VALUES ($1, $2, $3, $4)';
        await dbConnection.query(query, [userId, currentTime, randomCode, expirationTime]);
        
        const thaiExpirationTime = expirationTime;
        res.render('index', { 
            user: req.session.user,
            id: userId,
            activeCode: randomCode, 
            activeExpiration: thaiExpirationTime,
            message: 'รหัสใหม่ถูกสร้างขึ้นและสามารถใช้ได้ 30 นาที'
        });
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