/**
 * Admin Routes
 * 
 * Provides comprehensive admin panel APIs for:
 * - User management
 * - User data exploration
 * - Data export
 * - Analytics
 * 
 * All routes require admin authentication
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const verifyAdmin = require('../middleware/verifyAdmin');
const User = require('../models/User');
const Category = require('../models/Category');
const Entry = require('../models/Entry');
const AnalyticsUtils = require('../utils/analyticsUtils');
const ExportUtils = require('../utils/exportUtils');

/**
 * Safely convert a string to mongoose ObjectId.
 * Returns null if invalid.
 */
function toObjectId(id) {
    try {
        return new mongoose.Types.ObjectId(id);
    } catch (e) {
        return null;
    }
}

// ============= DASHBOARD STATS =============

/**
 * GET /api/admin/stats
 * Aggregate dashboard statistics
 */
router.get('/stats', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [totalUsers, totalCategories, totalEntries, spendingResult] = await Promise.all([
            User.countDocuments(),
            Category.countDocuments(),
            Entry.countDocuments(),
            Entry.aggregate([
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        const totalSpending = spendingResult[0]?.total || 0;

        res.json({
            success: true,
            stats: {
                totalUsers,
                totalCategories,
                totalEntries,
                totalSpending,
                avgSpending: totalUsers > 0 ? Math.round(totalSpending / totalUsers) : 0
            }
        });
    } catch (err) {
        console.error('Error fetching admin stats:', err);
        res.status(500).json({ success: false, message: 'Error fetching dashboard stats' });
    }
});

// ============= RECENT ENTRIES (DASHBOARD) =============

/**
 * GET /api/admin/recent/entries
 * Fetch the most recent N entries across all users, enriched with user name
 */
router.get('/recent/entries', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);

        const entries = await Entry.find()
            .sort({ date: -1, createdAt: -1 })
            .limit(limit);

        const enriched = await Promise.all(entries.map(async (entry) => {
            const [category, user] = await Promise.all([
                Category.findById(entry.categoryId).select('name parentCategory'),
                User.findById(entry.userId).select('name')
            ]);
            let catName = category?.name || 'Unknown';
            if (category?.parentCategory && ['Miscellaneous', 'Savings'].includes(category.parentCategory)) catName = `${category.parentCategory} → ${catName}`;

            return {
                ...entry.toObject(),
                categoryName: catName,
                userName: user?.name || 'Unknown User'
            };
        }));

        res.json({ success: true, entries: enriched });
    } catch (err) {
        console.error('Error fetching recent entries:', err);
        res.status(500).json({ success: false, message: 'Error fetching recent entries' });
    }
});

// ============= USER MANAGEMENT =============

/**
 * GET /api/admin/users
 * Fetch all users with pagination
 */
router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const skip = (page - 1) * limit;

        // Build search query
        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }

        // Fetch users
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Get total count for pagination
        const total = await User.countDocuments(query);

        // Enrich users with stats
        const enrichedUsers = await Promise.all(users.map(async (user) => {
            const categoryCount = await Category.countDocuments({ userId: user._id });
            const entryCount = await Entry.countDocuments({ userId: user._id });
            const spendingResult = await Entry.aggregate([
                { $match: { userId: user._id } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);

            return {
                ...user.toObject(),
                categoryCount,
                entryCount,
                totalSpending: spendingResult[0]?.total || 0
            };
        }));

        res.json({
            success: true,
            users: enrichedUsers,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

/**
 * GET /api/admin/users/:userId
 * Fetch single user profile with detailed stats
 */
router.get('/users/:userId', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const user = await User.findById(uid).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Get categories
        const categories = await Category.find({ userId: uid });
        const categoryCount = categories.length;

        // Get entries
        const entries = await Entry.find({ userId: uid });
        const entryCount = entries.length;

        // Calculate stats — userId is already an ObjectId here via user._id
        const stats = await AnalyticsUtils.getSpendingStats(uid);
        const monthlyTrend = await AnalyticsUtils.getMonthlyTrend(uid);
        const categoryDistribution = await AnalyticsUtils.getCategoryDistribution(uid);
        const topCategories = await AnalyticsUtils.getTopCategories(uid, 5);

        res.json({
            success: true,
            user: user.toObject(),
            stats: {
                categoryCount,
                entryCount,
                totalSpending: stats.totalSpending,
                averageAmount: stats.averageAmount,
                minAmount: stats.minAmount,
                maxAmount: stats.maxAmount,
                monthlyTrend,
                categoryDistribution,
                topCategories
            }
        });
    } catch (err) {
        console.error('Error fetching user profile:', err);
        res.status(500).json({ success: false, message: 'Error fetching user profile' });
    }
});

/**
 * DELETE /api/admin/users/:userId
 * Delete user account and cascade delete all their categories and entries
 */
router.delete('/users/:userId', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const user = await User.findById(uid);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Prevent self-deletion
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'Admin accounts cannot delete themselves' });
        }

        // Prevent deleting admin users
        if (user.isAdmin) {
            return res.status(400).json({ success: false, message: 'Cannot delete admin accounts' });
        }

        // Delete associated entries
        await Entry.deleteMany({ userId: uid });

        // Delete associated categories
        await Category.deleteMany({ userId: uid });

        // Delete user account
        await User.deleteOne({ _id: uid });

        res.json({ success: true, message: `Successfully deleted user ${user.name} and all their data` });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ success: false, message: 'Error deleting user account' });
    }
});

/**
 * POST /api/admin/users/bulk-delete
 * Delete multiple user accounts and cascade delete all their categories and entries
 */
router.post('/users/bulk-delete', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { userIds } = req.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No user IDs provided' });
        }

        // Convert string IDs to ObjectIds and filter out invalid ones
        const oids = userIds.map(id => toObjectId(id)).filter(id => id !== null);
        if (oids.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid user IDs provided' });
        }

        // Find users to delete (prevent self-deletion or deleting other admins)
        const users = await User.find({ _id: { $in: oids } });
        const deletableUserIds = [];
        const skippedNames = [];

        for (const user of users) {
            const isSelf = user._id.toString() === req.user._id.toString();
            const isAdmin = user.isAdmin;

            if (isSelf || isAdmin) {
                skippedNames.push(user.name);
            } else {
                deletableUserIds.push(user._id);
            }
        }

        if (deletableUserIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No deletable users selected. Admin accounts cannot be deleted.'
            });
        }

        // Delete associated entries
        await Entry.deleteMany({ userId: { $in: deletableUserIds } });

        // Delete associated categories
        await Category.deleteMany({ userId: { $in: deletableUserIds } });

        // Delete user accounts
        await User.deleteMany({ _id: { $in: deletableUserIds } });

        let message = `Successfully deleted ${deletableUserIds.length} user(s) and all their associated data.`;
        if (skippedNames.length > 0) {
            message += ` Skipped admin accounts: ${skippedNames.join(', ')}.`;
        }

        res.json({ success: true, message });
    } catch (err) {
        console.error('Error bulk deleting users:', err);
        res.status(500).json({ success: false, message: 'Error bulk deleting user accounts' });
    }
});

// ============= CATEGORY MANAGEMENT =============

/**
 * GET /api/admin/users/:userId/categories
 * Fetch all categories for a user with total spending, entry count, and monthly breakdown
 */
router.get('/users/:userId/categories', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const categories = await Category.find({ userId: uid }).sort({ createdAt: -1 });

        // Aggregate entries by category, year, and month
        const monthlyPerCategory = await Entry.aggregate([
            { $match: { userId: uid, date: { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: {
                        categoryId: '$categoryId',
                        year: { $year: '$date' },
                        month: { $month: '$date' }
                    },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } }
        ]);

        const statsMap = {};
        for (const item of monthlyPerCategory) {
            const cid = item._id.categoryId ? item._id.categoryId.toString() : 'none';
            if (!statsMap[cid]) {
                statsMap[cid] = { totalSpending: 0, entryCount: 0, monthly: [] };
            }
            statsMap[cid].totalSpending += (item.total || 0);
            statsMap[cid].entryCount += (item.count || 0);
            statsMap[cid].monthly.push({
                year: item._id.year,
                month: item._id.month,
                total: item.total || 0,
                count: item.count || 0
            });
        }

        const enrichedCategories = categories.map(cat => {
            const s = statsMap[cat._id.toString()] || { totalSpending: 0, entryCount: 0, monthly: [] };
            return {
                ...cat.toObject(),
                entryCount: s.entryCount,
                totalSpending: s.totalSpending,
                monthlySpending: s.monthly
            };
        });

        res.json({
            success: true,
            categories: enrichedCategories,
            total: enrichedCategories.length
        });
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ success: false, message: 'Error fetching categories' });
    }
});

/**
 * GET /api/admin/users/:userId/categories/:categoryId/monthly
 * Fetch monthly spending breakdown for a specific category
 */
router.get('/users/:userId/categories/:categoryId/monthly', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        const cid = toObjectId(req.params.categoryId);
        if (!uid || !cid) return res.status(400).json({ success: false, message: 'Invalid user or category ID' });

        const category = await Category.findOne({ _id: cid, userId: uid });
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

        const monthly = await Entry.aggregate([
            { $match: { userId: uid, categoryId: cid, date: { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: {
                        year: { $year: '$date' },
                        month: { $month: '$date' }
                    },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } }
        ]);

        const monthlySpending = monthly.map(m => ({
            year: m._id.year,
            month: m._id.month,
            total: m.total || 0,
            count: m.count || 0
        }));

        res.json({
            success: true,
            category: category.toObject(),
            monthlySpending
        });
    } catch (err) {
        console.error('Error fetching category monthly breakdown:', err);
        res.status(500).json({ success: false, message: 'Error fetching category monthly breakdown' });
    }
});

/**
 * GET /api/admin/users/:userId/monthly-breakdown
 * Fetch category & subcategory breakdown for a specific month
 */
router.get('/users/:userId/monthly-breakdown', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const { year, month } = req.query;
        if (!year || !month) {
            return res.status(400).json({ success: false, message: 'Year and month are required' });
        }

        const yearNum = parseInt(year);
        const monthNum = parseInt(month);
        const startDay = new Date(Date.UTC(yearNum, monthNum - 1, 1));
        const endDay = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999));

        // 1. Fetch user categories to resolve parents and names
        const allCategories = await Category.find({ userId: uid });
        const catMap = {};
        for (const c of allCategories) {
            catMap[c._id.toString()] = c;
        }

        // 2. Aggregate entries for the month grouped by categoryId
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

        const groupsArray = Object.values(parentGroups).map(g => {
            g.subcategories.sort((a, b) => b.total - a.total);
            return g;
        });
        groupsArray.sort((a, b) => b.total - a.total);
        standalone.sort((a, b) => b.total - a.total);

        const MONTH_NAMES = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthName = `${MONTH_NAMES[monthNum - 1] || 'Month ' + monthNum} ${yearNum}`;

        res.json({
            success: true,
            year: yearNum,
            month: monthNum,
            monthName,
            totalSpending: totalMonthSpending,
            entryCount: totalEntriesCount,
            parentGroups: groupsArray,
            standalone
        });
    } catch (err) {
        console.error('Error fetching monthly breakdown:', err);
        res.status(500).json({ success: false, message: 'Error fetching monthly breakdown' });
    }
});

// ============= ENTRY MANAGEMENT =============

/**
 * GET /api/admin/users/:userId/entries
 * Fetch entries for a user with filtering and pagination
 */
router.get('/users/:userId/entries', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const { page = 1, limit = 15, categoryId, startDate, endDate, month, year, search } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 15);
        const skip = (pageNum - 1) * limitNum;

        // Build query
        let query = { userId: uid };

        if (categoryId) {
            const catId = toObjectId(categoryId);
            if (catId) query.categoryId = catId;
        }

        if (search && search.trim()) {
            const sRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [
                { itemName: sRegex },
                { notes: sRegex }
            ];
        }

        if (month && year) {
            const monthNum = parseInt(month);
            const yearNum = parseInt(year);
            const startDay = new Date(Date.UTC(yearNum, monthNum - 1, 1));
            const endDay = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999));
            query.date = { $gte: startDay, $lte: endDay };
        } else if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Fetch entries
        const entries = await Entry.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum);

        // Enrich with category names (including parent category info)
        const enrichedEntries = await Promise.all(entries.map(async (entry) => {
            const category = await Category.findById(entry.categoryId);
            let displayName = category?.name || 'Unknown';
            if (category?.parentCategory && ['Miscellaneous', 'Savings'].includes(category.parentCategory)) {
                displayName = `${category.parentCategory} → ${category.name}`;
            }
            return {
                ...entry.toObject(),
                categoryName: displayName
            };
        }));

        const total = await Entry.countDocuments(query);

        res.json({
            success: true,
            entries: enrichedEntries,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum) || 1
            }
        });
    } catch (err) {
        console.error('Error fetching entries:', err);
        res.status(500).json({ success: false, message: 'Error fetching entries' });
    }
});

// ============= ANALYTICS =============

/**
 * GET /api/admin/analytics/:userId
 * Get comprehensive analytics for a user
 */
router.get('/analytics/:userId', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const analytics = await AnalyticsUtils.getCompleteDashboard(uid);

        res.json({
            success: true,
            analytics
        });
    } catch (err) {
        console.error('Error fetching analytics:', err);
        res.status(500).json({ success: false, message: 'Error fetching analytics' });
    }
});

/**
 * GET /api/admin/analytics/:userId/trends
 * Get monthly spending trends
 */
router.get('/analytics/:userId/trends', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const trends = await AnalyticsUtils.getMonthlyTrend(uid);

        res.json({
            success: true,
            trends
        });
    } catch (err) {
        console.error('Error fetching trends:', err);
        res.status(500).json({ success: false, message: 'Error fetching trends' });
    }
});

// ============= EXPORT FEATURES =============

/**
 * GET /api/admin/export/users/csv
 * Export all users as CSV
 * 
 * IMPORTANT: This MUST be declared BEFORE the /:userId routes to prevent
 * Express from treating the literal string "users" as a :userId parameter.
 */
router.get('/export/users/csv', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });

        // Enrich with stats
        const enrichedUsers = await Promise.all(users.map(async (user) => {
            const categoryCount = await Category.countDocuments({ userId: user._id });
            const entryCount = await Entry.countDocuments({ userId: user._id });
            const spendingResult = await Entry.aggregate([
                { $match: { userId: user._id } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);

            return {
                ...user.toObject(),
                categoryCount,
                entryCount,
                totalSpending: spendingResult[0]?.total || 0
            };
        }));

        const csvContent = ExportUtils.generateUsersCSV(enrichedUsers);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="all_users.csv"`);
        res.send(csvContent);
    } catch (err) {
        console.error('Error exporting users CSV:', err);
        res.status(500).json({ success: false, message: 'Error exporting CSV' });
    }
});

/**
 * GET /api/admin/export/monthly/csv
 * Export combined entries for all users for a particular month/year
 * 
 * IMPORTANT: This MUST be declared BEFORE the /:userId routes to prevent
 * Express from treating the literal string "monthly" as a :userId parameter.
 */
router.get('/export/monthly/csv', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ success: false, message: 'Month and Year parameters are required' });
        }

        const monthNum = parseInt(month);
        const yearNum = parseInt(year);
        const startDay = new Date(Date.UTC(yearNum, monthNum - 1, 1));
        const endDay = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999));

        const entries = await Entry.find({
            date: { $gte: startDay, $lte: endDay }
        }).sort({ date: -1 });

        // Enrich with user and category names
        const enrichedEntries = await Promise.all(entries.map(async (entry) => {
            const [category, user] = await Promise.all([
                Category.findById(entry.categoryId).select('name parentCategory'),
                User.findById(entry.userId).select('name email')
            ]);

            let catName = category?.name || 'Unknown';
            if (category?.parentCategory && ['Miscellaneous', 'Savings'].includes(category.parentCategory)) {
                catName = `${category.parentCategory} → ${catName}`;
            }

            return {
                date: ExportUtils.formatDate(entry.date),
                userName: user?.name || 'Unknown User',
                userEmail: user?.email || 'Unknown Email',
                categoryName: catName,
                itemName: entry.itemName || '',
                amount: entry.amount || 0,
                paymentMode: entry.paymentMode || 'Cash',
                notes: entry.notes || ''
            };
        }));

        const headers = ['Date', 'User Name', 'User Email', 'Category', 'Item Name', 'Amount', 'Payment Mode', 'Notes'];
        const csvContent = ExportUtils.toCSV(headers, enrichedEntries.map(e => ({
            'Date': e.date,
            'User Name': e.userName,
            'User Email': e.userEmail,
            'Category': e.categoryName,
            'Item Name': e.itemName,
            'Amount': e.amount,
            'Payment Mode': e.paymentMode,
            'Notes': e.notes
        })));

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="all_users_entries_${yearNum}_${String(monthNum).padStart(2, '0')}.csv"`);
        res.send(csvContent);
    } catch (err) {
        console.error('Error exporting monthly report CSV:', err);
        res.status(500).json({ success: false, message: 'Error exporting monthly report' });
    }
});

/**
 * GET /api/admin/export/monthly/data
 * Get enriched monthly entries and summary for PDF reports
 */
router.get('/export/monthly/data', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ success: false, message: 'Month and Year parameters are required' });
        }

        const monthNum = parseInt(month);
        const yearNum = parseInt(year);
        const startDay = new Date(Date.UTC(yearNum, monthNum - 1, 1));
        const endDay = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999));

        const entries = await Entry.find({
            date: { $gte: startDay, $lte: endDay }
        }).sort({ date: -1 });

        let totalSpending = 0;
        const userSet = new Set();
        const enrichedEntries = await Promise.all(entries.map(async (entry) => {
            const [category, user] = await Promise.all([
                Category.findById(entry.categoryId).select('name parentCategory'),
                User.findById(entry.userId).select('name email')
            ]);

            let catName = category?.name || 'Unknown';
            if (category?.parentCategory && ['Miscellaneous', 'Savings'].includes(category.parentCategory)) {
                catName = `${category.parentCategory} → ${catName}`;
            }

            totalSpending += (entry.amount || 0);
            if (entry.userId) userSet.add(entry.userId.toString());

            return {
                id: entry._id,
                date: ExportUtils.formatDate(entry.date),
                rawDate: entry.date,
                userName: user?.name || 'Unknown User',
                userEmail: user?.email || 'Unknown Email',
                categoryName: catName,
                itemName: entry.itemName || '',
                amount: entry.amount || 0,
                paymentMode: entry.paymentMode || 'Cash',
                notes: entry.notes || ''
            };
        }));

        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthName = months[monthNum - 1] || `Month ${monthNum}`;

        res.json({
            success: true,
            year: yearNum,
            month: monthNum,
            monthName,
            totalSpending,
            totalEntries: enrichedEntries.length,
            uniqueUsersCount: userSet.size,
            entries: enrichedEntries
        });
    } catch (err) {
        console.error('Error fetching monthly report data:', err);
        res.status(500).json({ success: false, message: 'Error fetching monthly report data' });
    }
});

/**
 * Helper to build date/category query filters for exports
 */
function buildUserEntryQuery(userId, queryParams = {}) {
    const { month, year, fromMonth, fromYear, toMonth, toYear, startDate, endDate, categoryId } = queryParams;
    let query = { userId };

    if (categoryId && categoryId !== 'all') {
        const cId = toObjectId(categoryId);
        if (cId) query.categoryId = cId;
    }

    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.date = { $gte: start, $lte: end };
    } else if (fromYear && toYear && fromMonth && toMonth) {
        const fm = parseInt(fromMonth);
        const fy = parseInt(fromYear);
        const tm = parseInt(toMonth);
        const ty = parseInt(toYear);
        const startDay = new Date(Date.UTC(fy, fm - 1, 1));
        const endDay = new Date(Date.UTC(ty, tm, 0, 23, 59, 59, 999));
        query.date = { $gte: startDay, $lte: endDay };
    } else if (month && year) {
        const monthNum = parseInt(month);
        const yearNum = parseInt(year);
        const startDay = new Date(Date.UTC(yearNum, monthNum - 1, 1));
        const endDay = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999));
        query.date = { $gte: startDay, $lte: endDay };
    } else if (year) {
        const targetYear = parseInt(year);
        const startDay = new Date(Date.UTC(targetYear, 0, 1));
        const endDay = new Date(Date.UTC(targetYear, 12, 0, 23, 59, 59, 999));
        query.date = { $gte: startDay, $lte: endDay };
    }

    return query;
}

/**
 * GET /api/admin/export/:userId/json
 * Export user data as JSON (supports month, year, range, or all-time)
 */
router.get('/export/:userId/json', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const user = await User.findById(uid).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const query = buildUserEntryQuery(uid, req.query);
        const categories = await Category.find({ userId: uid });
        const entries = await Entry.find(query).sort({ date: -1 });

        // Enrich entries with category names
        const enrichedEntries = await Promise.all(entries.map(async (entry) => {
            const category = await Category.findById(entry.categoryId);
            let displayName = category?.name || 'Unknown';
            if (category?.parentCategory && ['Miscellaneous', 'Savings'].includes(category.parentCategory)) {
                displayName = `${category.parentCategory} → ${category.name}`;
            }
            return {
                ...entry.toObject(),
                categoryName: displayName
            };
        }));

        // Compute total spending and average for filtered entries
        const totalSpending = entries.reduce((s, e) => s + (e.amount || 0), 0);
        const averageAmount = entries.length > 0 ? (totalSpending / entries.length) : 0;

        const completeData = {
            exportDate: new Date().toISOString(),
            filter: req.query,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
            },
            statistics: {
                'Summary Statistics': {
                    'Total Categories': categories.length,
                    'Total Entries': entries.length,
                    'Total Spending': totalSpending,
                    'Average Amount': averageAmount
                }
            },
            categories: categories.map(c => ({
                id: c._id,
                name: c.name,
                type: c.type,
                parentCategory: c.parentCategory,
                isParent: c.isParent,
                createdAt: c.createdAt
            })),
            entries: enrichedEntries.map(e => ({
                id: e._id,
                categoryId: e.categoryId,
                categoryName: e.categoryName,
                amount: e.amount,
                date: e.date,
                itemName: e.itemName,
                notes: e.notes,
                paymentMode: e.paymentMode,
                createdAt: e.createdAt
            }))
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${user.name.replace(/\s+/g, '_')}_export.json"`);
        res.json(completeData);
    } catch (err) {
        console.error('Error exporting JSON:', err);
        res.status(500).json({ success: false, message: 'Error exporting data' });
    }
});

/**
 * GET /api/admin/export/:userId/csv/entries
 * Export entries as CSV (supports month, year, range, or all-time)
 */
router.get('/export/:userId/csv/entries', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const user = await User.findById(uid).select('name');
        const query = buildUserEntryQuery(uid, req.query);
        const entries = await Entry.find(query).sort({ date: -1 });

        // Enrich with category names
        const enrichedEntries = await Promise.all(entries.map(async (entry) => {
            const category = await Category.findById(entry.categoryId);
            let displayName = category?.name || 'Unknown';
            if (category?.parentCategory && ['Miscellaneous', 'Savings'].includes(category.parentCategory)) {
                displayName = `${category.parentCategory} → ${category.name}`;
            }
            return {
                ...entry.toObject(),
                categoryName: displayName
            };
        }));

        const csvContent = ExportUtils.generateEntriesCSV(enrichedEntries);

        const safeName = (user?.name || req.params.userId).replace(/\s+/g, '_');
        
        let fileSuffix = 'entries';
        const { month, year, fromMonth, fromYear, toMonth, toYear, startDate, endDate } = req.query;
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        
        if (startDate && endDate) {
            fileSuffix = `${startDate}_to_${endDate}_entries`;
        } else if (fromMonth && fromYear && toMonth && toYear) {
            fileSuffix = `${months[parseInt(fromMonth)-1]}_${fromYear}_to_${months[parseInt(toMonth)-1]}_${toYear}_entries`;
        } else if (month && year) {
            fileSuffix = `${months[parseInt(month)-1]}_${year}_entries`;
        } else if (year) {
            fileSuffix = `${year}_yearly_entries`;
        } else {
            fileSuffix = 'all_time_entries';
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}_${fileSuffix}.csv"`);
        res.send(csvContent);
    } catch (err) {
        console.error('Error exporting CSV:', err);
        res.status(500).json({ success: false, message: 'Error exporting CSV' });
    }
});

/**
 * GET /api/admin/export/:userId/csv/categories
 * Export categories as CSV
 */
router.get('/export/:userId/csv/categories', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const uid = toObjectId(req.params.userId);
        if (!uid) return res.status(400).json({ success: false, message: 'Invalid user ID' });

        const user = await User.findById(uid).select('name');
        const categories = await Category.find({ userId: uid });

        // Enrich with stats
        const enrichedCategories = await Promise.all(categories.map(async (cat) => {
            const entryCount = await Entry.countDocuments({ categoryId: cat._id });
            const spendingResult = await Entry.aggregate([
                { $match: { categoryId: cat._id } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);

            return {
                ...cat.toObject(),
                entryCount,
                totalSpending: spendingResult[0]?.total || 0
            };
        }));

        const csvContent = ExportUtils.generateCategoriesCSV(enrichedCategories);

        const safeName = (user?.name || req.params.userId).replace(/\s+/g, '_');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}_categories.csv"`);
        res.send(csvContent);
    } catch (err) {
        console.error('Error exporting categories CSV:', err);
        res.status(500).json({ success: false, message: 'Error exporting CSV' });
    }
});

module.exports = router;
