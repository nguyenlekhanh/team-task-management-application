const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sequelize = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '15m';

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
async function register(req, res) {
  const { username, password, displayName, avatarUrl } = req.body;

  // Validate required fields
  if (!username || !password || !displayName) {
    return res.status(400).json({
      error: 'Missing required fields: username, password, displayName'
    });
  }

  // Check if username already exists
  const existingUser = await User.findOne({ where: { username } });
  if (existingUser) {
    return res.status(409).json({
      error: 'Username already exists'
    });
  }

  // Hash password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Create user
  const user = await User.create({
    username,
    password: hashedPassword,
    displayName,
    avatarUrl: avatarUrl || undefined,
    onlineStatus: false
  });

  // Return success (without password)
  res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      onlineStatus: user.onlineStatus,
      createdAt: user.createdAt
    }
  });
}

/**
 * @route   POST /api/auth/login
 * @desc    Login user & get token
 * @access  Public
 */
async function login(req, res) {
  const { username, password } = req.body;
  let user;

  try {
    // Find user by username
    user = await User.findOne({ where: { username } });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }
  } catch (err) {
    console.error('[ERROR] login:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  // Set token in HTTP-only cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  res.json({
    message: 'Logged in successfully',
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      onlineStatus: user.onlineStatus,
      createdAt: user.createdAt
    }
  });
}

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user / clear cookie
 * @access  Private
 */
async function logout(req, res) {
  // Clear the token cookie
  res.clearCookie('token');
  res.json({
    message: 'Logged out successfully'
  });
}

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private
 */
async function getMe(req, res) {
  // Verify JWT token from cookie or Authorization header
  let token = req.cookies.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  
  if (!token) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch user from database
    const user = await User.findByPk(decoded.userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        onlineStatus: user.onlineStatus,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired'
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token'
      });
    }
    console.error('[ERROR] getMe:', err.message);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
}

module.exports = {
  register,
  login,
  logout,
  getMe
};