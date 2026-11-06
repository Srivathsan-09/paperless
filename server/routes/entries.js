const express = require('express');
const router = express.Router();
const Entry = require('../models/Entry');
const Category = require('../models/Category');
const AnalyticsUtils = require('../utils/analyticsUtils');
const verifyToken = require('../middleware/verifyToken');

// @route   POST /api/entries
// @desc    Save entry from any “Save” button in UI
router.post('/', verifyToken, async (req, res) => {
    try {
        const { categoryId, amount, date, itemName, notes, quantity, metadata, pricePerLitre, morningLitres, nightLitres, paymentMode } = req.body;

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
            nightLitres,
            paymentMode
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
        const { amount, date, itemName, notes, quantity, metadata, pricePerLitre, morningLitres, nightLitres, paymentMode } = req.body;

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
                    nightLitres,
                    paymentMode
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

            const { month } = req.query;
            if (month) {
                const parts = month.split('-');
                const yearNum = parseInt(parts[0]);
                const monthNum = parseInt(parts[1]) - 1;
                const startDate = new Date(Date.UTC(yearNum, monthNum, 1));
                const endDate = new Date(Date.UTC(yearNum, monthNum + 1, 0, 23, 59, 59, 999));
                query.date = { $gte: startDate, $lte: endDate };
            }

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

// @route   GET /api/entries/monthly-trend
// @desc    Fetch monthly spending trend for the logged-in user
router.get('/monthly-trend', verifyToken, async (req, res) => {
    try {
        const trend = await AnalyticsUtils.getMonthlyTrend(req.user._id);
        res.json(trend);
    } catch (err) {
        console.error('Error fetching monthly trend:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/entries/monthly-breakdown
// @desc    Fetch category & subcategory breakdown for a specific month for the logged-in user
router.get('/monthly-breakdown', verifyToken, async (req, res) => {
    try {
        const uid = req.user._id;
        const { year, month } = req.query;
        if (!year || !month) {
            return res.status(400).json({ success: false, message: 'Year and month are required' });
        }

        const yearNum = parseInt(year);
        const monthNum = parseInt(month);
        const startDay = new Date(Date.UTC(yearNum, monthNum - 1, 1));
        const endDay = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999));

        const allCategories = await Category.find({ userId: uid });
        const catMap = {};
        for (const c of allCategories) {
            catMap[c._id.toString()] = c;
        }

        const spending = await Entry.aggregate([
            {
                $match: {
                    userId: uid,
                    date: { $gte: startDay, $lte: endDay }
                }
            },
            {
                $group: {
                    _id: '$categoryId',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } }
        ]);

        let totalMonthSpending = 0;
        let totalEntriesCount = 0;
        const parentGroups = {};
        const standalone = [];

        for (const item of spending) {
            totalMonthSpending += (item.total || 0);
            totalEntriesCount += (item.count || 0);

            const catIdStr = item._id ? item._id.toString() : '';
            const cat = catMap[catIdStr];
            const catName = cat?.name || 'Uncategorized';
            const parent = cat?.parentCategory;

            if (parent && (!cat?.isParent || catName !== parent)) {
                if (!parentGroups[parent]) {
                    parentGroups[parent] = {
                        parentName: parent,
                        total: 0,
                        count: 0,
                        subcategories: []
                    };
                }
                parentGroups[parent].total += (item.total || 0);
                parentGroups[parent].count += (item.count || 0);
                parentGroups[parent].subcategories.push({
                    categoryId: catIdStr,
                    name: catName,
                    total: item.total || 0,
                    count: item.count || 0
                });
            } else if (cat?.isParent) {
                if (!parentGroups[catName]) {
                    parentGroups[catName] = {
                        parentName: catName,
                        total: 0,
                        count: 0,
                        subcategories: []
                    };
                }
                parentGroups[catName].total += (item.total || 0);
                parentGroups[catName].count += (item.count || 0);
                parentGroups[catName].subcategories.push({
                    categoryId: catIdStr,
                    name: 'General',
                    total: item.total || 0,
                    count: item.count || 0
                });
            } else {
                standalone.push({
                    categoryId: catIdStr,
                    name: catName,
                    total: item.total || 0,
                    count: item.count || 0
                });
            }
        }

        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthName = months[monthNum - 1] ? `${months[monthNum - 1]} ${yearNum}` : `${monthNum}/${yearNum}`;

        res.json({
            success: true,
            year: yearNum,
            month: monthNum,
            monthName,
            totalSpending: totalMonthSpending,
            entryCount: totalEntriesCount,
            parentGroups: Object.values(parentGroups),
            standalone
        });
    } catch (err) {
        console.error('Error fetching monthly breakdown:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/entries/:id
// @desc    Get a specific entry
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const entry = await Entry.findOne({ _id: req.params.id, userId: req.user._id });
        if (!entry) {
            return res.status(404).json({ message: 'Entry not found' });
        }
        res.json(entry);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
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
