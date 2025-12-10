/**
 * Telegram Webhook Routes
 * Xử lý tất cả webhook từ Telegram (thay thế Python bot)
 */

const express = require('express');
const router = express.Router();
const { sendTelegram } = require('../services/notification');
const { addUserToSheet, isUserRegistered } = require('../services/googleSheet');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BOT_PASSWORD = process.env.BOT_PASSWORD;

/**
 * Webhook nhận tin nhắn từ Telegram
 * Route: POST /telegram/:token
 */
router.post(`/${TELEGRAM_TOKEN}`, async (req, res) => {
    try {
        const update = req.body;
        
        if (!update || !update.message) {
            return res.status(200).send('OK');
        }
        
        const msg = update.message;
        const chatId = msg.chat.id.toString();
        const chatType = msg.chat.type;
        const text = (msg.text || '').trim();
        const name = msg.chat.title || msg.from?.first_name || 'User';
        
        // ========== XỬ LÝ GROUP ==========
        if (chatType === 'group' || chatType === 'supergroup') {
            const isRegistered = await isUserRegistered(chatId);
            
            if (!isRegistered) {
                const added = await addUserToSheet(chatId, name, 'Group');
                if (added) {
                    await sendTelegram(chatId, '✅ Group đã được đăng ký nhận thông báo!');
                    console.log(`✅ Group mới đăng ký: ${name} (${chatId})`);
                }
            }
            return res.status(200).send('OK');
        }
        
        // ========== XỬ LÝ PRIVATE CHAT ==========
        if (chatType === 'private') {
            const isRegistered = await isUserRegistered(chatId);
            
            // Lệnh /login password
            if (text === `/login ${BOT_PASSWORD}`) {
                if (!isRegistered) {
                    const added = await addUserToSheet(chatId, name, 'User');
                    if (added) {
                        await sendTelegram(chatId, 
                            '✅ Đăng ký thành công!\n\n' +
                            'Bạn sẽ nhận được thông báo khi có đơn hàng mới hoặc sản phẩm mới.'
                        );
                        console.log(`✅ User mới đăng ký: ${name} (${chatId})`);
                    }
                } else {
                    await sendTelegram(chatId, '⚠️ Bạn đã đăng ký rồi.');
                }
            }
            // Lệnh /start
            else if (text.startsWith('/start')) {
                if (!isRegistered) {
                    await sendTelegram(chatId, 
                        `🔒 *Bot riêng tư*\n\n` +
                        `Vui lòng đăng ký bằng lệnh:\n` +
                        `\`/login ${BOT_PASSWORD}\``
                    );
                } else {
                    await sendTelegram(chatId, '👋 Bạn đang online và đã đăng ký nhận thông báo.');
                }
            }
            // Lệnh /help
            else if (text.startsWith('/help')) {
                await sendTelegram(chatId,
                    '📖 *Hướng dẫn sử dụng*\n\n' +
                    '• `/start` - Kiểm tra trạng thái\n' +
                    '• `/login password` - Đăng ký nhận thông báo\n' +
                    '• `/help` - Xem hướng dẫn'
                );
            }
        }
        
    } catch (err) {
        console.error('❌ Webhook error:', err.message);
    }
    
    res.status(200).send('OK');
});

/**
 * Health check cho Telegram webhook
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        telegram: TELEGRAM_TOKEN ? 'configured' : 'missing',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
