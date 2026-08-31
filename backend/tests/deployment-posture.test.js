/*
 * Phase 9.3 - HTTPS/HSTS/CSP Deployment Posture Tests
 *
 * Architecture: TLS terminates at the reverse proxy — the app itself is plain
 * HTTP. This suite verifies the APPLICATION side of that posture plus the
 * documented proxy configuration (statically — no TLS is exercised in-repo):
 *
 *   1. Default/dev environment (against the running dev server): 5E.3 headers
 *      present; HSTS and CSP deliberately ABSENT (dev must not be broken by
 *      production-only behavior).
 *   2. Production-header logic (in-process, deterministic): an ephemeral
 *      production instance emits conservative HSTS + strict API CSP; a dev
 *      instance emits neither.
 *   3. Production cookie posture: login Set-Cookie flags (Secure/HttpOnly/
 *      SameSite=Lax) for both cookies.
 *   4. Proxy-config static verification: docs/DEPLOYMENT.md contains the
 *      critical directives (TLS, redirect, WS upgrade, matching HSTS, CSP,
 *      no weak protocols, no committed key material).
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start   (port 3000, NODE_ENV=development)
 *   2. Run tests:      node tests/deployment-posture.test.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
};

// Starts the real app in-process on an ephemeral port with a controlled
// NODE_ENV. Returns { server, port, app } and a stop() promise.
async function startApp(env) {
  const dotenv = require('dotenv');
  // Snapshot + clear env so the module under test sees exactly our values.
  const snapshot = { ...process.env };
  delete process.env.NODE_ENV;
  const keys = ['JWT_SECRET', 'CLIENT_ORIGIN', 'PORT', 'TRUST_PROXY', 'DB_DATABASE'];
  keys.forEach(k => delete process.env[k]);
  Object.assign(process.env, env);
  // Fresh module graph so header logic re-reads NODE_ENV.
  const resolved = require.resolve('../src/app');
  delete require.cache[resolved];
  delete require.cache[require.resolve('../src/routes')];
  const app = require('../src/app');
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
        stop: () => new Promise(r => server.close(() => r())),
        restore: () => { process.env = snapshot; }
      });
    });
  });
}

async function get(port, pathname) {
  const r = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return { status: r.status, headers: r.headers };
}

(async () => {
  // ================= 1. DEV SERVER POSTURE (always runs) =================
  console.log('\n--- Dev server (default config) ---');
  const devRes = await fetch(BASE + '/api/health');
  const dh = devRes.headers;
  assert('dev: 5E.3 nosniff header present', dh.get('x-content-type-options') === 'nosniff');
  assert('dev: X-Frame-Options DENY present', dh.get('x-frame-options') === 'DENY');
  assert('dev: Referrer-Policy no-referrer present', dh.get('referrer-policy') === 'no-referrer');
  assert('dev: HSTS deliberately absent (plain-HTTP dev)', dh.get('strict-transport-security') === null);
  assert('dev: API CSP deliberately absent (Vite HMR compatibility)', dh.get('content-security-policy') === null);

  // ================= 2. PRODUCTION-ONLY HEADER LOGIC (in-process) =================
  console.log('\n--- Production header logic (in-process, ephemeral port) ---');
  const prod = await startApp({
    NODE_ENV: 'production',
    JWT_SECRET: 'posture-test-secret-not-a-real-one',
    CLIENT_ORIGIN: 'https://app.example.com',
    DB_DATABASE: 'team-management'
  });
  try {
    const ph = (await get(prod.port, '/api/health')).headers;
    assert('prod: HSTS present with 1-year max-age', ph.get('strict-transport-security') === 'max-age=31536000');
    assert('prod: HSTS conservative (no preload)', !/preload/i.test(ph.get('strict-transport-security') || ''));
    assert('prod: HSTS conservative (no includeSubDomains)', !/includeSubDomains/i.test(ph.get('strict-transport-security') || ''));
    const csp = ph.get('content-security-policy') || '';
    assert('prod: strict API CSP present', csp.includes("default-src 'none'"));
    assert('prod: CSP blocks framing (frame-ancestors none)', csp.includes("frame-ancestors 'none'"));
    assert('prod: CSP has no unsafe-eval / unsafe-inline', !/unsafe-(eval|inline)/.test(csp));
    assert('prod: 5E.3 headers still present', ph.get('x-content-type-options') === 'nosniff' && ph.get('x-frame-options') === 'DENY' && ph.get('referrer-policy') === 'no-referrer');
    assert('prod: app still plain HTTP behind the proxy (health 200 over http)', (await get(prod.port, '/api/health')).status === 200);

    // ---- 3. PRODUCTION COOKIE POSTURE (same instance) ----
    console.log('\n--- Production cookie posture (login on the prod instance) ---');
    const uname = `posture_${Date.now()}`;
    const regRes = await fetch(`http://127.0.0.1:${prod.port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, password: 'testpass123', displayName: 'posture' })
    });
    const setCookies = regRes.headers.getSetCookie ? regRes.headers.getSetCookie() : [];
    const tokenCookie = setCookies.find(c => c.startsWith('token='));
    const refreshCookie = setCookies.find(c => c.startsWith('refreshToken='));
    assert('prod: access-token cookie set on register', !!tokenCookie);
    assert('prod: refresh-token cookie set on register', !!refreshCookie);
    if (tokenCookie) {
      assert('prod: token cookie is HttpOnly', /httponly/i.test(tokenCookie));
      assert('prod: token cookie is Secure (TLS terminates at proxy)', /secure/i.test(tokenCookie));
      assert('prod: token cookie is SameSite=Lax', /samesite=lax/i.test(tokenCookie));
    }
    if (refreshCookie) {
      assert('prod: refreshToken cookie is HttpOnly', /httponly/i.test(refreshCookie));
      assert('prod: refreshToken cookie is Secure', /secure/i.test(refreshCookie));
      assert('prod: refreshToken cookie is SameSite=Lax', /samesite=lax/i.test(refreshCookie));
    }
  } finally {
    await prod.stop();
    prod.restore();
  }

  // Dev instance of the SAME code path emits neither production header.
  const devApp = await startApp({
    NODE_ENV: 'development',
    JWT_SECRET: 'posture-test-secret-not-a-real-one',
    CLIENT_ORIGIN: 'http://localhost:5173',
    DB_DATABASE: 'team-management'
  });
  try {
    const vh = (await get(devApp.port, '/api/health')).headers;
    assert('dev instance: HSTS absent (env-gated, not always-on)', vh.get('strict-transport-security') === null);
    assert('dev instance: CSP absent (env-gated)', vh.get('content-security-policy') === null);
    assert('dev instance: 5E.3 headers still present', vh.get('x-content-type-options') === 'nosniff');
  } finally {
    await devApp.stop();
    devApp.restore();
  }

  // Cleanup: the register fixture user (prod instance shares the same SQLite file).
  const { Op } = require('sequelize');
  const { User } = require('../src/models');
  await User.destroy({ where: { username: { [Op.like]: 'posture_%' } } });
  assert('cleanup removed fixtures', (await User.count({ where: { username: { [Op.like]: 'posture_%' } } })) === 0);

  // ================= 4. PROXY-CONFIG STATIC VERIFICATION =================
  console.log('\n--- Proxy configuration (docs/DEPLOYMENT.md static checks) ---');
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/DEPLOYMENT.md'), 'utf8');
  assert('doc: TLS server block (listen 443 ssl)', /listen 443 ssl/.test(doc));
  assert('doc: modern TLS only (TLSv1.2/1.3)', /TLSv1\.2 TLSv1\.3/.test(doc) && !/TLSv1\.0|TLSv1\.1[^.]/.test(doc));
  assert('doc: HTTP->HTTPS 301 redirect', /return 301 https:\/\//.test(doc));
  assert('doc: HSTS present in proxy config', /Strict-Transport-Security "max-age=31536000"/.test(doc));
  assert('doc: proxy HSTS matches app HSTS (both 31536000)', (doc.match(/max-age=31536000/g) || []).length >= 3);
  assert('doc: WebSocket upgrade for Socket.IO', /proxy_set_header Upgrade \$http_upgrade;/.test(doc) && /proxy_set_header Connection "upgrade";/.test(doc));
  assert('doc: frontend CSP present (minimum viable policy)', /Content-Security-Policy "default-src 'self'/.test(doc));
  assert('doc: frontend CSP has no unsafe-eval', !/unsafe-eval/.test(doc));
  assert('doc: frontend CSP connect-src covers API + WebSocket', /connect-src 'self' https:\/\//.test(doc) && /wss:\/\//.test(doc));
  assert('doc: API-over-proxy forwarded (proxy_pass to app)', /proxy_pass http:\/\/127\.0\.0\.1:3000;/.test(doc));
  assert('doc: no private key material committed (paths only)', /ssl_certificate/.test(doc) && !/BEGIN (RSA )?PRIVATE KEY/.test(doc));
  assert('doc: trust-proxy guidance present', /TRUST_PROXY/.test(doc));
  assert('doc: deployment verification checklist present', /Deployment verification checklist/.test(doc));

  console.log(`\n===== DEPLOYMENT POSTURE RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
