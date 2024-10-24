const express = require('express');
const router = express.Router();

// ... existing code ...

// เพิ่มเส้นทางสำหรับหน้าติดต่อ admin
router.get('/', (req, res) => {
    res.render('contact_admin');
});

// ... existing code ...

module.exports = router;