const express = require('express');
const router = express.Router();
const { healthCheck } = require('../controllers/healthController');
const authRoutes = require('./auth');
const userRoutes = require('./users');

router.get('/health', healthCheck);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

module.exports = router;
