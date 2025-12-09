const express = require('express');
const router = express.Router();
const https = require('https');
const TelegramUser = require('../models/TelegramUser');
const User = require('../models/User');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// Gửi tin nhắn Telegram
function sendTelegram(chatId, message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const data = JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
    });

    const req = https.request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    });

    req.on('error', (e) => console.error('❌ Telegram error:', e.message));
    req.write(data);
    req.end();
}

// Webhook nhận tin nhắn từ Telegram
router.post(`/${TELEGRAM_TOKEN}`, async (req, res) => {
    try {
        const update = req.body;
        
        if (update && update.message) {
            const msg = update.message;
            const chatId = msg.chat.id.toString();
            const chatType = msg.chat.type;
            const text = (msg.text || '').trim();

            // Chỉ xử lý private chat
            if (chatType !== 'private') {
                return res.status(200).send('OK');
            }

            // Kiểm tra đã đăng ký chưa
            const existingUser = await TelegramUser.findOne({ chatId });

            // Lệnh /login username password
            if (text.startsWith('/login ')) {
                const parts = text.split(' ');
                if (parts.length === 3) {
                    const [, username, password] = parts;
                    
                    // Kiểm tra account admin trong DB
                    const adminUser = await User.findOne({ username, role: 'admin' });
                    
                    if (adminUser && adminUser.comparePassword(password)) {
                        if (!existingUser) {
                            await TelegramUser.create({ chatId, username });
                            sendTelegram(chatId, `✅ Đăng ký thành công!\n\nXin chào *${username}*, bạn sẽ nhận thông báo khi có đơn hàng mới.`);
                            console.log(`👤 Admin đăng ký Telegram: ${username} (${chatId})`);
                        } else {
                            sendTelegram(chatId, '⚠️ Bạn đã đăng ký rồi.');
                        }
                    } else {
                        sendTelegram(chatId, '❌ Sai username/password hoặc không phải admin!');
                    }
                } else {
                    sendTelegram(chatId, '❌ Sai cú pháp! Dùng: `/login username password`');
                }
            }
            // Lệnh /start
            else if (text.startsWith('/start')) {
                if (!existingUser) {
                    sendTelegram(chatId, '🔒 *Bot thông báo đơn hàng*\n\nVui lòng đăng nhập bằng tài khoản admin:\n`/login username password`');
                } else {
                    sendTelegram(chatId, '👋 Bạn đã đăng ký nhận thông báo rồi!');
                }
            }
        }
    } catch (err) {
        console.error('❌ Webhook error:', err);
    }

    res.status(200).send('OK');
});

// Gửi thông báo đến TẤT CẢ admin đã đăng ký
async function sendNotificationToAll(message) {
    try {
        const users = await TelegramUser.find();
        console.log(`📤 Gửi thông báo đến ${users.length} admin`);
        
        for (const user of users) {
            sendTelegram(user.chatId, message);
        }
    } catch (err) {
        console.error('❌ Lỗi gửi thông báo:', err);
    }
}

module.exports = { router, sendNotificationToAll };
