const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const dbConnection = require('../db');
const exceljs = require('exceljs');
const fs = require('fs');
const path = require('path');

function islogin(req, res, next) {
    if (req.session.user) {
        return res.redirect('/index');
    }
    next();
}

router.get('/login', (req, res) => {
    res.render('login', { 
        error: null, 
        success: null, 
        user: req.session.user || null,  // แก้ไขบรรทัดนี้
        currentPage: 'login'  // แก้ไขบรรทัดนี้ถ้าจำเป็น
    });
});

router.post('/login', async (req, res) => {
    const { number, password } = req.body;
    const query = 'SELECT * FROM users WHERE number = $1';
    try {
        const result = await dbConnection.query(query, [number]);
        if (result.rows.length === 0) {
            
            return res.render('login', { 
                error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 
                success: null,
                user: req.session.user || null,  // แก้ไขบรรทัดนี้
                currentPage: 'login'  // แก้ไขบรรทัดนี้ถ้าจำเป็น
            });
        }
        const user = result.rows[0];
        if (!user.is_verified) {
            
            return res.render('login', { 
                error: 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ', 
                success: null,
                user: req.session.user || null,  // แก้ไขบรรทัดนี้
                currentPage: 'login'  // แก้ไขบรรทัดนี้ถ้าจำเป็น
            });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { 
                error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 
                success: null,
                user: req.session.user || null,  // แก้ไขบรรทัดนี้
                currentPage: 'login'  // แก้ไขบรรทัดนี้ถ้าจำเป็น
            });
        }
        req.session.user = user;
        req.session.id = user.number;
        console.log('Login successful. Session:', req.session);
        return res.redirect('/index');
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้:', err);
        return res.render('login', { error: 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้', success: null , user: req.session.user || null});
    }
});

router.get('/register', islogin, (req, res) => {
    res.render('register', { error: null, success: null , user: req.session.user || null});
});

router.post('/register', async (req, res) => {
    const { number, firstname, lastname, email, password } = req.body;
    
    try {
        const checkQuery = 'SELECT * FROM users WHERE number = $1';
        const checkResult = await dbConnection.query(checkQuery, [number]);
        
        if (checkResult.rows.length > 0) {
            return res.render('register', { error: 'รหัสนักศึกษานี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น' });
        }
        
        const dataUserFolder = path.join(__dirname, '..', 'datauser');
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
            return res.render('register', { error: 'รหัสนักศึกษาไม่ถูกต้องหรือไม่พบในระบบ' });
        }
        
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        const token = crypto.randomBytes(20).toString('hex');

        const insertQuery = 'INSERT INTO users (number, firstname, lastname, email, password, verification_token) VALUES ($1, $2, $3, $4, $5, $6)';
        const values = [number, firstname, lastname, email, hashedPassword, token];
        await dbConnection.query(insertQuery, values);
        
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
            subject: 'ยืนยันการสมัครสมาชิก',
            text: `ขอบคุณที่สมัครสมาชิก กรุณายืนยันอีเมลของคุณโดยคลิกที่ลิงก์นี้: http://172.25.11.195:5900/auth/verify-email?token=${token}`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log('เกิดข้อผิดพลาดในการส่งอีเมล:', error);
            }
            console.log('อีเมลถูกส่ง:', info.response);
        });

        res.render('login', { success: 'สมัครสมาชิกสำเร็จ กรุณายืนยันอีเมลของคุณ', user: req.session.user || null });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสมัครสมาชิก:', error);
        res.render('register', { error: 'เกิดข้อผิดพลาดในการสมัครสมาชิก', user: req.session.user || null });
    }
});

router.get('/verify-email', async (req, res) => {
    const token = req.query.token;

    const updateQuery = 'UPDATE users SET is_verified = TRUE WHERE verification_token = $1';
    const result = await dbConnection.query(updateQuery, [token]);

    if (result.rowCount > 0) {
        res.render('login', { success: 'อีเมลของคุณได้รับการยืนยันแล้ว.....' , user: req.session.user || null});
    } else {
        res.send('เกิดข้อผิดพลาดในการยืนยันอีเมล');
    }
});

router.get('/reset-password', (req, res) => {
    res.render('reset-password', { error: null, success: null , user: req.session.user || null});
});

router.post('/reset-password', async (req, res) => {
    const { email } = req.body;

    try {
        const query = 'SELECT * FROM users WHERE email = $1';
        const result = await dbConnection.query(query, [email]);

        if (result.rows.length === 0) {
            return res.render('reset-password', { error: 'ไม่พบอีเมลนี้ในระบบ', success: null , user: req.session.user || null});
        }

        const token = crypto.randomBytes(20).toString('hex');
        const updateQuery = 'UPDATE users SET verification_token = $1 WHERE email = $2';
        await dbConnection.query(updateQuery, [token, email]);

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
            text: `กรุณาคลิกที่ลิงก์นี้เพื่อตั้งรหัสผ่านใหม่: http://172.25.11.195:5900/auth/new-password?token=${token}`
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

router.get('/new-password', async (req, res) => {
    const token = req.query.token;
    res.render('new-password', { token, error: null, success: null });
});

router.post('/new-password', async (req, res) => {
    const { token, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const updateQuery = 'UPDATE users SET password = $1, verification_token = NULL WHERE verification_token = $2';
        const result = await dbConnection.query(updateQuery, [hashedPassword, token]);

        if (result.rowCount > 0) {
            res.render('login', { success: 'รหัสผ่านของคุณถูกตั้งใหม่เรียบร้อยแล้ว', error: null , user: req.session.user || null});
        } else {
            res.render('new-password', { token, error: 'เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่', success: null , user: req.session.user || null});
        }
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่:', error);
        res.render('new-password', { token, error: 'เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่', success: null , user: req.session.user || null});
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

module.exports = router;