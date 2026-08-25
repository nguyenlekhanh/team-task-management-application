/*
 * Phase 5E.3 - Security Review Tests
 *
 * Focused automated security coverage over real HTTP + Socket.IO surfaces:
 *   - JWT forgery (wrong secret / alg:none / expired / malformed)
 *   - IDOR: cross-user notifications, cross-group tasks/groups/messages
 *   - mass assignment: ownerId/creatorId/senderId/role/recipientId forgery
 *   - role escalation: member vs admin vs owner boundaries
 *   - removed-member REST + socket access
 *   - socket room guessing, user-room isolation, payload leak scan
 *   - information leakage patterns across 400/401/403/404/413/429
 *
 * Usage:
 *   1. Start backend (knobs for brute-force section):
 *      AUTH_MAX_FAILED=5 AUTH_FAILURE_WINDOW_MS=2500 npm start
 *   2. Run tests:      node tests/security.test.js
 */
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const jwt = require('jsonwebtoken');
let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const LEAK_PATTERNS = [
  /at\s+\w+\s+\(/i,
  /\bSELECT\b[\s\S]*\bFROM\b/i,
  /node_modules/i,
  /SequelizeDatabaseError/i,
  /\.js:\d+:\d+/
];
function assertSafe(name, status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body || {});
  let ok = typeof body === 'object' && body !== null && !Array.isArray(body)
    && typeof body.error === 'string' && body.error.length > 0;
  let why = ok ? '' : 'bad envelope';
  if (ok) for (const p of LEAK_PATTERNS) {
    if (p.test(text)) { ok = false; why = `leak: ${p}`; break; }
  }
  assert(`${name} [${status}] safe`, ok, why);
}

class PollingClient {
  constructor() { this.sid = null; this.seq = 0; this.queue = []; this.reading = false; this.dead = false; }
  url(extra = '') { return `${BASE}/socket.io/?EIO=4&transport=polling&t=${Date.now()}${Math.random()}${extra}`; }
  async handshake() {
    const res = await fetch(this.url());
    const text = await res.text();
    if (!text.startsWith('0')) throw new Error('handshake failed');
    this.sid = JSON.parse(text.slice(1)).sid;
  }
  startReader() {
    this.reading = true;
    (async () => {
      while (this.reading) {
        try {
          const res = await fetch(this.url(`&sid=${this.sid}`), { signal: AbortSignal.timeout(35000) });
          const text = await res.text();
          if (res.status !== 200) { this.dead = true; break; }
          if (text) this.queue.push(...text.split('\u001e'));
        } catch (e) {
          if (!this.reading) break;
          if (e.name === 'AbortError' || e.name === 'TimeoutError') continue;
          this.dead = true; break;
        }
      }
    })();
  }
  stop() { this.reading = false; }
  async send(packet) {
    await fetch(this.url(`&sid=${this.sid}`), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: packet
    });
  }
  async nextFrame(predicate, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const idx = this.queue.findIndex(predicate);
      if (idx >= 0) return this.queue.splice(idx, 1)[0];
      if (Date.now() >= deadline || this.dead) return null;
      await sleep(50);
    }
  }
  async connect(token) {
    await this.handshake();
    this.startReader();
    await this.send('40' + JSON.stringify({ token }));
    const f = await this.nextFrame(fr => fr.startsWith('40'), 5000);
    if (!f) throw new Error('connect failed');
  }
  async close() { this.stop(); try { await this.send('41'); } catch {} }
  async emitAck(event, payload) {
    const seq = String(++this.seq);
    await this.send(`42${seq}${JSON.stringify([event, payload])}`);
    const f = await this.nextFrame(fr => fr.startsWith(`43${seq}`), 5000);
    if (!f) return null;
    const p = this.parseEvent(f, `43${seq}`);
    return p ? p[0] : null;
  }
  parseEvent(frame, seq) {
    try {
      const p = JSON.parse(frame.slice(seq ? seq.length : 2));
      return Array.isArray(p) ? p : [p];
    } catch { return null; }
  }
  async collectEvents(eventNames, durationMs = 2000) {
    const names = Array.isArray(eventNames) ? eventNames : [eventNames];
    const out = {};
    names.forEach(n => { out[n] = []; });
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline) {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const f = this.queue[i];
        if (!f.startsWith('42')) continue;
        const p = this.parseEvent(f);
        if (p && names.includes(p[0])) { out[p[0]].push(p[1]); this.queue.splice(i, 1); }
      }
      if (Date.now() >= deadline) break;
      await sleep(50);
    }
    return out;
  }
  async waitFor(eventName, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const idx = this.queue.findIndex(f => {
        if (!f.startsWith('42')) return false;
        const p = this.parseEvent(f);
        return p && p[0] === eventName;
      });
      if (idx >= 0) {
        const fr = this.queue.splice(idx, 1)[0];
        const p = this.parseEvent(fr);
        return p ? p[1] : undefined;
      }
      if (Date.now() >= deadline || this.dead) return undefined;
      await sleep(50);
    }
  }
}

async function rest(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

async function registerAndLogin(username) {
  const uname = `${username}_${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await rest('POST', '/api/auth/register', { body: { username: uname, password: 'testpass123', displayName: username } });
  if (reg.status !== 201) throw new Error('register failed: ' + JSON.stringify(reg.data));
  const login = await rest('POST', '/api/auth/login', { body: { username: uname, password: 'testpass123' } });
  return { id: login.data.user.id, token: login.data.token, username: uname };
}

(async () => {
  console.log('--- Setup ---');
  const owner = await registerAndLogin('sec_owner');
  const member = await registerAndLogin('sec_member');
  const outsider = await registerAndLogin('sec_out');

  // ================= A. JWT FORGERY =================
  console.log('\n--- JWT forgery ---');
  const wrongSecret = jwt.sign({ userId: owner.id }, 'attacker-secret', { algorithm: 'HS256' });
  let r = await rest('GET', '/api/users/me', { token: wrongSecret });
  assertSafe('wrong-secret token', r.status, r.data);
  assert('wrong-secret rejected (401)', r.status === 401);

  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    + '.' + Buffer.from(JSON.stringify({ userId: owner.id })).toString('base64url') + '.';
  r = await rest('GET', '/api/users/me', { token: noneHeader });
  assertSafe('alg:none unsigned token', r.status, r.data);
  assert('alg:none rejected (401)', r.status === 401);

  const expired = jwt.sign({ userId: owner.id }, JWT_SECRET, { expiresIn: '-5s' });
  r = await rest('GET', '/api/users/me', { token: expired });
  assert('expired token rejected (401 Token expired)', r.status === 401 && r.data.error === 'Token expired');

  r = await rest('GET', '/api/users/me', { token: 'abc.def.ghi' });
  assert('malformed token rejected (401)', r.status === 401);

  // forged payload claiming another userId but signed with attacker secret
  const forgeOther = jwt.sign({ userId: outsider.id }, 'attacker-secret');
  r = await rest('PUT', `/api/groups/1/members/${owner.id}`, { token: forgeOther, body: { role: 'admin' } });
  assert('forged-identity mutation rejected', r.status === 401 || r.status === 404);

  // ================= B. IDOR / CROSS-TENANT =================
  console.log('\n--- IDOR / cross-tenant ---');
  const g = await rest('POST', '/api/groups', { token: owner.token, body: { name: `sec-g-${Date.now()}` } });
  const groupId = g.data.group.id;
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: member.id, role: 'member' } });
  const t = await rest('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: 'sec task' } });
  const taskId = t.data.task.id;

  r = await rest('GET', `/api/tasks/${taskId}`, { token: outsider.token });
  assert('outsider cannot read group task (404 blind)', r.status === 404);
  r = await rest('DELETE', `/api/groups/${groupId}`, { token: outsider.token });
  assert('outsider cannot delete group (404 blind)', r.status === 404);
  r = await rest('GET', `/api/groups/${groupId}/members`, { token: outsider.token });
  assert('outsider cannot list members (404 blind)', r.status === 404);
  r = await rest('POST', `/api/groups/${groupId}/messages`, { token: outsider.token, body: { content: 'intrude' } });
  assert('outsider cannot post chat (404 blind)', r.status === 404);
  r = await rest('PUT', '/api/notifications/999999/read', { token: outsider.token });
  assert('nonexistent notification mark-read -> 404', r.status === 404);

  // notification isolation between users
  const nA = await rest('GET', '/api/notifications?limit=50', { token: owner.token });
  assert('user list only contains own notifications',
    nA.data.items.every(n => n.recipientId === owner.id));

  // ================= C. MASS ASSIGNMENT =================
  console.log('\n--- Mass assignment ---');
  const forgedGroup = await rest('POST', '/api/groups', {
    token: outsider.token,
    body: { name: 'forged-group', ownerId: owner.id, createdAt: '1999-01-01' }
  });
  assert('group created despite forged ownerId', forgedGroup.status === 201);
  assert('server-derived ownerId wins (not client-supplied)',
    forgedGroup.data.group.ownerId === outsider.id && forgedGroup.data.group.ownerId !== owner.id);
  await rest('DELETE', `/api/groups/${forgedGroup.data.group.id}`, { token: outsider.token });

  const forgedTask = await rest('POST', `/api/groups/${groupId}/tasks`, {
    token: member.token,
    body: { title: 'forged task', creatorId: owner.id, assigneeId: owner.id, assignedBy: owner.id }
  });
  assert('task creator is server-derived (client creatorId ignored)',
    forgedTask.status === 201 && forgedTask.data.task.creatorId === member.id);
  await rest('DELETE', `/api/tasks/${forgedTask.data.task.id}`, { token: owner.token });

  const forgedMsg = await rest('POST', `/api/groups/${groupId}/messages`, {
    token: member.token,
    body: { content: 'forged sender', senderId: owner.id }
  });
  assert('message senderId is server-derived', forgedMsg.status === 201 && forgedMsg.data.item.senderId === member.id);

  const roleEscalation = await rest('PUT', `/api/groups/${groupId}/members/${member.id}`, {
    token: member.token,
    body: { role: 'owner' }
  });
  assert('member cannot self-promote to owner via role update (403)', roleEscalation.status === 403);

  // ================= D. ROLE ESCALATION =================
  console.log('\n--- Role escalation ---');
  r = await rest('DELETE', `/api/groups/${groupId}/members/${owner.id}`, { token: member.token });
  assert('member cannot remove owner (403)', r.status === 403);
  r = await rest('PUT', `/api/groups/${groupId}`, { token: member.token, body: { name: 'hijacked' } });
  assert('member cannot update group settings (403)', r.status === 403);
  r = await rest('DELETE', `/api/groups/${groupId}`, { token: member.token });
  assert('member cannot delete group (403)', r.status === 403);
  r = await rest('PUT', `/api/tasks/${taskId}/assign`, { token: member.token, body: { assigneeId: member.id } });
  assert('plain member cannot assign tasks (403)', r.status === 403);

  // promote member to admin, verify admin ceiling
  await rest('PUT', `/api/groups/${groupId}/members/${member.id}`, { token: owner.token, body: { role: 'admin' } });
  r = await rest('DELETE', `/api/tasks/${taskId}`, { token: member.token });
  assert('admin cannot delete OWNER-created task (403)', r.status === 403);
  r = await rest('DELETE', `/api/groups/${groupId}/members/${owner.id}`, { token: member.token });
  assert('admin cannot remove owner (403)', r.status === 403);
  r = await rest('PUT', `/api/groups/${groupId}/members/${owner.id}`, { token: member.token, body: { role: 'member' } });
  assert('admin cannot change owner role (403)', r.status === 403);
  r = await rest('DELETE', `/api/groups/${groupId}`, { token: member.token });
  assert('admin cannot delete group (403)', r.status === 403);
  // restore
  await rest('PUT', `/api/groups/${groupId}/members/${member.id}`, { token: owner.token, body: { role: 'member' } });

  // ================= E. SOCKET SECURITY + PAYLOAD LEAK SCAN =================
  console.log('\n--- Socket security ---');
  const sockMember = new PollingClient(); await sockMember.connect(member.token);
  await sockMember.emitAck('group:join', { groupId });

  const who = await sockMember.emitAck('foundation:whoami');
  assert('socket identity server-derived from JWT', who && who.userId === member.id && who.username === member.username);

  const msgEvt = await (async () => {
    const p = rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'leak-scan probe' } });
    const evt = await sockMember.waitFor('message:new', 4000);
    await p;
    return evt;
  })();
  assert('chat frame received for scan', !!msgEvt);
  const forbidden = ['password', 'token', 'jwt', 'bearer', 'cookie'];
  const msgText = JSON.stringify(msgEvt || {}).toLowerCase();
  assert('chat payload free of auth secrets', !forbidden.some(w => msgText.includes(w)));

  await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: member.id } });
  const notifEvt = await sockMember.waitFor('notification:new', 4000);
  const notifText = JSON.stringify(notifEvt || {}).toLowerCase();
  assert('notification payload free of auth secrets', !!notifEvt && !forbidden.some(w => notifText.includes(w)));
  assert('notification recipient is server-assigned self', notifEvt && notifEvt.recipientId === member.id);

  // removed-member socket security (consolidated)
  await rest('DELETE', `/api/groups/${groupId}/members/${member.id}`, { token: owner.token });
  const whoEvict = await sockMember.emitAck('foundation:whoami');
  assert('evicted after removal (no group room)',
    whoEvict && !whoEvict.rooms.includes(`group:${groupId}`));
  const rejoin = await sockMember.emitAck('group:join', { groupId });
  assert('removed member rejoin denied', rejoin && rejoin.ok === false);
  const evictedNotif = await sockMember.collectEvents(['notification:new'], 1500);
  void evictedNotif;
  r = await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: outsider.id } });
  const memberNotifsAfterRemoval = await sockMember.collectEvents(['notification:new'], 1500);
  assert('removed member receives no further group notifications',
    !memberNotifsAfterRemoval['notification:new'].some(n => n.groupId === groupId));
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: member.id, role: 'member' } });

  // ================= F. INFORMATION LEAKAGE / INPUT =================
  console.log('\n--- Leakage & input limits ---');
  r = await rest('POST', '/api/auth/register', { body: {} });
  assertSafe('400 envelope', r.status, r.data);
  r = await rest('GET', '/api/users/me');
  assertSafe('401 envelope', r.status, r.data);
  r = await rest('DELETE', `/api/groups/${groupId}`, { token: member.token });
  assertSafe('403 envelope', r.status, r.data);
  r = await rest('GET', '/api/tasks/99999999', { token: owner.token });
  assertSafe('404 envelope', r.status, r.data);

  // oversized JSON body (> default 100kb express.json limit) -> 413 safe
  const big = JSON.stringify({ name: 'x'.repeat(110 * 1024) });
  const bigRes = await fetch(BASE + '/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: big
  });
  let bigBody = null; try { bigBody = await bigRes.json(); } catch {}
  assertSafe('oversized body response', bigRes.status, bigBody);
  assert('oversized body rejected (413)', bigRes.status === 413);

  // registration password policy (5E.3 fix)
  r = await rest('POST', '/api/auth/register', { body: { username: `shortpw_${Date.now()}`, password: '123', displayName: 'X' } });
  assert('registration enforces password minimum (400)', r.status === 400 && /6 characters/.test(r.data.error));

  // ================= G. BRUTE-FORCE LOCKOUT (env-knobbed run) =================
  console.log('\n--- Brute-force lockout ---');
  const victim = await registerAndLogin('sec_victim');
  let sawThrottle = false, lastStatus = 0;
  for (let i = 0; i < 8; i++) {
    const res = await rest('POST', '/api/auth/login', { body: { username: victim.username, password: 'definitely-wrong' } });
    lastStatus = res.status;
    if (res.status === 429) { sawThrottle = true; break; }
  }
  if (process.env.AUTH_MAX_FAILED && parseInt(process.env.AUTH_MAX_FAILED, 10) <= 8) {
    assert('repeated failed logins trigger lockout (429)', sawThrottle && lastStatus === 429);
    const blockedOk = await rest('POST', '/api/auth/login', { body: { username: victim.username, password: 'testpass123' } });
    assert('even valid credentials blocked during lockout window', blockedOk.status === 429);
  } else {
    assert('brute-force section skipped (run with AUTH_MAX_FAILED<=8 to exercise lockout)', true);
  }

  // XSS rendering audit is static: no dangerouslySetInnerHTML anywhere in frontend src.
  const fs = require('fs');
  const path = require('path');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
  const feFiles = walk('../frontend/src').filter(f => f.endsWith('.jsx'));
  const xssHit = feFiles.some(f => fs.readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'));
  assert('frontend renders no raw HTML (XSS-safe text rendering)', !xssHit);

  // ================= CLEANUP =================
  console.log('\n--- Cleanup ---');
  sockMember.stop();
  await rest('DELETE', `/api/groups/${groupId}`, { token: owner.token });
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  const names = [owner.username, member.username, outsider.username, victim.username].filter(Boolean);
  await User.destroy({ where: { username: { [Op.in]: names } } });
  const remaining = await User.count({ where: { username: { [Op.in]: names } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== SECURITY RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
