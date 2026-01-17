require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
const path = require('path');
const connectDB = require('./config/db');

// Validate environment variables
const requiredEnv = ['MONGODB_URI', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
const missingEnv = requiredEnv.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingEnv.join(', ')}`);
    // process.exit(1); // Don't crash the serverless function immediately
}

// Initialize Express app
const app = express();

// Connect to MongoDB via middleware
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Initialize Passport configuration
require('./config/passport')(passport);

// Normalize Frontend URL (remove trailing slash)
// Priority: Custom FRONTEND_URL -> Vercel Production URL -> Vercel Preview URL -> Localhost
const getBaseUrl = () => {
    if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return 'http://localhost:5000';
};
const frontendUrl = getBaseUrl().replace(/\/$/, '');

// Middleware
app.use(cors({
    origin: frontendUrl,
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport (without sessions since we're using JWT)
app.use(passport.initialize());

// Static files are served by Vercel from the public directory
// app.use(express.static(path.join(__dirname, '../Front end')));

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


// Root route is handled by Vercel serving public/index.html or similar
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, '../Front end', 'Loginpage.html'));
// });


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

// Serverless deployment: Export the app
// Vercel handles the server execution

module.exports = app;
