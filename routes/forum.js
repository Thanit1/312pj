const express = require('express');
const router = express.Router();
const dbConnection = require('../db');
const multer = require('multer');
const path = require('path');


function isnotlogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}// กำหนดค่า multer สำหรับอัปโหลดไฟล์
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')  // ตรวจสอบว่าโฟลเดอร์นี้มีอยู่จริง
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ storage: storage });


router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT p.id, p.title, CONCAT(u.firstname, ' ', u.lastname) AS author, p.created_at, p.image_url
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
        `;
        const result = await dbConnection.query(query);
        const posts = result.rows;
        
        res.render('forum', { 
            posts, 
            error: null, 
            success: null, 
            user: req.session.user,
            currentPage: 'forum'
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลกระทู้:', error);
        res.render('forum', { 
            error: 'เกิดข้อผิดพลาดในการดึงข้อมูลกระทู้', 
            success: null, 
            posts: [],
            user: req.session.user,
            currentPage: 'forum'
        });
    }
});

router.post('/create', isnotlogin, upload.single('image'), async (req, res) => {
    const { title, content } = req.body;
    const userId = req.session.user.id;
    const imagePath = req.file ? '/uploads/' + req.file.filename : null;

    try {
        const insertQuery = 'INSERT INTO posts (title, content, user_id, image_url) VALUES ($1, $2, $3, $4)';
        await dbConnection.query(insertQuery, [title, content, userId, imagePath]);
        
        res.redirect('/forum');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสร้างกระทู้:', error);
        res.redirect('/forum');
    }
});



router.post('/post/:id/edit', isnotlogin, upload.single('image'), async (req, res) => {
    const postId = req.params.id;
    const { editedTitle, editedContent } = req.body;
    
    console.log('Received data:', req.body);  // เพิ่มบรรทัดนี้เพื่อตรวจสอบข้อมูลที่ได้รับ

    // เพิ่มการตรวจสอบค่าอย่างเข้มงวด
    if (!editedTitle || editedTitle.trim() === '' || !editedContent || editedContent.trim() === '') {
        return res.status(400).send('กรุณากรอกหัวข้อและเนื้อหาให้ครบถ้วน');
    }
    
    try {
        // ตรวจสอบว่าผู้ใช้เป็นเจ้าของโพสต์หรือไม่
        const checkOwnerQuery = 'SELECT user_id FROM posts WHERE id = $1';
        const checkResult = await dbConnection.query(checkOwnerQuery, [postId]);
        
        if (checkResult.rows.length === 0 || checkResult.rows[0].user_id !== req.session.user.id) {
            return res.status(403).send('คุณไม่มีสิทธิ์แก้ไขโพสต์นี้');
        }
        
        // เตรียมข้อมูลสำหรับอัปเดต
        const updateData = {
            title: editedTitle,
            content: editedContent
        };

        // ถ้ามีการอัปโหลดรูปภาพใหม่
        if (req.file) {
            updateData.image_url = '/uploads/' + req.file.filename;
        }

        // สร้าง query string และ values array
        const fields = Object.keys(updateData);
        const values = Object.values(updateData);
        const setString = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        
        // อัปเดตโพสต์
        const updateQuery = `UPDATE posts SET ${setString} WHERE id = $${fields.length + 1} RETURNING *`;
        const result = await dbConnection.query(updateQuery, [...values, postId]);
        
        if (result.rows.length === 0) {
            throw new Error('ไม่สามารถอัปเดตโพสต์ได้');
        }
        
        console.log('Updated post:', result.rows[0]);  // เพิ่มบรรทัดนี้เพื่อตรวจสอบผลลัพธ์

        res.redirect(`/forum/view/${postId}`);
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการแก้ไขโพสต์:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการแก้ไขโพสต์: ' + error.message);
    }
});
// เพิ่มเส้นทางสำหรับการลบโพสต์
router.post('/post/:id/delete', isnotlogin, async (req, res) => {
    const postId = req.params.id;

    try {
        // เริ่ม transaction
        await dbConnection.query('BEGIN');

        // ตรวจสอบว่าผู้ใช้เป็นเจ้าของโพสต์หรือไม่
        const checkOwnerQuery = 'SELECT user_id FROM posts WHERE id = $1';
        const checkResult = await dbConnection.query(checkOwnerQuery, [postId]);
        
        if (checkResult.rows.length === 0) {
            await dbConnection.query('ROLLBACK');
            return res.status(404).send('ไม่พบโพสต์ที่ต้องการลบ');
        }
        
        if (checkResult.rows[0].user_id !== req.session.user.id) {
            await dbConnection.query('ROLLBACK');
            return res.status(403).send('คุณไม่มีสิทธิ์ลบโพสต์นี้');
        }
        
        // ลบความคิดเห็นที่เกี่ยวข้องกับโพสต์นี้ก่อน
        const deleteCommentsQuery = 'DELETE FROM comments WHERE post_id = $1';
        await dbConnection.query(deleteCommentsQuery, [postId]);
        
        // ลบโพสต์
        const deletePostQuery = 'DELETE FROM posts WHERE id = $1';
        await dbConnection.query(deletePostQuery, [postId]);
        
        // Commit transaction
        await dbConnection.query('COMMIT');
        
        res.redirect('/forum');
    } catch (error) {
        // หากเกิดข้อผิดพลาด ให้ rollback การเปลี่ยนแปลงทั้งหมด
        await dbConnection.query('ROLLBACK');
        console.error('เกิดข้อผิดพลาดในการลบโพสต์:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการลบโพสต์: ' + error.message);
    }
});
router.get('/view/:id', async (req, res) => {
    const postId = req.params.id;
    
    try {
        const postQuery = `
            SELECT p.*, u.firstname || ' ' || u.lastname AS author
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `;
        const postResult = await dbConnection.query(postQuery, [postId]);
        const post = postResult.rows[0];

        const commentsQuery = `
            SELECT c.*, u.firstname || ' ' || u.lastname AS author
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.post_id = $1
            ORDER BY c.created_at ASC
        `;
        const commentsResult = await dbConnection.query(commentsQuery, [postId]);
        const comments = commentsResult.rows;

        res.render('forum_view', { 
            post, 
            comments, 
            error: null, 
            success: null,
            user: req.session.user,
            currentPage: 'forum'
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลกระทู้:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการโหลดหน้ากระทู้');
    }
});

router.post('/comment', isnotlogin, async (req, res) => {
    const { postId, content } = req.body;
    const userId = req.session.user.id;
    
    try {
        const insertQuery = 'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3)';
        await dbConnection.query(insertQuery, [postId, userId, content]);
        
        res.redirect(`/forum/view/${postId}`);
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการเพิ่มความคิดเห็น:', error);
        res.render('forum_view', { 
            error: 'เกิดข้อผิดพลาดในการเพิ่มความคิดเห็น', 
            success: null,
            post: { id: postId },
            comments: [],
            user: req.session.user
        });
    }
});

router.post('/comment/:id/edit', isnotlogin, async (req, res) => {
    const commentId = req.params.id;
    const postId = req.body.postId;
    const editedComment = req.body.editedComment;
    
    try {
        const commentQuery = 'SELECT * FROM comments WHERE id = $1';
        const commentResult = await dbConnection.query(commentQuery, [commentId]);
        
        if (commentResult.rows.length === 0) {
            return res.status(404).send('ไม่พบความคิดเห็นนี้');
        }
        
        if (commentResult.rows[0].user_id !== req.session.user.id) {
            return res.status(403).send('คุณไม่มีสิทธิ์แก้ไขความคิดเห็นนี้');
        }
        
        const updateQuery = 'UPDATE comments SET content = $1 WHERE id = $2';
        await dbConnection.query(updateQuery, [editedComment, commentId]);
        
        res.redirect(`/forum/view/${postId}`);
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการแก้ไขความคิดเห็น:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการแก้ไขความคิดเห็น');
    }
});

router.post('/comment/:id/delete', isnotlogin, async (req, res) => {
    const commentId = req.params.id;
    const postId = req.body.postId;
    
    try {
        const commentQuery = 'SELECT * FROM comments WHERE id = $1';
        const commentResult = await dbConnection.query(commentQuery, [commentId]);
        
        if (commentResult.rows.length === 0) {
            return res.status(404).send('ไม่พบความคิดเห็นนี้');
        }
        
        if (commentResult.rows[0].user_id !== req.session.user.id) {
            return res.status(403).send('คุณไม่มีสิทธิ์ลบความคิดเห็นนี้');
        }
        
        const deleteQuery = 'DELETE FROM comments WHERE id = $1';
        await dbConnection.query(deleteQuery, [commentId]);
        
        res.redirect(`/forum/view/${postId}`);
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการลบความคิดเห็น:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการลบความคิดเห็น');
    }
});

module.exports = router;