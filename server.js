require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const https = require('https');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shop');
const adminRoutes = require('./routes/admin');
const { router: telegramRoutes } = require('./routes/telegram');

const app = express();

// ================= CẤU HÌNH =================
const PORT = process.env.PORT || 3000;
const DB_URL = process.env.DB_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_secret_key';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SERVER_URL = process.env.SERVER_URL;

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
app.use('/', telegramRoutes); // Webhook Telegram

// ================= TỰ ĐỘNG SET WEBHOOK TELEGRAM =================
function setWebhookAuto() {
    if (!SERVER_URL) {
        console.log('⚠️ SERVER_URL chưa được cấu hình (cần khi deploy để nhận thông báo Telegram)');
        return;
    }
    if (!TELEGRAM_TOKEN) {
        console.log('⚠️ Thiếu TELEGRAM_TOKEN');
        return;
    }

    const webhookUrl = `${SERVER_URL}/${TELEGRAM_TOKEN}`;
    const apiUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${webhookUrl}`;

    https.get(apiUrl, (res) => {
        if (res.statusCode === 200) {
            console.log(`✅ Đã set webhook Telegram: ${webhookUrl}`);
        } else {
            console.log(`❌ Lỗi set webhook: ${res.statusCode}`);
        }
    }).on('error', (e) => {
        console.error('❌ Lỗi kết nối Telegram:', e.message);
    });
}

// ================= KẾT NỐI DATABASE & CHẠY SERVER =================
mongoose.connect(DB_URL)
    .then(() => {
        console.log('✅ Đã kết nối MongoDB thành công!');
        
        // Set webhook Telegram
        setWebhookAuto();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
            console.log(`📝 Đăng ký: http://localhost:${PORT}/auth/register`);
            console.log(`🔐 Đăng nhập: http://localhost:${PORT}/auth/login`);
            console.log(`\n📱 Telegram Bot: /start rồi /login admin admin123`);
        });
    })
    .catch((err) => {
        console.error('❌ Lỗi kết nối MongoDB:', err.message);
        process.exit(1);
    });
