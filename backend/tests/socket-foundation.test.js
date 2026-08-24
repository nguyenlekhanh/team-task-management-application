/*
 * Phase 5D.2 - Socket.IO Foundation Tests
 *
 * Verifies the realtime foundation over the real HTTP surface using the
 * Engine.IO v4 polling transport (pure fetch - no socket.io-client dependency):
 * handshake authentication (missing/invalid/expired/nonexistent-user/valid),
 * cookie fallback, user-room join, emitter targeting, unknown-event safety,
 * disconnect handling and REST coexistence.
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start     (port 3000)
 *   2. Run tests:      node tests/socket-foundation.test.js
 */
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const jwt = require('jsonwebtoken');
let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
};

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// --- Minimal Socket.IO polling client (Engine.IO EIO=4) ---
class PollingClient {
  constructor() { this.sid = null; }

  async handshake(cookieHeader) {
    const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=polling&t=${Date.now()}${Math.random()}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {}
    });
    const text = await res.text();
    if (!text.startsWith('0')) throw new Error('unexpected handshake frame: ' + text.slice(0, 80));
    this.sid = JSON.parse(text.slice(1)).sid;
    return true;
  }

  async send(packet) {
    await fetch(`${BASE}/socket.io/?EIO=4&transport=polling&sid=${this.sid}&t=${Date.now()}${Math.random()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: packet
    });
  }

  // Drains queued packets. Resolves array of frames; empty if nothing within timeoutMs.
  async poll(timeoutMs = 5000) {
    try {
      const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=polling&sid=${this.sid}&t=${Date.now()}${Math.random()}`, {
        signal: AbortSignal.timeout(timeoutMs)
      });
      const text = await res.text();
      return text ? text.split('\u001e') : [];
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') return [];
      throw e;
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

async function connectNamespace(client, authPayload) {
  await client.send('40' + (authPayload ? JSON.stringify(authPayload) : ''));
  const frames = await client.poll();
  return frames;
}

(async () => {
  // ---- setup: two REST users ----
  const uname = `sok_${Date.now()}`;
  await rest('POST', '/api/auth/register', { body: { username: uname + 'a', password: 'testpass123', displayName: 'Sock A' } });
  await rest('POST', '/api/auth/register', { body: { username: uname + 'b', password: 'testpass123', displayName: 'Sock B' } });
  const a = (await rest('POST', '/api/auth/login', { body: { username: uname + 'a', password: 'testpass123' } })).data;
  const b = (await rest('POST', '/api/auth/login', { body: { username: uname + 'b', password: 'testpass123' } })).data;
  assert('setup: users registered + logged in', !!a.token && !!b.token);

  const expiredToken = jwt.sign({ userId: a.user.id }, JWT_SECRET, { expiresIn: '-10s' });
  const ghostToken = jwt.sign({ userId: 99999999 }, JWT_SECRET, { expiresIn: '15m' });

  // ================= AUTHENTICATION =================
  console.log('\n--- Handshake authentication ---');
  let c = new PollingClient();
  await c.handshake();
  let frames = await connectNamespace(c);
  assert('missing token rejected with safe reason', frames.some(f => f.startsWith('44') && f.includes('Authentication required')));

  c = new PollingClient(); await c.handshake();
  frames = await connectNamespace(c, { token: 'garbage.token' });
  assert('invalid token rejected', frames.some(f => f.startsWith('44') && f.includes('Invalid token')));

  c = new PollingClient(); await c.handshake();
  frames = await connectNamespace(c, { token: expiredToken });
  assert('expired token rejected', frames.some(f => f.startsWith('44') && f.includes('Token expired')));

  c = new PollingClient(); await c.handshake();
  frames = await connectNamespace(c, { token: ghostToken });
  assert('token for nonexistent user rejected', frames.some(f => f.startsWith('44') && f.includes('User not found')));

  // valid token accepted + identity + own private room
  c = new PollingClient(); await c.handshake();
  frames = await connectNamespace(c, { token: a.token });
  const connack = frames.find(f => f.startsWith('40'));
  assert('valid token accepted (namespace connack)', !!connack);

  // whoami ack proves identity + room membership
  const whoamiSeq = String(Math.floor(Math.random() * 900) + 100);
  await c.send(`42${whoamiSeq}["foundation:whoami"]`);
  frames = await c.poll();
  const ackFrame = frames.find(f => f.startsWith(`43${whoamiSeq}`));
  assert('foundation:whoami ack received', !!ackFrame, JSON.stringify(frames));
  const parseAck = (frame) => {
    const parsed = JSON.parse(frame.slice((`43${whoamiSeq}`).length));
    return Array.isArray(parsed) ? parsed[0] : parsed;
  };
  const whoami = ackFrame ? parseAck(ackFrame) : null;
  assert('identity attached to socket (own userId)', whoami && whoami.userId === a.user.id && whoami.username.endsWith('a'));
  assert("socket joined its own user room user:{id}", whoami && Array.isArray(whoami.rooms) && whoami.rooms.includes(`user:${a.user.id}`));
  assert('no other user room joined', whoami && !whoami.rooms.some(r => r.startsWith('user:') && r !== `user:${a.user.id}`));

  // cookie fallback: no auth payload, token via httpOnly-style cookie
  const cc = new PollingClient();
  await cc.handshake(`token=${encodeURIComponent(a.token)}`);
  frames = await connectNamespace(cc);
  assert('cookie fallback authenticates (no auth payload)', frames.some(f => f.startsWith('40')));

  // client cannot influence room assignment: unknown event must not change rooms
  await c.send(`42["group:join",{"groupId":11,"userId":${b.user.id}}]`);
  await c.send(`42["task:join",{"taskId":16}]`);
  const seq2 = String(Math.floor(Math.random() * 900) + 100);
  await c.send(`42${seq2}["foundation:whoami"]`);
  frames = await c.poll();
  const ack2 = frames.find(f => f.startsWith(`43${seq2}`));
  const whoami2 = ack2 ? parseAck(ack2.replace(`43${seq2}`, `43${whoamiSeq}`)) : null;
  assert(
    "unknown join commands ignored - still only in own user room",
    whoami2 && whoami2.userId === a.user.id &&
    whoami2.rooms.includes(`user:${a.user.id}`) &&
    !whoami2.rooms.some(r => r.startsWith('group:') || r.startsWith('task:')),
    JSON.stringify(whoami2 && whoami2.rooms)
  );

  // ================= EMITTER (in-process unit layer) =================
  console.log('\n--- Realtime emitter unit checks ---');
  const emitterPath = require.resolve('../src/services/realtimeEmitter');
  delete require.cache[emitterPath];
  const emitter = require('../src/services/realtimeEmitter');

  const sent = [];
  const fakeIo = { to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }) };

  assert('emitter is no-op before init (returns false)', emitter.emitToUser(a.user.id, 'x', {}) === false);
  assert('emitter reports uninitialized', emitter.isInitialized() === false);

  emitter.init(fakeIo);
  assert('emitter initialized', emitter.isInitialized() === true);
  emitter.emitToUser(a.user.id, 'notification:new', { id: 1 });
  assert('emitToUser targets exact user:{id} room', sent.length === 1 && sent[0].room === `user:${a.user.id}` && sent[0].event === 'notification:new');
  emitter.emitToUser(null, 'e', {});
  emitter.emitToUser(undefined, 'e', {});
  assert('emitToUser ignores null/undefined userId', sent.length === 1);
  emitter.emitToRoom('group:5', 'message:new', { id: 2 });
  assert('emitToRoom targets given room', sent.length === 2 && sent[1].room === 'group:5');
  emitter.reset();
  assert('emitter reset restores no-op safety', emitter.emitToUser(a.user.id, 'x', {}) === false);

  // string userId coercion consistency with notificationService contract
  emitter.init(fakeIo);
  emitter.emitToUser(String(b.user.id), 'e', {});
  assert('string userId coerced to canonical room name', sent.length === 3 && sent[2].room === `user:${b.user.id}`);
  emitter.reset();

  // ================= DISCONNECT / LIFECYCLE =================
  console.log('\n--- Connection lifecycle ---');
  await c.send('41'); // graceful close packet
  await new Promise(r => setTimeout(r, 300));
  const health = await rest('GET', '/api/health');
  assert('server healthy after client disconnect', health.status === 200);

  // REST coexistence after sockets active
  const me = await rest('GET', '/api/users/me', { token: a.token });
  const notifs = await rest('GET', '/api/notifications/unread-count', { token: b.token });
  assert('REST endpoints unaffected while socket layer active', me.status === 200 && notifs.status === 200);

  console.log(`\n===== SOCKET FOUNDATION RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
