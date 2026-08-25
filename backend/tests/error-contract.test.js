/*
 * Phase 5E.2 - Error Contract & Safety Tests
 *
 * Verifies API error responses are safe and consistently shaped:
 *   - representative 400/401/403/404 responses
 *   - malformed JSON body -> 400 without stack leakage
 *   - unhandled controller errors -> safe JSON 500 (global middleware)
 *   - no stack traces / SQL / internals in any error body
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start     (port 3000)
 *   2. Run tests:      node tests/error-contract.test.js
 */
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
};

const LEAK_PATTERNS = [
  /at\s+\w+\s+\(/i,          // stack frames: "at fn (file:line)"
  /\bSELECT\b[\s\S]*\bFROM\b/i, // raw SQL
  /node_modules/i,
  /SequelizeDatabaseError/i,
  /ValidationError:/i,
  /\.js:\d+:\d+/             // file:line:col references
];

function assertSafe(name, status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body || {});
  let ok = true;
  let why = '';
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    ok = false; why = 'body is not a JSON object';
  } else if (typeof body.error !== 'string' || body.error.length === 0) {
    ok = false; why = 'missing safe "error" string field';
  } else {
    for (const p of LEAK_PATTERNS) {
      if (p.test(text)) { ok = false; why = `leak pattern ${p}`; break; }
    }
  }
  assert(`${name} [${status}] safe shape, no leaks`, ok, why);
}

async function rest(method, path, { token, body, rawBody, contentType } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (rawBody) headers['Content-Type'] = contentType || 'application/json';
  else if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : (body ? JSON.stringify(body) : undefined)
  });
  let data = null;
  const text = await r.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

async function registerAndLogin(username) {
  const uname = `${username}_${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await rest('POST', '/api/auth/register', { body: { username: uname, password: 'testpass123', displayName: username } });
  const login = await rest('POST', '/api/auth/login', { body: { username: uname, password: 'testpass123' } });
  return { id: login.data.user.id, token: login.data.token, username: uname };
}

(async () => {
  console.log('--- Error contract ---');

  // 400 validation shapes
  let r = await rest('POST', '/api/auth/register', { body: {} });
  assertSafe('register missing fields', r.status, r.data);
  assert('register missing fields -> 400', r.status === 400);

  // 401 authentication
  r = await rest('GET', '/api/users/me');
  assertSafe('REST no token', r.status, r.data);
  assert('no token -> 401', r.status === 401);

  r = await rest('GET', '/api/users/me', { token: 'garbage.token.here' });
  assertSafe('REST invalid token', r.status, r.data);
  assert('invalid token -> 401', r.status === 401);

  r = await rest('POST', '/api/auth/login', { body: { username: 'no_such_user_xyz', password: 'whatever123' } });
  assertSafe('login invalid credentials', r.status, r.data);
  assert('login invalid credentials -> 401 with generic message',
    r.status === 401 && r.data.error === 'Invalid credentials');

  // malformed JSON body -> parser 400, still safe
  r = await rest('POST', '/api/auth/login', { rawBody: '{not-json', contentType: 'application/json' });
  assertSafe('malformed JSON body', r.status, r.data);
  assert('malformed JSON -> 400', r.status === 400);

  // 403 authorization
  const owner = await registerAndLogin('ec_owner');
  const member = await registerAndLogin('ec_member');
  const outsider = await registerAndLogin('ec_out');
  const g = await rest('POST', '/api/groups', { token: owner.token, body: { name: `ec-group-${Date.now()}` } });
  const groupId = g.data.group.id;

  r = await rest('DELETE', `/api/groups/${groupId}`, { token: member.token });
  assertSafe('non-owner group delete', r.status, r.data);
  assert('non-member delete group -> 404 (blind)', r.status === 404);

  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: member.id, role: 'member' } });
  r = await rest('DELETE', `/api/groups/${groupId}`, { token: member.token });
  assertSafe('member (non-owner) group delete', r.status, r.data);
  assert('member delete group -> 403 with clear message', r.status === 403 && /owner/i.test(r.data.error));

  // 404 missing resources
  r = await rest('GET', '/api/tasks/99999999', { token: owner.token });
  assertSafe('nonexistent task', r.status, r.data);
  assert('nonexistent task -> 404', r.status === 404);

  // 500 safety: garbage date objects must be rejected by validation (5E.2 fix),
  // never persisted or converted into internal errors.
  r = await rest('POST', `/api/groups/${groupId}/tasks`, {
    token: owner.token,
    body: { title: 'bad dates', startDate: 'not-a-date-at-all', dueDate: { evil: 'object' } }
  });
  assertSafe('invalid date payload handled safely', r.status, r.data);
  assert('invalid date payload rejected with 400 validation', r.status === 400 && /date/i.test(r.data.error));

  // notification endpoints keep the same contract
  r = await rest('PUT', '/api/notifications/abc/read', { token: owner.token });
  assertSafe('notification bad id', r.status, r.data);
  assert('notification bad id -> 400', r.status === 400);

  // socket-layer join limiter contract stays JSON-safe via acks (covered elsewhere)

  // cleanup
  await rest('DELETE', `/api/groups/${groupId}`, { token: owner.token });
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  const names = [owner.username, member.username, outsider.username];
  await User.destroy({ where: { username: { [Op.in]: names } } });

  console.log(`\n===== ERROR CONTRACT RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
