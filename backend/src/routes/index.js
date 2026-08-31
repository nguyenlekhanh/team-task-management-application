const express = require('express');
const router = express.Router();
const { healthCheck } = require('../controllers/healthController');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const groupRoutes = require('./groups');
const taskRoutes = require('./tasks');
const messageRoutes = require('./messages');
const notificationRoutes = require('./notifications');
const { restLimiter } = require('../middleware/restLimiter');

// Public routes: health (deployment monitoring probe) and auth (login has its
// own failure-counter limiter; refresh/register are bounded by body caps and
// uniform 401s). Deliberately exempt from the general REST limit.
router.get('/health', healthCheck);
router.use('/auth', authRoutes);

// General per-IP REST rate limit (9.2): covers every method/route on the
// protected surface below. Mounted BEFORE the routers (and their authenticate
// middleware) so throttled requests are rejected cheaply, before any DB work.
// No method/route bypass by construction. Socket.IO traffic never passes here.
router.use(restLimiter);

router.use('/users', userRoutes);
router.use('/groups', groupRoutes);
router.use('/notifications', notificationRoutes);
router.use('/', taskRoutes);
router.use('/', messageRoutes);

module.exports = router;
