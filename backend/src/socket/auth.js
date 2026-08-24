const { getUserFromToken } = require('../utils/tokenAuth');

// Extracts the `token` cookie value from a raw Cookie header (cookie-parser
// is Express-middleware shaped, so a minimal parse is used for handshakes).
function extractCookieToken(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name === 'token') {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return part.slice(idx + 1).trim();
      }
    }
  }
  return null;
}

// Socket.IO handshake middleware. Mirrors middleware/auth.js semantics:
// auth.token first, httpOnly token cookie as fallback; rejects with safe reasons.
async function authenticateSocket(socket, next) {
  const token =
    (socket.handshake.auth && socket.handshake.auth.token) ||
    extractCookieToken(socket.handshake.headers.cookie);

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const result = await getUserFromToken(token);
    if (result.error) {
      return next(new Error(result.error));
    }
    // Minimal identity snapshot: never attach the full model (avoids leaking
    // password hash into logs/rooms debugging).
    socket.userId = result.user.id;
    socket.user = {
      id: result.user.id,
      username: result.user.username,
      displayName: result.user.displayName
    };
    next();
  } catch {
    return next(new Error('Authentication error'));
  }
}

module.exports = { authenticateSocket, extractCookieToken };
