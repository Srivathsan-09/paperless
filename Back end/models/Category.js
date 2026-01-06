const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    parentCategory: {
        type: String,
        required: true,
        // Daily Expenses, Groceries, Health, etc.
    },
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['milk', 'general'],
        default: 'general'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Category', categorySchema);
