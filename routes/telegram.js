const express = require('express');
const router = express.Router();
const { sendTelegram } = require('../services/notification');
const User = require('../models/User');
const TelegramUser = require('../models/TelegramUser');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

router.post(`/${TELEGRAM_TOKEN}`, async (req, res) => {
    try {
        const update = req.body;
        if (!update || !update.message) return res.status(200).send('OK');

        const msg = update.message;
        const chatId = msg.chat.id.toString();
        const chatType = msg.chat.type;
        const text = (msg.text || '').trim();

        if (chatType !== 'private') return res.status(200).send('OK');

        if (text.startsWith('/start')) {
            const existing = await TelegramUser.findOne({ chatId });
            if (existing) {
                await sendTelegram(chatId, `Da dang ky: ${existing.username}`);
            } else {
                await sendTelegram(chatId, `Dang nhap: /login <username> <password>`);
            }
        }
        else if (text.startsWith('/login ')) {
            const parts = text.split(' ');
            if (parts.length < 3) {
                await sendTelegram(chatId, 'Sai cu phap: /login <username> <password>');
                return res.status(200).send('OK');
            }

            const username = parts[1];
            const password = parts[2];

            const user = await User.findOne({ username });
            if (!user || !user.comparePassword(password)) {
                await sendTelegram(chatId, 'Sai username hoac password');
                return res.status(200).send('OK');
            }

            if (!['admin', 'partner'].includes(user.role)) {
                await sendTelegram(chatId, 'Chi admin/partner duoc nhan thong bao');
                return res.status(200).send('OK');
            }

            await TelegramUser.findOneAndUpdate(
                { chatId },
                { chatId, username: user.username },
                { upsert: true, new: true }
            );

            await sendTelegram(chatId, `Dang ky thanh cong: ${user.username} (${user.role})`);
        }
        else if (text.startsWith('/help')) {
            await sendTelegram(chatId, `/start - Kiem tra\n/login <user> <pass> - Dang ky\n/help - Huong dan`);
        }
    } catch (err) { }

    res.status(200).send('OK');
});

router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

module.exports = router;
