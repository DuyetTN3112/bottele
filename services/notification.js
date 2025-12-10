/**
 * Notification Service - Background Job
 * Thay thế hoàn toàn logic Python monitor_all() bằng Node.js
 */

const axios = require('axios');
const cron = require('node-cron');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { getRecipientsFromSheet, getProductsFromSheet, getProductRowCount } = require('./googleSheet');

// Biến môi trường
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// Lưu số dòng cuối cùng để phát hiện sản phẩm mới từ Sheet
let lastProductRowCount = 0;

/**
 * Gửi tin nhắn Telegram
 * @param {string} chatId 
 * @param {string} message 
 */
async function sendTelegram(chatId, message) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
        return true;
    } catch (err) {
        console.error(`❌ Lỗi gửi Telegram tới ${chatId}:`, err.message);
        return false;
    }
}

/**
 * Gửi thông báo đến tất cả recipients
 * @param {string} message 
 */
async function sendNotificationToAll(message) {
    const recipients = await getRecipientsFromSheet();
    console.log(`📤 Gửi thông báo đến ${recipients.length} người`);
    
    let successCount = 0;
    for (const recipient of recipients) {
        const success = await sendTelegram(recipient.chatId, message);
        if (success) successCount++;
    }
    
    return successCount;
}

/**
 * Quét MongoDB tìm đơn hàng mới chưa thông báo
 */
async function monitorOrders() {
    try {
        // Tìm đơn hàng chưa thông báo và populate thông tin
        const orders = await Order.find({ notified: { $ne: true } })
            .populate('user', 'username')
            .populate('product', 'name price');
        
        if (orders.length === 0) return;
        
        console.log(`🛒 Tìm thấy ${orders.length} đơn hàng mới chưa thông báo`);
        
        // Lấy danh sách recipients từ Sheet
        const recipients = await getRecipientsFromSheet();
        if (recipients.length === 0) {
            console.log('⚠️ Không có recipients, bỏ qua thông báo');
            return;
        }
        
        for (const order of orders) {
            // Format thời gian
            const timeStr = order.createdAt 
                ? order.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                : new Date().toLocaleString('vi-VN');
            
            // Format giá tiền
            const priceStr = order.totalPrice 
                ? order.totalPrice.toLocaleString('vi-VN')
                : '0';
            
            const msg = `🛒 *ĐƠN HÀNG MỚI!*
━━━━━━━━━━
👤 *User:* ${order.user?.username || 'N/A'}
📦 *Sản phẩm:* ${order.product?.name || 'N/A'}
💰 *Giá:* ${priceStr} VND
🕐 *Thời gian:* ${timeStr}`;
            
            // Gửi cho tất cả recipients
            let sentCount = 0;
            for (const recipient of recipients) {
                const success = await sendTelegram(recipient.chatId, msg);
                if (success) sentCount++;
            }
            
            // Đánh dấu đã thông báo
            await Order.findByIdAndUpdate(order._id, { notified: true });
            console.log(`✅ Đã thông báo đơn hàng ${order._id} đến ${sentCount} người`);
        }
    } catch (err) {
        console.error('⚠️ Lỗi quét đơn hàng:', err.message);
    }
}

/**
 * Quét Google Sheet tìm sản phẩm mới
 * Cấu trúc sheet: Dấu thời gian | Tên sản phẩm | Giá tiền
 */
async function monitorSheet() {
    try {
        const currentRowCount = await getProductRowCount();
        
        if (currentRowCount > lastProductRowCount && lastProductRowCount > 0) {
            console.log(`🔥 Có ${currentRowCount - lastProductRowCount} sản phẩm mới từ Sheet!`);
            
            // Lấy danh sách recipients
            const recipients = await getRecipientsFromSheet();
            if (recipients.length === 0) {
                lastProductRowCount = currentRowCount;
                return;
            }
            
            // Lấy products từ Sheet
            const products = await getProductsFromSheet();
            
            // Lấy các sản phẩm mới (từ vị trí lastProductRowCount)
            const newProducts = products.slice(lastProductRowCount);
            
            for (const productData of newProducts) {
                // Lưu vào MongoDB
                let savedProduct = null;
                try {
                    savedProduct = await Product.create({
                        name: productData.name,
                        price: productData.price,
                        description: '', // Không có description trong sheet mới
                        image: '📦'      // Default emoji
                    });
                    console.log(`✅ Đã lưu sản phẩm vào MongoDB: ${productData.name}`);
                } catch (err) {
                    console.error(`⚠️ Lỗi lưu product: ${err.message}`);
                }
                
                // Format giá
                const priceStr = productData.price 
                    ? productData.price.toLocaleString('vi-VN')
                    : 'Liên hệ';
                
                // Sử dụng timestamp từ Sheet hoặc thời gian hiện tại
                const timeStr = productData.timestamp || new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                
                let msg = `📦 *SẢN PHẨM MỚI!*
━━━━━━━━━━
🏷️ *Tên:* ${productData.name}
💰 *Giá:* ${priceStr} VND
🕐 *Thời gian:* ${timeStr}`;
                
                if (savedProduct) {
                    msg += `\n\n✅ Đã thêm vào hệ thống!`;
                }
                
                // Gửi thông báo
                let sentCount = 0;
                for (const recipient of recipients) {
                    const success = await sendTelegram(recipient.chatId, msg);
                    if (success) sentCount++;
                }
                console.log(`✅ Đã gửi thông báo sản phẩm '${productData.name}' đến ${sentCount} người`);
            }
        }
        
        lastProductRowCount = currentRowCount;
    } catch (err) {
        console.error('⚠️ Lỗi quét Sheet:', err.message);
    }
}

/**
 * Set webhook Telegram
 */
async function setWebhook() {
    const serverUrl = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL;
    
    if (!serverUrl || !TELEGRAM_TOKEN) {
        console.log('⚠️ Thiếu SERVER_URL hoặc TELEGRAM_TOKEN, bỏ qua set webhook');
        return false;
    }
    
    try {
        const webhookUrl = `${serverUrl}/telegram/${TELEGRAM_TOKEN}`;
        const apiUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`;
        
        const response = await axios.post(apiUrl, { url: webhookUrl });
        
        if (response.data.ok) {
            console.log(`✅ Đã set webhook thành công: ${webhookUrl}`);
            return true;
        } else {
            console.error('❌ Lỗi set webhook:', response.data.description);
            return false;
        }
    } catch (err) {
        console.error('❌ Lỗi kết nối Telegram:', err.message);
        return false;
    }
}

/**
 * Khởi động background jobs
 */
function startBackgroundJobs() {
    console.log('🚀 Khởi động Background Jobs...');
    
    // Khởi tạo số dòng ban đầu từ Sheet
    getProductRowCount().then(count => {
        lastProductRowCount = count;
        console.log(`📊 Sheet product - Dữ liệu ban đầu: ${count} dòng`);
    });
    
    // Đếm đơn hàng chờ thông báo
    Order.countDocuments({ notified: { $ne: true } }).then(count => {
        console.log(`📊 MongoDB - Đơn hàng chờ thông báo: ${count}`);
    });
    
    // Chạy job mỗi 5 giây
    cron.schedule('*/5 * * * * *', async () => {
        await monitorOrders();
        await monitorSheet();
    });
    
    console.log('✅ Background jobs đã khởi động (quét mỗi 5 giây)');
}

module.exports = {
    sendTelegram,
    sendNotificationToAll,
    monitorOrders,
    monitorSheet,
    setWebhook,
    startBackgroundJobs
};
