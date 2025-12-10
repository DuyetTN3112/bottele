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
const telegramRoutes = require('./routes/telegram');

// Import services
const { setWebhook, startBackgroundJobs } = require('./services/notification');
const { connectSheet } = require('./services/googleSheet');

const app = express();

// ================= CẤU HÌNH =================
const PORT = process.env.PORT || 3000;
const DB_URL = process.env.DB_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_secret_key';
const SHEET_ID = process.env.SHEET_ID;

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
// Trang chủ - Dashboard đơn giản
app.get('/', (req, res) => {
    const serverUrl = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FansipanLab Bot Dashboard</title>
            <style>
                body { font-family: sans-serif; background-color: #121212; color: #fff; text-align: center; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; }
                .card { background: #1e1e1e; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #333; }
                h1 { color: #0088cc; }
                .btn { display: block; width: 100%; padding: 12px; margin: 10px 0; border-radius: 5px; text-decoration: none; color: white; font-weight: bold; box-sizing: border-box; }
                .btn-sheet { background: #0f9d58; }
                .btn-tele { background: #0088cc; }
                .btn-shop { background: #ff5722; }
                .status { color: #00c853; font-weight: bold; }
                .link-info { color: #888; font-size: 0.9em; word-break: break-all;}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h1>🤖 Bot FansipanLab</h1>
                    <p>Trạng thái: <span class="status">● Đang chạy (Node.js)</span></p>
                    <p class="link-info">Server URL: ${serverUrl}</p>
                </div>
                <div class="card">
                    <a href="https://docs.google.com/spreadsheets/d/${SHEET_ID}" target="_blank" class="btn btn-sheet">📊 Mở Google Sheet</a>
                    <a href="https://t.me/noti_task_bot" target="_blank" class="btn btn-tele">💬 Chat với Bot</a>
                    <a href="/shop" class="btn btn-shop">🛒 Vào Shop</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.use('/auth', authRoutes);
app.use('/shop', shopRoutes);
app.use('/admin', adminRoutes);
app.use('/telegram', telegramRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ================= KẾT NỐI DATABASE & CHẠY SERVER =================
mongoose.connect(DB_URL)
    .then(async () => {
        console.log('✅ Đã kết nối MongoDB thành công!');
        
        // Kết nối Google Sheets
        await connectSheet();
        
        app.listen(PORT, async () => {
            console.log('='.repeat(50));
            console.log('🚀 KHỞI ĐỘNG BOT THÔNG BÁO (Node.js)');
            console.log('='.repeat(50));
            console.log(`🌐 Server đang chạy tại: http://localhost:${PORT}`);
            console.log(`📝 Đăng ký: http://localhost:${PORT}/auth/register`);
            console.log(`🔐 Đăng nhập: http://localhost:${PORT}/auth/login`);
            console.log(`📊 Sheet ID: ${SHEET_ID || 'Chưa cấu hình'}`);
            console.log('='.repeat(50));
            
            // Set webhook Telegram
            await setWebhook();
            
            // Khởi động background jobs
            startBackgroundJobs();
        });
    })
    .catch((err) => {
        console.error('❌ Lỗi kết nối MongoDB:', err.message);
        process.exit(1);
    });
