const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, default: '' },
    image: { type: String, default: '📦' }, // Emoji làm hình ảnh đơn giản
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
