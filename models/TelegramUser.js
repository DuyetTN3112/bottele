const mongoose = require('mongoose');

const telegramUserSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    username: { type: String, required: true }, // username của admin trong hệ thống
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TelegramUser', telegramUserSchema);
