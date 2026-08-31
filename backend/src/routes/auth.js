const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', authController.register);

// @route   POST /api/auth/login
// @desc    Login user & get token
// @access  Public
router.post('/login', authController.login);

// @route   POST /api/auth/logout
// @desc    Logout user / clear cookies / revoke session
// @access  Private
router.post('/logout', authController.logout);

// @route   POST /api/auth/refresh
// @desc    Rotate refresh token + issue fresh access token (9.1)
// @access  Public (valid refresh token required)
router.post('/refresh', authController.refresh);

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get('/me', authController.getMe);

module.exports = router;