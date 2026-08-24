/*
 * Phase 5D.4 - Realtime Notifications Integration Tests
 *
 * Verifies notification:new + notification:unread-count push over the real
 * HTTP surface (Engine.IO v4 polling transport, pure fetch):
 *   - all five notification types emit after persistence
 *   - events target only user:{recipientId} rooms
 *   - preference suppression removes both row AND event
 *   - sender exclusion / recipient isolation hold
 *   - authoritative unread-count frames match REST
 *
 * Client model mirrors socket.io-client: one continuously-open polling GET per
 * socket feeding a frame queue (no aborted long-polls, which servers treat as
 * transport close). Assertions drain the queue.
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start     (port 3000)
 *   2. Run tests:      node tests/notification-realtime.test.js
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

  async handshake() {
    const res = await fetch(this.url());
    const text = await res.text();
    if (!text.startsWith('0')) throw new Error('unexpected handshake frame');
    this.sid = JSON.parse(text.slice(1)).sid;
  }

  // Keeps exactly one long-poll open at all times (like a real client).
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

  // Waits for the first queued frame matching predicate.
  async nextFrame(predicate, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const idx = this.queue.findIndex(predicate);
      if (idx >= 0) return this.queue.splice(idx, 1)[0];
      if (Date.now() >= deadline || this.dead) return null;
      await sleep(50);
    }
  }

  parseEvent(frame, expectedSeq) {
    try {
      const p = JSON.parse(frame.slice(expectedSeq ? expectedSeq.length : 2));
      return Array.isArray(p) ? p : [p];
    } catch {
      return null;
    }
  }

  async connect(token) {
    await this.handshake();
    this.startReader();
    await this.send('40' + JSON.stringify({ token }));
    const f = await this.nextFrame(f => f.startsWith('40'), 5000);
    if (!f) throw new Error('connect failed');
  }

  async emitAck(event, payload) {
    const seq = String(++this.seq);
    await this.send(`42${seq}${JSON.stringify([event, payload])}`);
    const f = await this.nextFrame(f => f.startsWith(`43${seq}`), 5000);
    if (!f) return null;
    const p = this.parseEvent(f, `43${seq}`);
    return p ? p[0] : null;
  }

  // Collects ALL events of the given names arriving within durationMs.
  async collectEvents(eventNames, durationMs = 2500) {
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
  const owner = await registerAndLogin('nr_owner');   // actor/sender mostly
  const alice = await registerAndLogin('nr_alice');   // primary recipient
  const bob = await registerAndLogin('nr_bob');       // non-member isolation target

  const g = await rest('POST', '/api/groups', { token: owner.token, body: { name: `nrt-group-${Date.now()}` } });
  const groupId = g.data.group.id;
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: alice.id, role: 'member' } });
  const t = await rest('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `nrt-task-${Date.now()}` } });
  const taskId = t.data.task.id;
  assert('setup ready', !!groupId && !!taskId);

  const sockAlice = new PollingClient(); await sockAlice.connect(alice.token);
  const sockBob = new PollingClient(); await sockBob.connect(bob.token);
  const sockOwner = new PollingClient(); await sockOwner.connect(owner.token);

  // ================= TASK_ASSIGNED =================
  console.log('\n--- TASK_ASSIGNED ---');
  let assigned = await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: alice.id } });
  assert('assignment persisted', assigned.status === 200);

  const winA = await sockAlice.collectEvents(['notification:new', 'notification:unread-count'], 6000);
  assert('TASK_ASSIGNED notification:new received', winA['notification:new'].length === 1);
  const n0 = winA['notification:new'][0];
  assert('payload matches sanitized shape', n0 && n0.type === 'TASK_ASSIGNED' &&
    n0.recipientId === alice.id && n0.isRead === false &&
    n0.metadata && n0.metadata.taskId === taskId && typeof n0.title === 'string' &&
    !JSON.stringify(n0).toLowerCase().includes('password'));
  assert('authoritative unread-count frame received', winA['notification:unread-count'].length >= 1);
  const restUnread = (await rest('GET', '/api/notifications/unread-count', { token: alice.token })).data.unreadCount;
  assert('unread-count frame equals REST value', winA['notification:unread-count'].at(-1).unreadCount === restUnread);

  const ownerWin = await sockOwner.collectEvents(['notification:new'], 1500);
  assert('actor/sender excluded (owner got nothing)', ownerWin['notification:new'].filter(n => n.type === 'TASK_ASSIGNED').length === 0);

  // ================= NEW_MESSAGE =================
  console.log('\n--- NEW_MESSAGE ---');
  await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'push me' } });
  const msgWin = await sockAlice.collectEvents(['notification:new'], 4000);
  const nm = msgWin['notification:new'].find(n => n.type === 'NEW_MESSAGE');
  assert('NEW_MESSAGE delivered to group-member recipient', !!nm && nm.message.includes('push me'));
  const bobWin = await sockBob.collectEvents(['notification:new'], 2000);
  assert('non-member isolated from NEW_MESSAGE', bobWin['notification:new'].length === 0);

  // ================= MENTION (precedence) =================
  console.log('\n--- MENTION ---');
  await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: `hey @${alice.username}` } });
  const menWin = await sockAlice.collectEvents(['notification:new'], 4000);
  assert('MENTION delivered', menWin['notification:new'].some(n => n.type === 'MENTION'));
  assert('mention takes precedence - no NEW_MESSAGE for same message', !menWin['notification:new'].some(n => n.type === 'NEW_MESSAGE'));

  // ================= TASK_COMPLETED =================
  console.log('\n--- TASK_COMPLETED ---');
  await rest('PUT', `/api/tasks/${taskId}/status`, { token: alice.token, body: { status: 'completed' } });
  const compWin = await sockOwner.collectEvents(['notification:new'], 4000);
  assert('TASK_COMPLETED delivered to creator', compWin['notification:new'].some(n => n.type === 'TASK_COMPLETED'));
  await rest('PUT', `/api/tasks/${taskId}/status`, { token: alice.token, body: { status: 'in_progress' } });

  // ================= PREFERENCE SUPPRESSION =================
  console.log('\n--- Preference suppression ---');
  await rest('PUT', '/api/notifications/preferences', { token: alice.token, body: { taskAssigned: false } });
  const unreadBeforeSuppress = (await rest('GET', '/api/notifications/unread-count', { token: alice.token })).data.unreadCount;
  const rowsBefore = (await rest('GET', '/api/notifications?type=TASK_ASSIGNED', { token: alice.token })).data.pagination.total;
  await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: bob.id } }); // noise
  await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: alice.id } });
  const suppressed = await sockAlice.collectEvents(['notification:new'], 2500);
  assert('suppressed type produces NO realtime event', suppressed['notification:new'].length === 0);
  const rowsAfter = (await rest('GET', '/api/notifications?type=TASK_ASSIGNED', { token: alice.token })).data.pagination.total;
  assert('suppressed type produces NO DB row', rowsAfter === rowsBefore);
  const unreadAfterSuppress = (await rest('GET', '/api/notifications/unread-count', { token: alice.token })).data.unreadCount;
  assert('unread count unchanged under suppression', unreadAfterSuppress === unreadBeforeSuppress);

  await rest('PUT', '/api/notifications/preferences', { token: alice.token, body: { taskAssigned: true } });
  await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: bob.id } });
  await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: alice.id } });
  const restored = await sockAlice.collectEvents(['notification:new'], 3500);
  assert('re-enabled preference restores realtime delivery', restored['notification:new'].some(n => n.type === 'TASK_ASSIGNED'));

  // ================= DEADLINE JOB PATH =================
  console.log('\n--- DEADLINE_APPROACHING ---');
  // Service-level proof: notifyUsers is the exact function the cron job calls.
  delete require.cache[require.resolve('../src/services/realtimeEmitter')];
  delete require.cache[require.resolve('../src/utils/notificationService')];
  delete require.cache[require.resolve('../src/socket/rooms')];
  const emitter = require('../src/services/realtimeEmitter');
  const sentFrames = [];
  emitter.init({ to: (room) => ({ emit: (event, payload) => sentFrames.push({ room, event, payload }) }) });
  const { notifyUsers } = require('../src/utils/notificationService');
  await notifyUsers({
    recipientIds: [alice.id],
    type: 'DEADLINE_APPROACHING',
    title: 'Deadline approaching',
    message: 'Task X is due in 24 hours',
    taskId
  });
  assert('DEADLINE_APPROACHING emits via notifyUsers to user:{id} room',
    sentFrames.some(f => f.room === `user:${alice.id}` && f.event === 'notification:new' && f.payload.type === 'DEADLINE_APPROACHING'));
  assert('unread-count frame accompanies deadline emission',
    sentFrames.some(f => f.room === `user:${alice.id}` && f.event === 'notification:unread-count'));
  emitter.reset();

  // Cross-process persistence safety: scheduled job invoked WITHOUT io instance
  // must still persist notifications and never crash (emitter no-op path).
  await rest('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `nrt-due-${Date.now()}`, dueDate: new Date(Date.now() + 12 * 3600 * 1000).toISOString() } });
  let childOk = false;
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync(
      process.execPath,
      ['-e', 'require("./src/jobs/deadlineNotificationJob").runDeadlineCheck().then(c=>{console.log("COUNT:"+c);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 }
    );
    childOk = /COUNT:\d+/.test(out);
  } catch (e) {
    console.log('child note:', String(e.message).slice(0, 120));
  }
  assert('cross-process deadline run persisted without crash', childOk);

  // ================= CLEANUP =================
  console.log('\n--- Cleanup ---');
  sockAlice.stop(); sockBob.stop(); sockOwner.stop();
  await rest('DELETE', `/api/groups/${groupId}`, { token: owner.token });
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  await User.destroy({ where: { username: { [Op.in]: [owner.username, alice.username, bob.username] } } });
  const remaining = await User.count({ where: { username: { [Op.in]: [owner.username, alice.username, bob.username] } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== REALTIME NOTIFICATION RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
