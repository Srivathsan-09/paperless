const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

/**
 * @route   GET /auth/google
 * @desc    Initiate Google OAuth authentication
 * @access  Public
 */
router.get(
    '/google',
    (req, res, next) => {
        const mode = req.query.mode || 'login';
        passport.authenticate('google', {
            scope: ['profile', 'email'],
            session: false,
            state: mode // Pass mode as state
        })(req, res, next);
    }
);

/**
 * @route   GET /auth/google/callback
 * @desc    Google OAuth callback route
 * @access  Public
 */
router.get(
    '/google/callback',
    (req, res, next) => {
        passport.authenticate('google', { session: false }, (err, user, info) => {
            if (err) {
                console.error('Google Auth Error:', err);
                return res.redirect('/Loginpage.html?error=server_error');
            }
            if (!user) {
                // info might contain the message we set in passport.js
                const message = info ? info.message : 'Authentication failed';
                console.log('Auth failed message:', message);
                return res.redirect(`/Loginpage.html?error=${encodeURIComponent(message)}`);
            }

            // If user found, proceed to generate token
            try {
                const token = jwt.sign(
                    { id: user._id, email: user.email },
                    process.env.JWT_SECRET,
                    { expiresIn: '7d' }
                );

                let redirectUrl = `/index.html?token=${token}&success=true`;
                if (user.isNewUser) {
                    redirectUrl += '&isNewUser=true';
                }
                res.redirect(redirectUrl);
            } catch (error) {
                console.error('Token generation error:', error);
                res.redirect('/Loginpage.html?error=token_error');
            }
        })(req, res, next);
    }
);

const User = require('../models/User');

/**
 * @route   POST /auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({
                success: false,
                message: 'User already exists. Please login instead.'
            });
        }

        // Create new user
        user = await User.create({
            name: `${firstName} ${lastName}`,
            email,
            password,
            createdAt: new Date(),
            lastLogin: new Date()
        });

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during signup'
        });
    }
});

/**
 * @route   POST /auth/login
 * @desc    Authenticate user and get token
 * @access  Public
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // First check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Account not found. Please sign up first.'
            });
        }

        // Check if user is a Google-only user
        if (!user.password && user.googleId) {
            return res.status(400).json({
                success: false,
                message: 'This account was created with Google. Please login with Google.'
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

module.exports = router;
