require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shop');
const adminRoutes = require('./routes/admin');
const partnerRoutes = require('./routes/partner');
const telegramRoutes = require('./routes/telegram');

const { setWebhook, startBackgroundJobs } = require('./services/notification');

const app = express();

const PORT = process.env.PORT || 3000;
const DB_URL = process.env.DB_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_secret_key';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: DB_URL,
        ttl: 24 * 60 * 60
    }),
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Dashboard</title>
            <style>
                body { font-family: sans-serif; background: #f5f5f5; padding: 40px; text-align: center; }
                .card { background: #fff; padding: 30px; border-radius: 5px; border: 1px solid #ddd; max-width: 400px; margin: 0 auto; }
                a { display: block; padding: 10px; margin: 10px 0; background: #333; color: #fff; text-decoration: none; border-radius: 3px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Bot Dashboard</h1>
                <p>Status: Running</p>
                <a href="/partner">Partner</a>
                <a href="/shop">Shop</a>
                <a href="/admin">Admin</a>
            </div>
        </body>
        </html>
    `);
});

app.use('/auth', authRoutes);
app.use('/shop', shopRoutes);
app.use('/admin', adminRoutes);
app.use('/partner', partnerRoutes);
app.use('/telegram', telegramRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

mongoose.connect(DB_URL)
    .then(async () => {
        app.listen(PORT, async () => {
            await setWebhook();
            startBackgroundJobs();
        });
    })
    .catch(() => {
        process.exit(1);
    });
