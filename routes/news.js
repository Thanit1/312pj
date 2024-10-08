const express = require('express');
const router = express.Router();
const dbConnection = require('../db');

router.get('/', async (req, res) => {
    try {
        const query = 'SELECT * FROM news ORDER BY created_at DESC';
        const result = await dbConnection.query(query);
        const allNews = result.rows;
        
        res.render('news', { 
            user: req.session.user, 
            currentPage: 'news',
            allNews: allNews
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลข่าว:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการโหลดหน้าข่าว');
    }
});

router.get('/:id', async (req, res) => {
    try {
        const query = 'SELECT * FROM news WHERE id = $1';
        const result = await dbConnection.query(query, [req.params.id]);
        const newsItem = result.rows[0];
        
        if (!newsItem) {
            return res.status(404).send('ไม่พบข่าวที่คุณต้องการ');
        }

        res.render('news_detail', { 
            user: req.session.user, 
            currentPage: 'news',
            newsItem: newsItem
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลข่าว:', error);
        res.status(500).send('เกิดข้อผิดพลาดในการโหลดหน้า');
    }
});

module.exports = router;