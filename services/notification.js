const axios = require('axios');
const cron = require('node-cron');
const Order = require('../models/Order');
const TelegramUser = require('../models/TelegramUser');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

async function sendTelegram(chatId, message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
        return true;
    } catch (err) {
        return false;
    }
}

async function getRecipients() {
    try {
        const users = await TelegramUser.find();
        return users.map(u => ({ chatId: u.chatId, username: u.username }));
    } catch (err) {
        return [];
    }
}

async function sendNotificationToAll(message) {
    const recipients = await getRecipients();
    let count = 0;
    for (const r of recipients) {
        if (await sendTelegram(r.chatId, message)) count++;
    }
    return count;
}

async function sendNewProductNotification(product, createdBy) {
    const msg = `*SAN PHAM MOI*
Ten: ${product.name}
Gia: ${product.price.toLocaleString('vi-VN')} VND
Partner: ${createdBy}`;
    return await sendNotificationToAll(msg);
}

async function monitorOrders() {
    try {
        const orders = await Order.find({ notified: { $ne: true } })
            .populate('user', 'username')
            .populate('product', 'name price');

        if (orders.length === 0) return;

        const recipients = await getRecipients();
        if (recipients.length === 0) return;

        for (const order of orders) {
            const msg = `*DON HANG MOI*
User: ${order.user?.username || '-'}
San pham: ${order.product?.name || '-'}
Gia: ${order.totalPrice?.toLocaleString('vi-VN') || '0'} VND`;

            for (const r of recipients) {
                await sendTelegram(r.chatId, msg);
            }
            await Order.findByIdAndUpdate(order._id, { notified: true });
        }
    } catch (err) { }
}

async function setWebhook() {
    const serverUrl = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL;
    if (!serverUrl || !TELEGRAM_TOKEN) return false;

    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
            url: `${serverUrl}/telegram/${TELEGRAM_TOKEN}`
        });
        return true;
    } catch (err) {
        return false;
    }
}

function startBackgroundJobs() {
    cron.schedule('*/5 * * * * *', async () => {
        await monitorOrders();
    });
}

module.exports = {
    sendTelegram,
    sendNotificationToAll,
    sendNewProductNotification,
    monitorOrders,
    setWebhook,
    startBackgroundJobs
};
