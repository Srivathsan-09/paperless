const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    amount: {
        type: Number, // This is totalCost
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    itemName: {
        type: String,
        required: true
    },
    notes: {
        type: String
    },
    // Milk/Generic specific
    quantity: {
        type: Number
    },
    pricePerLitre: {
        type: Number
    },
    morningLitres: {
        type: Number
    },
    nightLitres: {
        type: Number
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    paymentMode: {
        type: String,
        default: 'Cash'
    }
}, { timestamps: true });

module.exports = mongoose.model('Entry', entrySchema);
