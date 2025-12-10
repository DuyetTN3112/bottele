const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { sendNewProductNotification } = require('../services/notification');

function isPartner(req, res, next) {
    if (req.session.user && req.session.user.role === 'partner') return next();
    res.redirect('/auth/login');
}

router.get('/', isPartner, async (req, res) => {
    try {
        const products = await Product.find({ createdBy: req.session.user.id });
        res.render('partner', { user: req.session.user, products, message: null });
    } catch (err) {
        res.render('partner', { user: req.session.user, products: [], message: 'Loi' });
    }
});

router.post('/product/add', isPartner, async (req, res) => {
    try {
        const { name, price, description } = req.body;
        const product = new Product({
            name,
            price: Number(price),
            description: description || '',
            createdBy: req.session.user.id
        });
        await product.save();
        await sendNewProductNotification(product, req.session.user.username);
        res.redirect('/partner');
    } catch (err) {
        res.redirect('/partner');
    }
});

module.exports = router;
