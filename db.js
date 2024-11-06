const { Pool } = require('pg');



const dbConnection = new Pool({
    user: 'postgres',
     host: '172.25.11.195',
    database: 'postgres',
     password: '123456',
     port: 5432,

 });
 async function checkConnection() {
    let client;
    try {
        client = await dbConnection.connect();
        console.log('เชื่อมต่อกับฐานข้อมูลสำเร็จ');
        return true;
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับฐานข้อมูล:', error);
        return false;
    } finally {
        if (client) {
            client.release();
        }
    }
}

// เรียกใช้ฟังก์ชันตรวจสอบการเชื่อมต่อเมื่อเริ่มต้นแอปพลิเคชัน
checkConnection();

module.exports = dbConnection;

// ฟังก์ชันสำหรับตรวจสอบการเชื่อมต่อกับฐานข้อมูล



