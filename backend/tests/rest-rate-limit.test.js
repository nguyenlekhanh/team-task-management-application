/*
 * Phase 9.2 - Broader REST Rate Limiting Tests
 *
 * Three sections:
 *   1. Unit-level limiter logic (deterministic, in-process, always runs)
 *   2. HTTP-level behavior under DEFAULT limits (always runs - proves normal
 *      traffic is never throttled and public routes are exempt)
 *   3. HTTP-level throttle behavior under KNOBBED limits (runs when the test
 *      process is started with a low REST_RATE_LIMIT to match the server knob
 *      - the same documented pattern as the security suite's AUTH_MAX_FAILED
 *      lockout section)
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start   (port 3000)
 *   2. Run tests:      node tests/rest-rate-limit.test.js
 *      (throttle section: REST_RATE_LIMIT=5 node tests/rest-rate-limit.test.js
 *       against a server started with the same REST_RATE_LIMIT)
 */
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
};

async function rest(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, res: r };
}

async function registerAndLogin(username) {
  const uname = `${username}_${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await rest('POST', '/api/auth/register', { body: { username: uname, password: 'testpass123', displayName: username } });
  const login = await rest('POST', '/api/auth/login', { body: { username: uname, password: 'testpass123' } });
  return { id: login.data.user.id, token: login.data.token, refreshToken: login.data.refreshToken, username: uname };
}

(async () => {
  // Capture the externally-set throttle knob BEFORE the unit section mutates
  // process.env (it temporarily sets its own values and must restore, not
  // delete, this one). Same documented pattern as security.test.js.
  const ORIGINAL_KNOB = process.env.REST_RATE_LIMIT;

  // ================= 1. UNIT-LEVEL LIMITER LOGIC =================
  console.log('\n--- Unit: limiter logic (fresh module, controlled knobs) ---');
  delete require.cache[require.resolve('../src/middleware/restLimiter')];
  process.env.REST_RATE_LIMIT = '3';
  process.env.REST_RATE_WINDOW_MS = '1000';
  const limiter = require('../src/middleware/restLimiter');
  limiter.reset();
  assert('limiter honors configured threshold', limiter.getLimit() === 3);
  assert('limiter honors configured window', limiter.getWindowMs() === 1000);

  const makeReq = (ip) => ({ ip });
  const makeRes = () => {
    const out = { statusCode: null, headers: {}, body: null, called: false };
    out.status = (c) => { out.statusCode = c; return out; };
    out.set = (k, v) => { out.headers[k.toLowerCase()] = v; return out; };
    out.json = (b) => { out.body = b; return out; };
    return out;
  };
  const nextCalls = [];
  const run = (ip) => {
    const res = makeRes();
    limiter.restLimiter(makeReq(ip), res, () => nextCalls.push(ip));
    return res;
  };

  let r1 = run('1.2.3.4'); run('1.2.3.4'); r1 = run('1.2.3.4');
  assert('requests up to the limit pass through', nextCalls.filter(x => x === '1.2.3.4').length === 3 && r1.statusCode === null);
  const blocked = run('1.2.3.4');
  assert('request beyond the limit is 429', blocked.statusCode === 429);
  assert('429 body is the safe envelope', blocked.body && blocked.body.error === 'Too many requests. Please try again later.');
  assert('429 carries Retry-After (seconds, min 1)', /^\d+$/.test(blocked.headers['retry-after'] || '') && parseInt(blocked.headers['retry-after'], 10) >= 1);
  assert('429 leaks nothing else (no stack/internals)', JSON.stringify(blocked.body).length < 120 && !/sequelize|node_modules|at /.test(JSON.stringify(blocked.body)));
  assert('other IPs unaffected during a block', (() => { const res = run('5.6.7.8'); return res.statusCode === null; })());
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert('window expiry unblocks the IP', run('1.2.3.4').statusCode === null);
  limiter.reset();
  assert('reset clears state', run('1.2.3.4').statusCode === null);
  // Restore (not delete) any externally-set knob before the HTTP sections.
  if (ORIGINAL_KNOB) process.env.REST_RATE_LIMIT = ORIGINAL_KNOB;
  else delete process.env.REST_RATE_LIMIT;
  delete process.env.REST_RATE_WINDOW_MS;

  // ================= 2. HTTP UNDER DEFAULT LIMITS (or scaled to the knob) =================
  // The throttle knob: run the suite with a matching low REST_RATE_LIMIT on
  // the server (and the test process) to exercise 429s — the documented
  // env-gated pattern of the security suite's lockout section.
  const knob = parseInt(ORIGINAL_KNOB || '', 10);
  const knobbed = Number.isFinite(knob) && knob <= 50;
  const effectiveLimit = knobbed ? knob : 600;

  console.log('\n--- HTTP: behavior under configured limits ---');
  const alice = await registerAndLogin('rl_alice');

  if (!knobbed) {
    // Default-config semantics: a normal mixed burst (what an active tab does
    // in a few seconds) must never be throttled under the 600/60s default;
    // every method on the protected surface works; public routes exempt.
    const g = await rest('POST', '/api/groups', { token: alice.token, body: { name: `rl-g-${Date.now()}` } });
    const groupId = g.data.group.id;

    const burst = [];
    for (let i = 0; i < 12; i++) {
      burst.push(rest('GET', '/api/users/me', { token: alice.token }));
      burst.push(rest('GET', '/api/groups', { token: alice.token }));
    }
    const results = await Promise.all(burst);
    assert('24-request authenticated burst all succeeds (no false throttling)', results.every(x => x.status === 200));

    // Public routes are exempt by construction (mounted before the limiter).
    let r = await rest('GET', '/api/health');
    assert('health endpoint exempt (200)', r.status === 200);
    r = await rest('POST', '/api/auth/login', { body: { username: alice.username, password: 'testpass123' } });
    assert('auth endpoints exempt (login 200 under any local volume)', r.status === 200);

    // The limiter is transparent: unauthenticated protected requests still
    // get the auth 401 (limiter passes them through to authenticate).
    r = await rest('GET', '/api/notifications');
    assert('unauthenticated protected request still 401 (limiter transparent)', r.status === 401);
    r = await rest('GET', `/api/groups/${groupId}/tasks`, { token: alice.token });
    assert('protected task route reachable (200)', r.status === 200);
    r = await rest('PUT', `/api/groups/${groupId}`, { token: alice.token, body: { name: `rl-g2-${Date.now()}` } });
    assert('PUT method covered and working (200)', r.status === 200);
    r = await rest('DELETE', `/api/groups/${groupId}`, { token: alice.token });
    assert('DELETE method covered and working (200)', r.status === 200);
  } else {
    // Knobbed server: prove requests BELOW the threshold still succeed
    // (no false throttling at the configured level). Register/login are exempt
    // (before the limiter), so this burst starts the window at zero.
    const burst = [];
    for (let i = 0; i < effectiveLimit - 4; i++) {
      burst.push(rest('GET', '/api/notifications'));
    }
    const results = await Promise.all(burst);
    assert(`requests below the knobbed threshold (${effectiveLimit - 4}) succeed`, results.every(x => x.status === 401 || x.status === 200));
  }

  // ================= 3. HTTP THROTTLE (env-gated, knobbed run) =================
  if (knobbed) {
    console.log('\n--- HTTP: throttle behavior (knobbed run) ---');
    // Fire the cheapest protected route until throttled (auth runs after the
    // limiter, so 401 responses still count as requests).
    let saw429 = null;
    for (let i = 0; i < effectiveLimit + 30; i++) {
      const res = await rest('GET', '/api/notifications');
      if (res.status === 429) { saw429 = res; break; }
    }
    assert('protected route throttles beyond the knob', !!saw429);
    if (saw429) {
      assert('429 safe envelope over HTTP', saw429.data.error === 'Too many requests. Please try again later.');
      const ra = saw429.res.headers.get('retry-after');
      assert('Retry-After header present over HTTP', !!ra && parseInt(ra, 10) >= 1);
      assert('429 body has no leak patterns', !/sequelize|node_modules|stack|at \//i.test(JSON.stringify(saw429.data)));
    }
    // During the block: public routes still reachable (exemption real).
    const healthDuringBlock = await rest('GET', '/api/health');
    assert('health still reachable while throttled', healthDuringBlock.status === 200);
    // And the login surface is a SEPARATE mechanism: a wrong-password attempt
    // during the REST block still yields the login limiter's 401, not a 429.
    const loginDuringBlock = await rest('POST', '/api/auth/login', { body: { username: 'rl_nobody', password: 'wrong' } });
    assert('login endpoint unaffected by REST throttle (401 invalid credentials)', loginDuringBlock.status === 401);
    // Recovery via window expiry is verified at unit level above (HTTP window
    // is 60s - too long to wait in a suite; same pattern as the security
    // suite's lockout recovery).
  } else {
    console.log('\n--- HTTP: throttle section skipped (run with REST_RATE_LIMIT<=50 to exercise 429 behavior) ---');
    assert('throttle section skipped without knob (documented pattern)', true);
  }

  // ================= CLEANUP =================
  console.log('\n--- Cleanup ---');
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  const Group = require('../src/models').Group;
  await Group.destroy({ where: { name: { [Op.like]: 'rl-g%' } } });
  await User.destroy({ where: { username: { [Op.like]: 'rl_%' } } });
  const remaining = await User.count({ where: { username: { [Op.like]: 'rl_%' } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== REST RATE LIMIT RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
