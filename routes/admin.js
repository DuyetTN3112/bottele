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

// Trang admin dashboard
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

// Thêm sản phẩm
router.post('/product/add', isAdmin, async (req, res) => {
    try {
        const { name, price, description, image } = req.body;
        const product = new Product({ 
            name, 
            price: Number(price), 
            description, 
            image: image || '📦' 
        });
        await product.save();
        res.redirect('/admin');
    } catch (err) {
        res.redirect('/admin');
    }
});

// Xóa sản phẩm
router.post('/product/delete/:id', isAdmin, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (err) {
        res.redirect('/admin');
    }
});

// Xóa user
router.post('/user/delete/:id', isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (err) {
        res.redirect('/admin');
    }
});

module.exports = router;
