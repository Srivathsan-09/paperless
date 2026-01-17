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

// @route   GET /api/categories
// @desc    Fetch categories for a section (and seed if missing)
router.get('/', verifyToken, async (req, res) => {
    try {
        const { parent, dashboard } = req.query;
        // Base query for the user
        let query = { userId: req.user._id };

        // Optimization: Filter at database level
        if (parent) {
            query.parentCategory = parent;
        } else if (dashboard === 'true') {
            // Dashboard: Exclude Miscellaneous and Savings
            query.parentCategory = { $nin: ['Miscellaneous', 'Savings'] };
        }

        let categories = await Category.find(query).sort({ createdAt: 1 });

        // Robust Seeding: Check for missing defaults and add them
        // Only run seeding if we are NOT in a specific filtered view (or if it's dashboard view where we might miss top-level seeds?)
        // Actually, seeding usually checks for sub-items.
        // If we are filtering by parent, we might miss the fact that we need to seed the PARENT. 
        // But defaults are flat items.

        // Strategy: Fetch ALL only if we need to check usage for seeding (rare).
        // Or better: Just check if the current result set is empty and we expected something?
        // For performance, we skip the "fetch all to check seed" on every dashboard load.
        // We only seed if the user has ZERO categories total (new user).

        // To check "user has zero categories" efficiently without fetching all:
        const count = await Category.countDocuments({ userId: req.user._id });

        if (count === 0) {
            const seedList = DEFAULTS;
            const seedData = seedList.map(d => ({ ...d, userId: req.user._id }));
            await Category.insertMany(seedData);
            // Re-fetch with original query
            categories = await Category.find(query).sort({ createdAt: 1 });
        } else {
            // Existing user: Check for critical missing folders (Misc/Savings)
            // ONLY if we are querying broadly (e.g. dashboard) or specifically for them.
            // If I am querying 'dashboard=true', I explicitly EXCLUDE Misc/Savings, so I won't see them anyway.
            // So seeding them here is moot for the response, but good for data integrity.
            // Let's skip complex partial seeding on every request to save time.
        }

        res.json(categories);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/categories/:id
// @desc    Update category (Rename)
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const { name } = req.body;
        let category = await Category.findOne({ _id: req.params.id, userId: req.user._id });

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        if (name) category.name = name;

        await category.save();
        res.json(category);
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
