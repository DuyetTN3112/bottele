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
        // Lấy tất cả products từ Sheet
        const products = await getProductsFromSheet();
        const currentRowCount = products.length;
        
        if (currentRowCount > lastProductRowCount && lastProductRowCount > 0) {
            console.log(`🔥 Có ${currentRowCount - lastProductRowCount} sản phẩm mới từ Sheet!`);
            
            // Lấy danh sách recipients
            const recipients = await getRecipientsFromSheet();
            
            // Lấy các sản phẩm mới (từ vị trí lastProductRowCount)
            const newProducts = products.slice(lastProductRowCount);
            
            for (const productData of newProducts) {
                // Kiểm tra sản phẩm đã tồn tại trong MongoDB chưa
                const existingProduct = await Product.findOne({ name: productData.name });
                
                let savedProduct = null;
                if (existingProduct) {
                    // Cập nhật giá nếu cần
                    if (existingProduct.price !== productData.price) {
                        await Product.findByIdAndUpdate(existingProduct._id, { price: productData.price });
                        console.log(`🔄 Đã cập nhật sản phẩm: ${productData.name}`);
                    }
                    savedProduct = existingProduct;
                } else {
                    // Lưu sản phẩm mới vào MongoDB
                    try {
                        savedProduct = await Product.create({
                            name: productData.name,
                            price: productData.price,
                            description: '',
                            image: '📦'
                        });
                        console.log(`✅ Đã lưu sản phẩm vào MongoDB: ${productData.name}`);
                    } catch (err) {
                        console.error(`⚠️ Lỗi lưu product: ${err.message}`);
                    }
                }
                
                // Gửi thông báo nếu có recipients
                if (recipients.length > 0) {
                    const priceStr = productData.price 
                        ? productData.price.toLocaleString('vi-VN')
                        : 'Liên hệ';
                    
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
 * Đồng bộ tất cả sản phẩm từ Google Sheet vào MongoDB
 * Chạy khi khởi động server để đảm bảo dữ liệu đồng bộ
 */
async function syncAllProductsFromSheet() {
    try {
        console.log('🔄 Bắt đầu đồng bộ sản phẩm từ Google Sheet...');
        
        const products = await getProductsFromSheet();
        console.log(`📊 Tìm thấy ${products.length} sản phẩm trong Sheet`);
        
        if (products.length === 0) {
            console.log('⚠️ Không có sản phẩm nào trong Sheet');
            return;
        }
        
        let addedCount = 0;
        let existingCount = 0;
        
        for (const productData of products) {
            // Kiểm tra sản phẩm đã tồn tại chưa (theo tên)
            const existingProduct = await Product.findOne({ name: productData.name });
            
            if (existingProduct) {
                // Cập nhật giá nếu khác
                if (existingProduct.price !== productData.price) {
                    await Product.findByIdAndUpdate(existingProduct._id, { price: productData.price });
                    console.log(`🔄 Đã cập nhật giá sản phẩm: ${productData.name}`);
                }
                existingCount++;
            } else {
                // Thêm sản phẩm mới
                await Product.create({
                    name: productData.name,
                    price: productData.price,
                    description: '',
                    image: '📦'
                });
                addedCount++;
                console.log(`✅ Đã thêm sản phẩm mới: ${productData.name}`);
            }
        }
        
        console.log(`📊 Kết quả đồng bộ: ${addedCount} mới, ${existingCount} đã có`);
        
        // Cập nhật lastProductRowCount sau khi đồng bộ
        lastProductRowCount = products.length;
        
    } catch (err) {
        console.error('❌ Lỗi đồng bộ sản phẩm từ Sheet:', err.message);
    }
}

/**
 * Khởi động background jobs
 */
async function startBackgroundJobs() {
    console.log('🚀 Khởi động Background Jobs...');
    
    // QUAN TRỌNG: Đồng bộ tất cả sản phẩm từ Sheet vào MongoDB khi khởi động
    await syncAllProductsFromSheet();
    
    // Đếm đơn hàng chờ thông báo
    Order.countDocuments({ notified: { $ne: true } }).then(count => {
        console.log(`📊 MongoDB - Đơn hàng chờ thông báo: ${count}`);
    });
    
    // Đếm tổng sản phẩm trong DB
    Product.countDocuments().then(count => {
        console.log(`📊 MongoDB - Tổng sản phẩm: ${count}`);
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
    syncAllProductsFromSheet,
    setWebhook,
    startBackgroundJobs
};
