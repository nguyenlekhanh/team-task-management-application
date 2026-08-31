const jwt = require('jsonwebtoken');
const User = require('../models/User');
const tokenStore = require('../services/tokenStore');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Error codes returned alongside safe user-facing messages
const CODES = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  AUTH_ERROR: 'AUTH_ERROR'
};

// Verifies a raw JWT and resolves the user from the database.
// Single source of truth shared by REST authentication middleware and socket authentication.
// Never throws: resolves { user } on success or { error, code } with messages safe to expose to clients.
//
// Session revocation (9.1): access tokens carry a `sid` (session family id).
// A token whose family is revoked (logout / refresh-reuse theft detection) is
// rejected as invalid. Tokens WITHOUT a sid (pre-9.1 shape) are accepted as long
// as their signature/expiry hold, so deployments keep working across a rolling
// restart — they simply cannot be revoked, which is the documented old posture.
async function getUserFromToken(token) {
  try {
    // Algorithm pinned: prevents algorithm-confusion token forgery (5E.3).
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    if (decoded.sid && !tokenStore.isFamilyActive(decoded.sid)) {
      return { error: 'Invalid token', code: CODES.TOKEN_INVALID };
    }

    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return { error: 'User not found', code: CODES.USER_NOT_FOUND };
    }
    return { user };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { error: 'Token expired', code: CODES.TOKEN_EXPIRED };
    }
    if (err.name === 'JsonWebTokenError') {
      return { error: 'Invalid token', code: CODES.TOKEN_INVALID };
    }
    return { error: 'Authentication error', code: CODES.AUTH_ERROR };
  }
}

module.exports = { getUserFromToken, CODES };
