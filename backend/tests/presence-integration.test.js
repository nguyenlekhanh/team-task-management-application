/*
 * Phase 5D.5 - Presence, Membership Eviction, Rate Limiting & Reconnection
 *
 * Integration coverage over the real HTTP surface (Engine.IO v4 polling):
 *   - connection-derived presence with multi-tab counting + grace period
 *   - generation-guarded offline timers (stale timers are no-ops)
 *   - presence broadcasts scoped to co-member group rooms only
 *   - membership removal evicts ALL of a user's sockets from the group room
 *   - join rate limiting (abuse shield) with per-user cleanup on disconnect
 *
 * Requires the server started with fast test knobs:
 *   PRESENCE_GRACE_MS=800 SOCKET_JOIN_LIMIT=8 SOCKET_JOIN_WINDOW_MS=3000
 *
 * Usage:  node tests/presence-integration.test.js
 */
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class PollingClient {
  constructor() { this.sid = null; this.seq = 0; this.queue = []; this.reading = false; this.dead = false; }

  url(extra = '') {
    return `${BASE}/socket.io/?EIO=4&transport=polling&t=${Date.now()}${Math.random()}${extra}`;
  }

  async handshake(cookieHeader) {
    const res = await fetch(this.url(), { headers: cookieHeader ? { Cookie: cookieHeader } : {} });
    const text = await res.text();
    if (!text.startsWith('0')) throw new Error('unexpected handshake frame');
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
          this.dead = true;
          break;
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

  parseEvent(frame, seq) {
    try {
      const p = JSON.parse(frame.slice(seq ? seq.length : 2));
      return Array.isArray(p) ? p : [p];
    } catch { return null; }
  }

  async connect(token, cookieHeader) {
    await this.handshake(cookieHeader);
    this.startReader();
    await this.send('40' + JSON.stringify(token ? { token } : {}));
    const f = await this.nextFrame(f => f.startsWith('40'), 5000);
    if (!f) throw new Error('connect failed');
  }

  // Graceful close via socket.io CLOSE packet ('41') -> triggers server-side disconnect.
  async close() {
    this.stop();
    try { await this.send('41'); } catch {}
  }

  async emitAck(event, payload) {
    const seq = String(++this.seq);
    await this.send(`42${seq}${JSON.stringify([event, payload])}`);
    const f = await this.nextFrame(f => f.startsWith(`43${seq}`), 5000);
    if (!f) return null;
    const p = this.parseEvent(f, `43${seq}`);
    return p ? p[0] : null;
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
        if (p && names.includes(p[0])) {
          out[p[0]].push(p[1]);
          this.queue.splice(i, 1);
        }
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
  await rest('POST', '/api/auth/register', { body: { username: uname, password: 'testpass123', displayName: username } });
  const login = await rest('POST', '/api/auth/login', { body: { username: uname, password: 'testpass123' } });
  return { id: login.data.user.id, token: login.data.token, username: uname };
}

(async () => {
  console.log('--- Setup ---');
  const owner = await registerAndLogin('pr_owner');
  const alice = await registerAndLogin('pr_alice');
  const bob = await registerAndLogin('pr_bob');     // unrelated user (no shared groups)
  const carol = await registerAndLogin('pr_carol'); // rate-limit subject

  const g = await rest('POST', '/api/groups', { token: owner.token, body: { name: `pr-group-${Date.now()}` } });
  const groupId = g.data.group.id;
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: alice.id, role: 'member' } });
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: carol.id, role: 'member' } });

  const sockOwner = new PollingClient(); await sockOwner.connect(owner.token);
  await sockOwner.emitAck('group:join', { groupId }); // owner listens inside the group room

  // ================= PRESENCE BASICS =================
  console.log('\n--- Presence: online transition + scope ---');
  const aliceS1 = new PollingClient(); await aliceS1.connect(alice.token);

  const onlineEvt = await sockOwner.waitFor('presence:updated', 5000);
  assert('online broadcast received by co-member', !!onlineEvt &&
    onlineEvt.userId === alice.id && onlineEvt.online === true && typeof onlineEvt.at === 'string');
  assert('payload minimal (no sockets/secrets)', onlineEvt && !('socketId' in onlineEvt) && !JSON.stringify(onlineEvt).toLowerCase().includes('password'));

  const bobSock = new PollingClient(); await bobSock.connect(bob.token);
  const bobWin = await bobSock.collectEvents(['presence:updated'], 1800);
  assert('unrelated user receives no presence events', bobWin['presence:updated'].length === 0);

  // ================= MULTI-TAB COUNTING =================
  console.log('\n--- Presence: multi-tab ---');
  const aliceS2 = new PollingClient(); await aliceS2.connect(alice.token);
  const dupOnline = await sockOwner.collectEvents(['presence:updated'], 1500);
  assert('second tab produces NO duplicate online transition',
    !dupOnline['presence:updated'].some(e => e.userId === alice.id && e.online === true));

  await aliceS1.close();
  const afterFirstClose = await sockOwner.collectEvents(['presence:updated'], 1600); // > grace(800ms)
  assert('one of two tabs disconnecting does NOT mark offline',
    !afterFirstClose['presence:updated'].some(e => e.userId === alice.id && e.online === false));

  // ================= GRACE PERIOD + STALE TIMER PROTECTION =================
  console.log('\n--- Presence: grace period ---');
  await aliceS2.close();
  const graceWin = await sockOwner.collectEvents(['presence:updated'], 3500);
  assert('final disconnect -> offline broadcast after grace expiry',
    graceWin['presence:updated'].some(e => e.userId === alice.id && e.online === false));

  // reconnect DURING grace must cancel offline (stale timer becomes no-op)
  const aliceR1 = new PollingClient(); await aliceR1.connect(alice.token);
  const r1Online = await sockOwner.waitFor('presence:updated', 4000);
  assert('reconnect broadcasts online again', r1Online && r1Online.userId === alice.id && r1Online.online === true);
  await aliceR1.close();
  await sleep(250); // still inside the 800ms grace window...
  const aliceR2 = new PollingClient(); await aliceR2.connect(alice.token); // ...reconnect cancels it
  const staleWindow = await sockOwner.collectEvents(['presence:updated'], 2200); // old timer would fire here
  assert('stale timer did NOT mark reconnected user offline',
    !staleWindow['presence:updated'].some(e => e.userId === alice.id && e.online === false));
  assert('no duplicate online event from cancel+reconnect within same window',
    staleWindow['presence:updated'].filter(e => e.userId === alice.id && e.online === true).length <= 1);

  // ================= MEMBERSHIP EVICTION =================
  console.log('\n--- Membership eviction ---');
  await aliceR2.emitAck('group:join', { groupId });
  const whoBefore = await aliceR2.emitAck('foundation:whoami');
  assert('member joined group room pre-removal', whoBefore && whoBefore.rooms.includes(`group:${groupId}`));

  const removed = await rest('DELETE', `/api/groups/${groupId}/members/${alice.id}`, { token: owner.token });
  assert('membership removal succeeds', removed.status === 200);

  const whoAfter = await aliceR2.emitAck('foundation:whoami');
  assert('ALL user sockets evicted from group room on removal',
    whoAfter && !whoAfter.rooms.includes(`group:${groupId}`));

  await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'evicted?' } });
  const evictedMsgs = await aliceR2.collectEvents(['message:new'], 2200);
  assert('removed member receives no group messages', evictedMsgs['message:new'].length === 0);
  const evictedNotifs = await aliceR2.collectEvents(['notification:new'], 1200);
  assert('removed member gets no NEW_MESSAGE notification either', evictedNotifs['notification:new'].length === 0);

  const rejoinAttempt = await aliceR2.emitAck('group:join', { groupId });
  assert('removed member cannot rejoin', rejoinAttempt && rejoinAttempt.ok === false && /member/i.test(rejoinAttempt.error));

  // re-add restores authorization
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: alice.id, role: 'member' } });
  const rejoinOk = await aliceR2.emitAck('group:join', { groupId });
  assert('re-added member can join again', rejoinOk && rejoinOk.ok === true);
  await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'welcome back' } });
  const backMsgs = await aliceR2.waitFor('message:new', 4000);
  assert('restored member receives live messages again', backMsgs && backMsgs.content === 'welcome back');

  // unrelated rooms untouched: second group survives another group's eviction
  const g2 = await rest('POST', '/api/groups', { token: owner.token, body: { name: `pr-g2-${Date.now()}` } });
  await rest('POST', `/api/groups/${g2.data.group.id}/members`, { token: owner.token, body: { userId: alice.id, role: 'member' } });
  await aliceR2.emitAck('group:join', { groupId: g2.data.group.id });
  await rest('DELETE', `/api/groups/${groupId}/members/${alice.id}`, { token: owner.token }); // evict from g1 only
  const whoG2 = await aliceR2.emitAck('foundation:whoami');
  assert('unrelated group room untouched by another group eviction',
    whoG2 && whoG2.rooms.includes(`group:${g2.data.group.id}`) && !whoG2.rooms.includes(`group:${groupId}`));

  // ================= JOIN RATE LIMITING =================
  console.log('\n--- Join rate limiting ---');
  const carolSock = new PollingClient(); await carolSock.connect(carol.token);
  let throttled = null, allowedCount = 0;
  for (let i = 0; i < 14; i++) {
    const r = await carolSock.emitAck('group:join', { groupId });
    if (r && r.ok === true) allowedCount++;
    else if (r && /Too many/i.test(r.error)) { throttled = r; break; }
  }
  assert('normal joins allowed up to limit', allowedCount >= 5);
  assert('rapid join abuse throttled', !!throttled && /Too many/i.test(throttled.error));

  // authorization independent from throttling: fresh unauthorized user gets authz error
  const dave = await registerAndLogin('pr_dave');
  const daveSock = new PollingClient(); await daveSock.connect(dave.token);
  const daveRes = await daveSock.emitAck('group:join', { groupId });
  assert('authorization independent: unauthorized join rejected with authz error', daveRes && daveRes.ok === false && /member/i.test(daveRes.error));

  // unrelated user unaffected during someone else's throttle window
  await sockOwner.emitAck('group:leave', { groupId });
  const ownerJoinDuringThrottle = await sockOwner.emitAck('group:join', { groupId });
  assert('other users unaffected during someone else throttle window', ownerJoinDuringThrottle && ownerJoinDuringThrottle.ok === true);

  // reconnect does not inherit stale counters (clearUser on disconnect)
  await carolSock.close();
  await sleep(200);
  const carolRe = new PollingClient(); await carolRe.connect(carol.token);
  const carolReJoin = await carolRe.emitAck('group:join', { groupId });
  assert('reconnect starts with clean rate-limit state', carolReJoin && carolReJoin.ok === true);

  // ================= RECONNECT / RESYNC MATRIX =================
  console.log('\n--- Reconnect matrix ---');
  await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'pre-reconnect' } });
  const carolGot = await carolRe.waitFor('message:new', 3000);
  assert('chat delivery intact across reconnect cycle', carolGot && carolGot.content === 'pre-reconnect');

  // security spot-check: no client-controlled presence command exists
  const fakePresence = await carolRe.emitAck('presence:setOnline', { userId: alice.id });
  assert('client cannot set presence manually (command ignored)', fakePresence === null || fakePresence === undefined);

  // ================= CLEANUP =================
  console.log('\n--- Cleanup ---');
  [sockOwner, aliceS1, aliceS2, aliceR1, aliceR2, bobSock, carolSock, carolRe, daveSock].forEach(s => s.stop());
  await rest('DELETE', `/api/groups/${groupId}`, { token: owner.token });
  await rest('DELETE', `/api/groups/${g2.data.group.id}`, { token: owner.token });
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  const names = [owner.username, alice.username, bob.username, carol.username, dave.username].filter(Boolean);
  await User.destroy({ where: { username: { [Op.in]: names } } });
  const remaining = await User.count({ where: { username: { [Op.in]: names } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== PRESENCE INTEGRATION RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
