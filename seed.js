require('dotenv').config();
const mongoose = require('mongoose');

// Connect trực tiếp không qua Model để tránh hash password
const DB_URL = process.env.DB_URL;

async function seed() {
    try {
        await mongoose.connect(DB_URL);
        console.log('✅ Đã kết nối MongoDB');

        const db = mongoose.connection.db;

        // Xóa dữ liệu cũ
        await db.collection('users').deleteMany({});
        await db.collection('products').deleteMany({});
        await db.collection('orders').deleteMany({});
        await db.collection('telegramusers').deleteMany({});
        console.log('🗑️ Đã xóa dữ liệu cũ');

        // Tạo 2 user (KHÔNG hash password để dễ nhớ)
        const users = await db.collection('users').insertMany([
            {
                username: 'admin',
                password: 'admin123', // Không hash
                role: 'admin',
                createdAt: new Date()
            },
            {
                username: 'user',
                password: 'user123', // Không hash
                role: 'user',
                createdAt: new Date()
            }
        ]);
        console.log('👤 Đã tạo 2 tài khoản:');
        console.log('   - Admin: admin / admin123');
        console.log('   - User: user / user123');

        // Tạo 1 sản phẩm mẫu
        await db.collection('products').insertOne({
            name: 'iPhone 15 Pro Max',
            price: 34990000,
            description: 'Điện thoại Apple cao cấp nhất 2024',
            image: '📱',
            createdAt: new Date()
        });
        console.log('📦 Đã tạo 1 sản phẩm mẫu: iPhone 15 Pro Max');

        console.log('\n🎉 Seed dữ liệu thành công!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Bây giờ bạn có thể:');
        console.log('1. Truy cập http://localhost:3000');
        console.log('2. Đăng nhập với admin/admin123 hoặc user/user123');
        console.log('3. Chat với bot Telegram: /start rồi /login admin admin123');

        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi seed:', err);
        process.exit(1);
    }
}

seed();
