const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sequelize = require('../config/database');
const loginLimiter = require('../middleware/loginLimiter');
const tokenStore = require('../services/tokenStore');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '15m';

// Cookie helpers (9.1): dual transport preserved. The access token keeps its
// 15-minute httpOnly cookie; the refresh token gets a 7-day httpOnly cookie and
// is also returned in the response body for the SPA's explicit refresh calls.
// The SPA never persists the refresh token outside this cookie.
function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });
  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // must outlive the family TTL
    });
  }
}

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

  // Password policy: aligns with change-password minimum (5E.3)
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters'
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

  // Register = login equivalent (9.1): issue a session right away so the
  // freshly registered user doesn't have to log in again.
  const { refreshToken, sid } = tokenStore.createSession(user.id);
  const token = jwt.sign(
    { userId: user.id, username: user.username, sid },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  setAuthCookies(res, token, refreshToken);

  // Return success (without password)
  res.status(201).json({
    message: 'User registered successfully',
    token,
    refreshToken,
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

  // Brute-force shield: block only after repeated FAILED attempts from this IP.
  if (loginLimiter.isBlocked(req.ip)) {
    return res.status(429).json({
      error: 'Too many failed login attempts. Try again later.'
    });
  }

  try {
    // Find user by username
    user = await User.findOne({ where: { username } });

    if (!user) {
      loginLimiter.recordFailure(req.ip);
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      loginLimiter.recordFailure(req.ip);
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }
  } catch (err) {
    console.error('[ERROR] login:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }

  // Generate JWT token
  const { refreshToken, sid } = tokenStore.createSession(user.id);
  const token = jwt.sign(
    { userId: user.id, username: user.username, sid, jti: require('crypto').randomBytes(8).toString('hex') },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  setAuthCookies(res, token, refreshToken);

  res.json({
    message: 'Logged in successfully',
    token,
    refreshToken,
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
 * @desc    Logout user / clear cookies / revoke the session (9.1)
 * @access  Private (works with or without a valid refresh token — cookie
 *          clearing alone remains the backward-compatible fallback)
 */
async function logout(req, res) {
  // Revoke the session server-side when a refresh token is presented
  // (body or httpOnly cookie). Best-effort: even without one, the cookies
  // are still cleared exactly as before.
  const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
  if (refreshToken) {
    const consumed = tokenStore.consumeRefreshToken(refreshToken);
    if (consumed) {
      tokenStore.revokeFamily(consumed.sid);
    }
  }
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  res.json({
    message: 'Logged out successfully'
  });
}

/**
 * @route   POST /api/auth/refresh
 * @desc    Rotate the refresh token and issue a fresh access token (9.1)
 * @access  Public (valid refresh token required; uniform 401 on any failure)
 */
async function refresh(req, res) {
  const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

  const consumed = refreshToken
    ? tokenStore.consumeRefreshToken(refreshToken)
    : null;

  if (!consumed) {
    // Uniform rejection: never reveal whether a token was unknown, consumed,
    // or family-revoked (no enumeration surface).
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const user = await User.findByPk(consumed.userId);
  if (!user) {
    tokenStore.revokeFamily(consumed.sid);
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  // Single-use rotation: a fresh refresh token per exchange, same family.
  const newRefreshToken = tokenStore.issueRefreshToken(consumed.sid, consumed.userId);
  const token = jwt.sign(
    { userId: user.id, username: user.username, sid: consumed.sid },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  setAuthCookies(res, token, newRefreshToken);

  res.json({
    message: 'Token refreshed successfully',
    token,
    refreshToken: newRefreshToken,
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
  refresh,
  getMe
};