const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const { sendNotificationToAll } = require('./telegram');

// Middleware kiểm tra đăng nhập
function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/auth/login');
}

// Trang shop - hiển thị sản phẩm
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const products = await Product.find();
        res.render('shop', { user: req.session.user, products, message: null });
    } catch (err) {
        res.render('shop', { user: req.session.user, products: [], message: 'Lỗi tải sản phẩm!' });
    }
});

// Mua sản phẩm
router.post('/buy/:productId', isAuthenticated, async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId);
        if (!product) {
            return res.redirect('/shop');
        }

        // Tạo đơn hàng
        const order = new Order({
            user: req.session.user.id,
            product: product._id,
            quantity: 1,
            totalPrice: product.price
        });
        await order.save();

        // Gửi thông báo Telegram đến TẤT CẢ người đã đăng ký
        const message = `🛒 *ĐƠN HÀNG MỚI!*\n━━━━━━━━━━\n👤 *User:* ${req.session.user.username}\n📦 *Sản phẩm:* ${product.name}\n💰 *Giá:* ${product.price.toLocaleString('vi-VN')} VND\n🕐 *Thời gian:* ${new Date().toLocaleString('vi-VN')}`;
        sendNotificationToAll(message);

        const products = await Product.find();
        res.render('shop', { 
            user: req.session.user, 
            products, 
            message: `✅ Đã mua thành công: ${product.name}!` 
        });
    } catch (err) {
        console.error(err);
        res.redirect('/shop');
    }
});

module.exports = router;
