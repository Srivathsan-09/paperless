require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
const path = require('path');
const connectDB = require('./config/db');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Initialize Passport configuration
require('./config/passport')(passport);

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5000',
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport (without sessions since we're using JWT)
app.use(passport.initialize());

// Serve static files from the "Front end" directory
app.use(express.static(path.join(__dirname, '../Front end')));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/entries', require('./routes/entries'));


// Example protected route (for future use)
const verifyToken = require('./middleware/verifyToken');
app.get('/api/user/profile', verifyToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            profilePic: req.user.profilePic,
            createdAt: req.user.createdAt,
            lastLogin: req.user.lastLogin,
        },
    });
});


// Root route - Redirect or serve Loginpage.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Front end', 'Loginpage.html'));
});


// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📍 API URL: http://localhost:${PORT}`);
    console.log(`🔐 Google OAuth: http://localhost:${PORT}/auth/google\n`);
});
