const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Middleware kiểm tra admin
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.redirect('/auth/login');
}

// Trang Admin Dashboard - Chỉ xem danh sách
router.get('/', isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        const products = await Product.find();
        const orders = await Order.find().populate('user', 'username').populate('product', 'name price');

        const stats = {
            totalUsers: users.length,
            totalProducts: products.length,
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, o) => sum + o.totalPrice, 0)
        };

        res.render('admin', { user: req.session.user, users, products, orders, stats, message: null });
    } catch (err) {
        res.render('admin', { user: req.session.user, users: [], products: [], orders: [], stats: {}, message: 'Lỗi!' });
    }
});

module.exports = router;
