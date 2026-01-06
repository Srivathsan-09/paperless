const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Entry = require('../models/Entry');
const verifyToken = require('../middleware/verifyToken');

const DEFAULTS = [
    { parentCategory: 'Daily Expenses', name: 'Milk', type: 'milk' },
    { parentCategory: 'Daily Expenses', name: 'Newspaper', type: 'general' },
    { parentCategory: 'Daily Expenses', name: 'Fruits & Vegetables', type: 'general' },
    { parentCategory: 'Daily Expenses', name: 'Water Can', type: 'general' },
    { parentCategory: 'Utilities & Bills', name: 'EB Bill', type: 'general' },
    { parentCategory: 'Utilities & Bills', name: 'Mobile Recharge', type: 'general' },
    { parentCategory: 'Utilities & Bills', name: 'Internet/Wi-Fi', type: 'general' },
    { parentCategory: 'Utilities & Bills', name: 'Gas Cylinder', type: 'general' },
    { parentCategory: 'Groceries', name: 'Supermarket / Monthly Shopping', type: 'general' },
    { parentCategory: 'Groceries', name: 'Local Grocery Store', type: 'general' },
    { parentCategory: 'Groceries', name: 'Dairy Products', type: 'general' },

    // Miscellaneous Defaults
    { parentCategory: 'Miscellaneous', name: 'Travel', type: 'general' },
    { parentCategory: 'Miscellaneous', name: 'Function / Gift', type: 'general' },
    { parentCategory: 'Miscellaneous', name: 'Donations', type: 'general' },
    { parentCategory: 'Miscellaneous', name: 'Happy Plates', type: 'general' },

    // Savings Defaults (Mandatory)
    { parentCategory: 'Savings', name: 'PPF', type: 'general' },
    { parentCategory: 'Savings', name: 'RD', type: 'general' },
    { parentCategory: 'Savings', name: 'LIC', type: 'general' },
    { parentCategory: 'Savings', name: 'GOLDCHIT', type: 'general' },
    { parentCategory: 'Savings', name: 'FD', type: 'general' }
];


// @route   POST /api/categories
// @desc    Add new category for logged-in user
router.post('/', verifyToken, async (req, res) => {
    try {
        const { parentCategory, name, type } = req.body;

        const newCategory = new Category({
            userId: req.user._id,
            parentCategory,
            name,
            type: type || 'general'
        });

        const category = await newCategory.save();
        res.json(category);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/categories?parent=Daily Expenses
// @desc    Fetch categories for a section (and seed if missing)
router.get('/', verifyToken, async (req, res) => {
    try {
        const { parent } = req.query;
        let query = { userId: req.user._id };

        let categories = await Category.find(query).sort({ createdAt: 1 });

        // Robust Seeding: Check for missing defaults and add them
        // Robust Seeding Logic: 
        // 1. If User has 0 categories (New User) -> Seed ALL defaults.
        // 2. If User has categories (Existing User) -> Only seed NEW MANDATORY features (Misc/Savings) if missing.
        //    Do NOT re-seed generic defaults (like 'Local Grocery Store') if missing, as user likely deleted them.

        let seedList = [];
        if (categories.length === 0) {
            seedList = DEFAULTS;
        } else {
            // Check only for critical structural updates
            const criticalParents = ['Miscellaneous', 'Savings'];
            seedList = DEFAULTS.filter(def =>
                criticalParents.includes(def.parentCategory) &&
                !categories.some(cat => cat.name === def.name && cat.parentCategory === def.parentCategory)
            );
        }

        if (seedList.length > 0) {
            const seedData = seedList.map(d => ({ ...d, userId: req.user._id }));
            await Category.insertMany(seedData);
            // Re-fetch to include seeded items
            categories = await Category.find(query).sort({ createdAt: 1 });
        }

        if (parent) {
            categories = categories.filter(c => c.parentCategory === parent);
        }

        res.json(categories);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/categories/:id
// @desc    Delete category and its entries
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const category = await Category.findOne({ _id: req.params.id, userId: req.user._id });
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // Delete associated entries
        await Entry.deleteMany({ categoryId: req.params.id, userId: req.user._id });
        await Category.deleteOne({ _id: req.params.id });

        res.json({ message: 'Category and entries deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});


module.exports = router;
