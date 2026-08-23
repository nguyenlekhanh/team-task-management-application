const express = require('express');
const router = express.Router();
const { healthCheck } = require('../controllers/healthController');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const groupRoutes = require('./groups');
const taskRoutes = require('./tasks');
const messageRoutes = require('./messages');
const notificationRoutes = require('./notifications');

router.get('/health', healthCheck);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/groups', groupRoutes);
router.use('/notifications', notificationRoutes);
router.use('/', taskRoutes);
router.use('/', messageRoutes);

module.exports = router;
