/*
 * Phase 9.1 - Refresh Tokens & Token Revocation Tests
 *
 * Verifies the session/refresh machinery: rotation (single use), family
 * revocation on reuse (theft detection), logout revocation, uniform 401s,
 * cookie transport, and that the pre-9.1 stateless gap is closed.
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start   (port 3000)
 *   2. Run tests:      node tests/refresh-auth.test.js
 */
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
};

async function rest(method, path, { token, body, rawCookie } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rawCookie ? { Cookie: rawCookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, res: r };
}

async function registerAndLogin(username) {
  const uname = `${username}_${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await rest('POST', '/api/auth/register', { body: { username: uname, password: 'testpass123', displayName: username } });
  const login = await rest('POST', '/api/auth/login', { body: { username: uname, password: 'testpass123' } });
  return {
    id: login.data.user.id,
    token: login.data.token,
    refreshToken: login.data.refreshToken,
    username: uname,
    cookie: login.res.headers.getSetCookie?.().find(c => c.startsWith('refreshToken=')) || null
  };
}

(async () => {
  console.log('--- Setup ---');
  const alice = await registerAndLogin('rt_alice');

  console.log('\n--- Login issues session tokens ---');
  assert('login returns an access token', typeof alice.token === 'string' && alice.token.length > 20);
  assert('login returns a refresh token', typeof alice.refreshToken === 'string' && alice.refreshToken.length >= 32);
  assert('login sets refreshToken httpOnly cookie', !!alice.cookie && /httponly/i.test(alice.cookie) && /samesite=lax/i.test(alice.cookie));
  let r = await rest('GET', '/api/users/me', { token: alice.token });
  assert('fresh access token authenticates', r.status === 200);

  console.log('\n--- Refresh rotation ---');
  r = await rest('POST', '/api/auth/refresh', { body: { refreshToken: alice.refreshToken } });
  assert('refresh succeeds with valid token', r.status === 200 && !!r.data.token);
  assert('refresh returns a NEW access token', r.data.token !== alice.token);
  assert('refresh returns a NEW refresh token (rotation)', r.data.refreshToken && r.data.refreshToken !== alice.refreshToken);
  assert('refresh returns the user object', r.data.user && r.data.user.id === alice.id);
  const token2 = r.data.token;
  const refresh2 = r.data.refreshToken;
  r = await rest('GET', '/api/users/me', { token: token2 });
  assert('new access token authenticates', r.status === 200);

  console.log('\n--- Single use + theft detection ---');
  // The ORIGINAL refresh token was consumed above. Replaying it must fail AND
  // must revoke the family: the still-valid second access token dies too.
  r = await rest('POST', '/api/auth/refresh', { body: { refreshToken: alice.refreshToken } });
  assert('replayed (consumed) refresh token rejected (uniform 401)', r.status === 401 && r.data.error === 'Invalid refresh token');
  r = await rest('GET', '/api/users/me', { token: token2 });
  assert('reuse revokes the family (live access token now 401)', r.status === 401, `got ${r.status}`);
  r = await rest('POST', '/api/auth/refresh', { body: { refreshToken: refresh2 } });
  assert('family refresh token also dead after theft revocation', r.status === 401);

  console.log('\n--- Logout revocation (the 5E.3 gap, closed) ---');
  const bob = await registerAndLogin('rt_bob');
  r = await rest('POST', '/api/auth/logout', { token: bob.token, body: { refreshToken: bob.refreshToken } });
  assert('logout with refresh token succeeds', r.status === 200);
  const cleared = r.res.headers.getSetCookie ? r.res.headers.getSetCookie() : [];
  assert('logout clears both cookies', cleared.some(c => c.startsWith('token=') && /1970/.test(c)) && cleared.some(c => c.startsWith('refreshToken=') && /1970/.test(c)));
  r = await rest('GET', '/api/users/me', { token: bob.token });
  assert('access token rejected after logout (was: valid ≤15 min pre-9.1)', r.status === 401, `got ${r.status}`);
  r = await rest('POST', '/api/auth/refresh', { body: { refreshToken: bob.refreshToken } });
  assert('refresh token dead after logout', r.status === 401);
  const relogin = await rest('POST', '/api/auth/login', { body: { username: bob.username, password: 'testpass123' } });
  assert('re-login after revocation works', relogin.status === 200);

  console.log('\n--- Uniform rejections (no enumeration surface) ---');
  r = await rest('POST', '/api/auth/refresh', { body: { refreshToken: 'garbage' } });
  assert('garbage refresh token -> uniform 401', r.status === 401 && r.data.error === 'Invalid refresh token');
  r = await rest('POST', '/api/auth/refresh', { body: {} });
  assert('missing refresh token -> uniform 401', r.status === 401 && r.data.error === 'Invalid refresh token');
  r = await rest('POST', '/api/auth/refresh', {});
  assert('no body at all -> uniform 401', r.status === 401);

  console.log('\n--- Cookie-transport refresh ---');
  const carol = await registerAndLogin('rt_carol');
  r = await rest('POST', '/api/auth/refresh', { rawCookie: carol.cookie });
  assert('refresh works via httpOnly cookie alone', r.status === 200 && !!r.data.token);

  console.log('\n--- Register issues a session too ---');
  const uname = `rt_reg_${Date.now()}`;
  const reg = await rest('POST', '/api/auth/register', { body: { username: uname, password: 'testpass123', displayName: 'rtreg' } });
  assert('register returns token + refreshToken', reg.status === 201 && !!reg.data.token && !!reg.data.refreshToken);
  r = await rest('GET', '/api/users/me', { token: reg.data.token });
  assert('register-issued access token authenticates', r.status === 200);
  r = await rest('POST', '/api/auth/refresh', { body: { refreshToken: reg.data.refreshToken } });
  assert('register-issued refresh token works', r.status === 200);

  console.log('\n--- Backward compatibility ---');
  // logout WITHOUT a refresh token must keep working (cookie-only clients)
  const dave = await registerAndLogin('rt_dave');
  r = await rest('POST', '/api/auth/logout', { token: dave.token, body: {} });
  assert('logout without refresh token still 200', r.status === 200);
  // access token without sid (pre-9.1 shape) must still authenticate: the
  // rolling-restart compatibility rule from the 9.1 design.
  const jwt = require('jsonwebtoken');
  const { execSync } = require('child_process');
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  const legacyToken = jwt.sign({ userId: dave.id, username: dave.username }, secret, { expiresIn: '15m' });
  r = await rest('GET', '/api/users/me', { token: legacyToken });
  assert('pre-9.1 access-token shape (no sid) still accepted', r.status === 200, `got ${r.status}`);
  // login limiter unaffected
  r = await rest('POST', '/api/auth/login', { body: { username: dave.username, password: 'wrong' } });
  assert('login limiter path unchanged (401 invalid credentials)', r.status === 401);

  console.log('\n--- Cleanup ---');
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  await User.destroy({ where: { username: { [Op.like]: 'rt_%' } } });
  const remaining = await User.count({ where: { username: { [Op.like]: 'rt_%' } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== REFRESH AUTH RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
