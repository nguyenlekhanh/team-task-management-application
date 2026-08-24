const { getUserFromToken, CODES } = require('../utils/tokenAuth');

async function authenticate(req, res, next) {
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
    const result = await getUserFromToken(token);

    if (result.error) {
      if (result.code === CODES.USER_NOT_FOUND) {
        return res.status(404).json({ error: result.error });
      }
      if (result.code === CODES.TOKEN_EXPIRED || result.code === CODES.TOKEN_INVALID) {
        return res.status(401).json({ error: result.error });
      }
      return res.status(500).json({ error: result.error });
    }

    req.user = result.user;
    next();
  } catch (err) {
    return res.status(500).json({
      error: 'Authentication error'
    });
  }
}

module.exports = { authenticate };
