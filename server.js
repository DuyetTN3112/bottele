require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shop');
const adminRoutes = require('./routes/admin');
// Telegram webhook được xử lý bởi Python bot (bot_sheet.py)
// const { router: telegramRoutes } = require('./routes/telegram');

const app = express();

// ================= CẤU HÌNH =================
const PORT = process.env.PORT || 3000;
const DB_URL = process.env.DB_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_secret_key';

// ================= MIDDLEWARE =================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session với MongoDB store
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: DB_URL,
        ttl: 24 * 60 * 60 // 1 ngày
    }),
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 ngày
}));

// ================= ROUTES =================
app.get('/', (req, res) => {
    res.redirect('/auth/login');
});

app.use('/auth', authRoutes);
app.use('/shop', shopRoutes);
app.use('/admin', adminRoutes);
// Telegram webhook được xử lý bởi Python bot (bot_sheet.py)

// ================= KẾT NỐI DATABASE & CHẠY SERVER =================
mongoose.connect(DB_URL)
    .then(() => {
        console.log('✅ Đã kết nối MongoDB thành công!');
        
        app.listen(PORT, () => {
            console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
            console.log(`📝 Đăng ký: http://localhost:${PORT}/auth/register`);
            console.log(`🔐 Đăng nhập: http://localhost:${PORT}/auth/login`);
            console.log(`\n📦 Đơn hàng mới sẽ được Python bot quét và gửi Telegram`);
        });
    })
    .catch((err) => {
        console.error('❌ Lỗi kết nối MongoDB:', err.message);
        process.exit(1);
    });
