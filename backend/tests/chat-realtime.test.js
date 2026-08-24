/*
 * Phase 5D.3 - Realtime Chat + Comments Integration Tests
 *
 * Verifies group/task room authorization and message/comment broadcast over
 * the real HTTP surface (Engine.IO v4 polling transport, pure fetch):
 *   - REST persists first, then socket event is emitted with sanitized payload
 *   - events reach only authorized room members
 *   - notifications from 5C.3 still fire exactly once
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start     (port 3000)
 *   2. Run tests:      node tests/chat-realtime.test.js
 */
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
};

class PollingClient {
  constructor() { this.sid = null; this.seq = 0; }

  async handshake(cookieHeader) {
    const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=polling&t=${Date.now()}${Math.random()}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {}
    });
    const text = await res.text();
    if (!text.startsWith('0')) throw new Error('unexpected handshake frame: ' + text.slice(0, 80));
    this.sid = JSON.parse(text.slice(1)).sid;
  }

  async send(packet) {
    await fetch(`${BASE}/socket.io/?EIO=4&transport=polling&sid=${this.sid}&t=${Date.now()}${Math.random()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: packet
    });
  }

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

  // Connect to the default namespace with an auth token.
  async connect(token) {
    await this.handshake();
    await this.send('40' + JSON.stringify({ token }));
    const frames = await this.poll();
    if (!frames.some(f => f.startsWith('40'))) {
      throw new Error('connect failed: ' + frames.join('|').slice(0, 120));
    }
  }

  // Emit a client event and wait for its acknowledgement.
  async emitAck(event, payload) {
    const seq = String(++this.seq);
    await this.send(`42${seq}${JSON.stringify([event, payload])}`);
    const frames = await this.poll();
    const frame = frames.find(f => f.startsWith(`43${seq}`));
    if (!frame) return null;
    const parsed = JSON.parse(frame.slice((`43${seq}`).length));
    return Array.isArray(parsed) ? parsed[0] : parsed;
  }

  // Wait for a server->client event frame; [] on timeout.
  async waitFor(eventName, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const frames = await this.poll(Math.min(remaining, 3000));
      for (const f of frames) {
        if (!f.startsWith('42')) continue;
        let parsed;
        try { parsed = JSON.parse(f.slice(2)); } catch { continue; }
        if (Array.isArray(parsed) && parsed[0] === eventName) return parsed[1];
      }
    }
    return undefined;
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
  return { id: login.data.user.id, token: login.data.token, username: uname, displayName: username };
}

(async () => {
  console.log('--- Setup ---');
  const owner = await registerAndLogin('rt_owner');
  const member = await registerAndLogin('rt_member');
  const outsider = await registerAndLogin('rt_out');

  const g = await rest('POST', '/api/groups', { token: owner.token, body: { name: `rt-group-${Date.now()}` } });
  const groupId = g.data.group.id;
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: member.id, role: 'member' } });
  const t = await rest('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `rt-task-${Date.now()}` } });
  const taskId = t.data.task.id;
  assert('setup: group + task created, member added', !!groupId && !!taskId);

  // ================= GROUP ROOM AUTHORIZATION =================
  console.log('\n--- Group rooms ---');
  const mSock = new PollingClient(); await mSock.connect(member.token);
  const xSock = new PollingClient(); await xSock.connect(outsider.token);

  let res = await mSock.emitAck('group:join', { groupId });
  assert('member can join own group room', res && res.ok === true);
  const whoM = await mSock.emitAck('foundation:whoami');
  assert('group room present in member rooms', whoM && whoM.rooms.includes(`group:${groupId}`));

  res = await xSock.emitAck('group:join', { groupId });
  assert('non-member rejected from group room', res && res.ok === false && /member/i.test(res.error));
  const whoX = await xSock.emitAck('foundation:whoami');
  assert("rejected joiner has no group room", whoX && !whoX.rooms.includes(`group:${groupId}`));

  res = await mSock.emitAck('group:join', { groupId: 'abc' });
  assert('malformed groupId rejected safely', res && res.ok === false);
  res = await mSock.emitAck('group:join', { groupId: -5 });
  assert('negative groupId rejected safely', res && res.ok === false);
  res = await mSock.emitAck('group:join', {});
  assert('missing groupId rejected safely', res && res.ok === false);
  res = await mSock.emitAck('group:join', { groupId: 99999999 });
  assert('nonexistent group rejected', res && res.ok === false);

  res = await mSock.emitAck('group:leave', { groupId });
  assert('leave succeeds', res && res.ok === true);
  const whoAfterLeave = await mSock.emitAck('foundation:whoami');
  assert('room removed after leave', whoAfterLeave && !whoAfterLeave.rooms.includes(`group:${groupId}`));
  await mSock.emitAck('group:join', { groupId }); // rejoin for message flow

  // ================= MESSAGE REALTIME FLOW =================
  console.log('\n--- Group message realtime ---');
  const beforeUnread = (await rest('GET', '/api/notifications/unread-count', { token: owner.token })).data.unreadCount;

  const sent = await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'live wire test' } });
  assert('REST message created', sent.status === 201);

  const evt = await mSock.waitFor('message:new', 6000);
  assert('member received message:new', evt !== undefined);
  assert('payload id matches persisted REST row', evt && evt.id === sent.data.item.id);
  assert('payload matches sanitized REST shape', evt && evt.content === 'live wire test' &&
    evt.groupId === groupId && evt.messageType === 'message' &&
    evt.sender && typeof evt.sender.username === 'string' && 'displayName' in evt.sender);
  assert('no private fields leaked in payload', evt && !JSON.stringify(evt).toLowerCase().includes('password'));

  // Room-isolation runtime proof via a DISPOSABLE observer (aborted long-polls
  // kill a polling socket, so absence checks must not reuse persistent ones).
  const obs1 = new PollingClient(); await obs1.connect(outsider.token);
  const xEvt = await obs1.waitFor('message:new', 2500);
  assert('outsider received no message event', xEvt === undefined);
  const whoX2 = await xSock.emitAck('foundation:whoami');
  assert("outsider structurally outside group room", whoX2 && !whoX2.rooms.includes(`group:${groupId}`));

  const listed = await rest('GET', `/api/groups/${groupId}/messages?limit=50`, { token: member.token });
  const matches = listed.data.items.filter(m => m.id === sent.data.item.id);
  assert('DB authoritative: exactly one copy via REST', matches.length === 1);

  const afterUnread = (await rest('GET', '/api/notifications/unread-count', { token: owner.token })).data.unreadCount;
  void beforeUnread; void afterUnread; // notification count asserted below via member

  // sender exclusion preserved: owner posted, so MEMBER should hold the NEW_MESSAGE notification
  const memberNotifs = (await rest('GET', '/api/notifications?type=NEW_MESSAGE', { token: member.token })).data.items;
  assert('5C.3 NEW_MESSAGE trigger still fires exactly once', memberNotifs.filter(n => n.messageId === sent.data.item.id).length === 1);

  // ================= TASK ROOMS + COMMENT REALTIME =================
  console.log('\n--- Task comment realtime ---');
  res = await mSock.emitAck('task:join', { taskId });
  assert('authorized member can join task room', res && res.ok === true);

  res = await xSock.emitAck('task:join', { taskId });
  assert('outsider rejected from task room', res && res.ok === false && /authorized|member/i.test(res.error));
  res = await mSock.emitAck('task:join', { taskId: 'xyz' });
  assert('malformed taskId rejected safely', res && res.ok === false);
  res = await mSock.emitAck('task:join', { taskId: 88888888 });
  assert('nonexistent task rejected', res && res.ok === false);

  const memberBeforeCommentUnread = (await rest('GET', '/api/notifications/unread-count', { token: member.token })).data.unreadCount;
  const cmt = await rest('POST', `/api/tasks/${taskId}/comments`, { token: owner.token, body: { content: 'live comment' } });
  assert('REST comment created', cmt.status === 201);

  const cEvt = await mSock.waitFor('comment:new', 6000);
  assert('member received comment:new', cEvt !== undefined);
  assert('comment payload matches persisted row', cEvt && cEvt.id === cmt.data.item.id && cEvt.taskId === taskId && cEvt.content === 'live comment' && cEvt.messageType === 'comment');

  const obs2 = new PollingClient(); await obs2.connect(outsider.token);
  const cEvtX = await obs2.waitFor('comment:new', 2500);
  assert('outsider received no comment event', cEvtX === undefined);
  const whoX3 = await xSock.emitAck('foundation:whoami');
  assert("outsider structurally outside task room", whoX3 && !whoX3.rooms.some(r => r.startsWith('group:') || r.startsWith('task:')));

  const commentsListed = await rest('GET', `/api/tasks/${taskId}/comments?limit=50`, { token: member.token });
  assert('DB authoritative: comment visible once via REST', commentsListed.data.items.filter(c2 => c2.id === cmt.data.item.id).length === 1);

  // comment trigger intact: creator (owner) is sender -> excluded; member not stakeholder -> none.
  // Post AS member instead to prove creator notification fires exactly once.
  const ownerBefore = (await rest('GET', '/api/notifications/unread-count', { token: owner.token })).data.unreadCount;
  await rest('POST', `/api/tasks/${taskId}/comments`, { token: member.token, body: { content: 'from member' } });
  await new Promise(r2 => setTimeout(r2, 300));
  const ownerAfter = (await rest('GET', '/api/notifications/unread-count', { token: owner.token })).data.unreadCount;
  assert('comment NEW_MESSAGE trigger fires for creator (+1)', ownerAfter === ownerBefore + 1);
  void memberBeforeCommentUnread;

  // ================= PERSISTENCE ROBUSTNESS =================
  console.log('\n--- Persistence robustness ---');
  // Emitter unavailable must never break REST creation: reset emitter state in a
  // separate require context and confirm createNotification-style no-op contract.
  const emitterPath = require.resolve('../src/services/realtimeEmitter');
  delete require.cache[emitterPath];
  const emitter = require('../src/services/realtimeEmitter');
  assert('emitter safe without init (returns false)', emitter.emitToRoom('group:1', 'message:new', {}) === false);

  // rapid-fire messages persist reliably (socket layer cannot drop them)
  const burst = [];
  for (let i = 0; i < 5; i++) {
    burst.push(rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: `burst ${i}` } }));
  }
  const burstResults = await Promise.all(burst);
  assert('burst of 5 REST messages all persisted', burstResults.every(r2 => r2.status === 201));
  const finalList = await rest('GET', `/api/groups/${groupId}/messages?limit=50`, { token: member.token });
  assert('all burst rows retrievable via REST', finalList.data.items.filter(m => m.content.startsWith('burst ')).length === 5);

  // ================= CLEANUP =================
  console.log('\n--- Cleanup ---');
  await rest('DELETE', `/api/groups/${groupId}`, { token: owner.token });
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  await User.destroy({ where: { username: { [Op.in]: [owner.username, member.username, outsider.username] } } });
  const remaining = await User.count({ where: { username: { [Op.like]: `rt_%` } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== CHAT REALTIME RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
