const express = require('express');
const router = express.Router();
const Entry = require('../models/Entry');
const Category = require('../models/Category');
const verifyToken = require('../middleware/verifyToken');

// @route   POST /api/entries
// @desc    Save entry from any “Save” button in UI
router.post('/', verifyToken, async (req, res) => {
    try {
        const { categoryId, amount, date, itemName, notes, quantity, metadata, pricePerLitre, morningLitres, nightLitres } = req.body;

        const newEntry = new Entry({
            userId: req.user._id,
            categoryId,
            amount,
            date,
            itemName,
            notes,
            quantity,
            metadata,
            pricePerLitre,
            morningLitres,
            nightLitres
        });

        const entry = await newEntry.save();
        res.json(entry);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/entries/:id
// @desc    Update a specific entry
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const { amount, date, itemName, notes, quantity, metadata, pricePerLitre, morningLitres, nightLitres } = req.body;

        const entry = await Entry.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            {
                $set: {
                    amount,
                    date,
                    itemName,
                    notes,
                    quantity,
                    metadata,
                    pricePerLitre,
                    morningLitres,
                    nightLitres
                }
            },
            { new: true }
        );

        if (!entry) {
            return res.status(404).json({ message: 'Entry not found' });
        }

        res.json(entry);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/entries?categoryId=...
// @desc    Fetch recent entries for a category
router.get('/', verifyToken, async (req, res) => {
    try {
        const { categoryId, type, month, parentCategory } = req.query;
        let query = { userId: req.user._id };

        if (categoryId) {
            query.categoryId = categoryId;
            const entries = await Entry.find(query).sort({ date: -1 }).limit(10);
            return res.json(entries);
        }

        if (type === 'milk') {
            const milkCategory = await Category.findOne({ userId: req.user._id, type: 'milk' });
            if (!milkCategory) {
                return res.json({ entries: [], totalLitres: 0, totalAmount: 0, averageSpend: 0 });
            }

            query.categoryId = milkCategory._id;

            const { start, end, month } = req.query;

            if (start && end) {
                query.date = { $gte: new Date(start), $lte: new Date(new Date(end).setUTCHours(23, 59, 59, 999)) };
            } else if (month) {
                const parts = month.split('-');
                const yearNum = parseInt(parts[0]);
                const monthNum = parseInt(parts[1]) - 1;
                const startDate = new Date(Date.UTC(yearNum, monthNum, 1));
                const endDate = new Date(Date.UTC(yearNum, monthNum + 1, 0, 23, 59, 59, 999));
                query.date = { $gte: startDate, $lte: endDate };
            }

            const entries = await Entry.find(query).sort({ date: 1 });

            const totalLitres = entries.reduce((sum, entry) => sum + (entry.quantity || 0), 0);
            const totalAmount = entries.reduce((sum, entry) => sum + entry.amount, 0);
            const averageSpend = entries.length > 0 ? totalAmount / entries.length : 0;

            return res.json({
                entries,
                totalLitres,
                totalAmount,
                averageSpend,
                categoryId: milkCategory._id
            });
        }

        if (parentCategory) {
            // Fetch all entries under a parent category
            const categories = await Category.find({ userId: req.user._id, parentCategory });
            const categoryIds = categories.map(c => c._id);

            query.categoryId = { $in: categoryIds };

            if (month) {
                const parts = month.split('-');
                const yearNum = parseInt(parts[0]);
                const monthNum = parseInt(parts[1]) - 1;
                const startDate = new Date(Date.UTC(yearNum, monthNum, 1));
                const endDate = new Date(Date.UTC(yearNum, monthNum + 1, 0, 23, 59, 59, 999));
                query.date = { $gte: startDate, $lte: endDate };
            }

            const entries = await Entry.find(query).sort({ date: -1 });
            return res.json(entries);
        }

        // Add support for fetching ALL entries for a month (used by Dashboard Summary)
        if (month && !categoryId && !type && !parentCategory) {
            const parts = month.split('-');
            const yearNum = parseInt(parts[0]);
            const monthNum = parseInt(parts[1]) - 1;
            const startDate = new Date(Date.UTC(yearNum, monthNum, 1));
            const endDate = new Date(Date.UTC(yearNum, monthNum + 1, 0, 23, 59, 59, 999));
            query.date = { $gte: startDate, $lte: endDate };

            const entries = await Entry.find(query).sort({ date: -1 });
            return res.json(entries);
        }

        res.status(400).json({ message: 'Invalid query parameters' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/entries/:id
// @desc    Delete a specific entry
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const entry = await Entry.findOne({ _id: req.params.id, userId: req.user._id });
        if (!entry) {
            return res.status(404).json({ message: 'Entry not found' });
        }

        await Entry.deleteOne({ _id: req.params.id });
        res.json({ message: 'Entry deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;
