const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Trang đăng nhập
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/shop');
    }
    res.render('login', { error: null });
});

// Xử lý đăng nhập
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user || !user.comparePassword(password)) {
            return res.render('login', { error: 'Sai tên đăng nhập hoặc mật khẩu!' });
        }

        req.session.user = { id: user._id, username: user.username, role: user.role };
        res.redirect(user.role === 'admin' ? '/admin' : '/shop');
    } catch (err) {
        res.render('login', { error: 'Đã xảy ra lỗi!' });
    }
});

// Trang đăng ký
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/shop');
    }
    res.render('register', { error: null });
});

// Xử lý đăng ký
router.post('/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.render('register', { error: 'Tên đăng nhập đã tồn tại!' });
        }

        const user = new User({ username, password, role: role || 'user' });
        await user.save();
        
        res.redirect('/auth/login');
    } catch (err) {
        res.render('register', { error: 'Đã xảy ra lỗi!' });
    }
});

// Đăng xuất
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

module.exports = router;
