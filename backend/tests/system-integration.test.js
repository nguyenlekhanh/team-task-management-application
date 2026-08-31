/*
 * Phase 5E.1 - Full System Integration Tests
 *
 * Cross-feature verification over real HTTP + Socket.IO surfaces:
 *   - auth lifecycle (REST + socket, logout cookie semantics)
 *   - group deletion (cascade data integrity + eviction + future access)
 *   - task authorization matrix incl. removed-creator boundary
 *   - multi-tab delivery (chat + notification fan-out)
 *   - offline recipient resync
 *   - failed operations leave no realtime state
 *   - cross-group leakage probes + malicious room guesses
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start     (port 3000)
 *   2. Run tests:      node tests/system-integration.test.js
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
  url(extra = '') { return `${BASE}/socket.io/?EIO=4&transport=polling&t=${Date.now()}${Math.random()}${extra}`; }

  async handshake() {
    const res = await fetch(this.url());
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

async function rest(method, path, { token, body, rawHeaders } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await r.json(); } catch {}
  const headers = rawHeaders ? { setCookie: r.headers.getSetCookie ? r.headers.getSetCookie() : [] } : undefined;
  return { status: r.status, data, headers };
}

async function registerAndLogin(username) {
  const uname = `${username}_${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await rest('POST', '/api/auth/register', { body: { username: uname, password: 'testpass123', displayName: username } });
  const login = await rest('POST', '/api/auth/login', { body: { username: uname, password: 'testpass123' } });
  return { id: login.data.user.id, token: login.data.token, refreshToken: login.data.refreshToken, username: uname };
}

(async () => {
  console.log('--- Setup ---');
  const owner = await registerAndLogin('si_owner');
  const member = await registerAndLogin('si_member');
  const plain = await registerAndLogin('si_plain');   // ordinary member, no roles
  const outsider = await registerAndLogin('si_out');

  const g = await rest('POST', '/api/groups', { token: owner.token, body: { name: `si-g-${Date.now()}` } });
  const groupId = g.data.group.id;
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: member.id, role: 'member' } });
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: plain.id, role: 'member' } });
  const t = await rest('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `si-task-${Date.now()}` } });
  const taskId = t.data.task.id;
  assert('setup ready', !!groupId && !!taskId);

  // ================= A. AUTH INTEGRATION =================
  console.log('\n--- Auth lifecycle ---');
  const meBad = await rest('GET', '/api/users/me');
  assert('unauthenticated REST rejected (401)', meBad.status === 401);
  const badLogin = await rest('POST', '/api/auth/login', { body: { username: owner.username, password: 'wrong' } });
  assert('invalid login rejected', badLogin.status === 400 || badLogin.status === 401);

  const sockM = new PollingClient(); await sockM.connect(member.token);
  assert('authenticated socket connects with REST-issued JWT', true);

  const logoutRes = await fetch(BASE + '/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: owner.refreshToken }) });
  const cookies = logoutRes.headers.getSetCookie ? logoutRes.headers.getSetCookie() : [];
  assert('logout clears the auth cookie', cookies.some(c => c.startsWith('token=') && /expires=Thu, 01 Jan 1970/i.test(c)));
  // Session revocation (9.1): logout with the refresh token revokes the family,
  // so the still-unexpired access token is now rejected server-side. This flips
  // the pre-9.1 "stateless bearer stays valid" posture - the change this phase
  // was documented to make (5E.3 known-limitation #1).
  const stillWorks = await rest('GET', '/api/users/me', { token: owner.token });
  assert('access token revoked after logout-with-refresh (9.1 posture)', stillWorks.status === 401);
  const relogin = await rest('POST', '/api/auth/login', { body: { username: owner.username, password: 'testpass123' } });
  assert('fresh login after logout works', relogin.status === 200);
  // Re-login minted a NEW session; use its token for the rest of the suite.
  owner.token = relogin.data.token;
  owner.refreshToken = relogin.data.refreshToken;

  // ================= C. TASK AUTHORIZATION MATRIX =================
  console.log('\n--- Task authorization matrix ---');
  await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: member.id } });

  let r = await rest('PUT', `/api/tasks/${taskId}`, { token: owner.token, body: { description: 'owner edit' } });
  assert('owner/creator can update task', r.status === 200);
  r = await rest('PUT', `/api/tasks/${taskId}/status`, { token: member.token, body: { status: 'in_progress' } });
  assert('assignee can change status', r.status === 200);

  // ordinary member: no update/delete rights, but can comment + checklist
  r = await rest('PUT', `/api/tasks/${taskId}`, { token: plain.token, body: { title: 'hijack' } });
  assert('ordinary member cannot update others task (403)', r.status === 403);
  r = await rest('DELETE', `/api/tasks/${taskId}`, { token: plain.token });
  assert('ordinary member cannot delete task (403)', r.status === 403);
  r = await rest('POST', `/api/tasks/${taskId}/comments`, { token: plain.token, body: { content: 'member can comment' } });
  assert('ordinary member can comment', r.status === 201);
  r = await rest('POST', `/api/tasks/${taskId}/checklist`, { token: plain.token, body: { title: 'member item' } });
  assert('ordinary member can add checklist item', r.status === 201);

  // outsider: blind 404 everywhere (no info leak)
  r = await rest('GET', `/api/tasks/${taskId}`, { token: outsider.token });
  assert('outsider GET task -> 404', r.status === 404);
  r = await rest('PUT', `/api/tasks/${taskId}/status`, { token: outsider.token, body: { status: 'completed' } });
  assert('outsider PUT status -> 404', r.status === 404);
  r = await rest('POST', `/api/tasks/${taskId}/comments`, { token: outsider.token, body: { content: 'x' } });
  assert('outsider comment -> 404', r.status === 404);
  r = await rest('POST', `/api/tasks/${taskId}/checklist`, { token: outsider.token, body: { title: 'x' } });
  assert('outsider checklist -> 404', r.status === 404);

  // REMOVED-CREATOR boundary: member creates own task, then gets removed from group
  const t3 = await rest('POST', `/api/groups/${groupId}/tasks`, { token: member.token, body: { title: 'members own task' } });
  const taskId3 = t3.data.task.id;
  r = await rest('DELETE', `/api/groups/${groupId}/members/${member.id}`, { token: owner.token });
  assert('member removal succeeds', r.status === 200);
  r = await rest('GET', `/api/tasks/${taskId3}`, { token: member.token });
  assert('removed CREATOR loses task access (404, membership boundary)', r.status === 404);
  r = await rest('PUT', `/api/tasks/${taskId3}/status`, { token: member.token, body: { status: 'completed' } });
  assert('removed assignee/creator cannot change status', r.status === 404);
  r = await rest('POST', `/api/tasks/${taskId3}/comments`, { token: member.token, body: { content: 'ghost' } });
  assert('removed member cannot comment on formerly-owned task', r.status === 404);
  await rest('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: member.id, role: 'member' } });
  r = await rest('GET', `/api/tasks/${taskId3}`, { token: member.token });
  assert('re-added member regains access to own task', r.status === 200);

  // admin tier: promote plain, verify delete rules
  await rest('PUT', `/api/groups/${groupId}/members/${plain.id}`, { token: owner.token, body: { role: 'admin' } });
  r = await rest('DELETE', `/api/tasks/${taskId}`, { token: plain.token });
  assert('admin cannot delete OWNER-created task (403)', r.status === 403);
  r = await rest('DELETE', `/api/tasks/${taskId3}`, { token: plain.token });
  assert('admin can delete member-created task', r.status === 200);

  // ================= D. GROUP DELETION INTEGRATION =================
  console.log('\n--- Group deletion ---');
  const g2 = await rest('POST', '/api/groups', { token: owner.token, body: { name: `si-g2-${Date.now()}` } });
  const groupId2 = g2.data.group.id;
  await rest('POST', `/api/groups/${groupId2}/members`, { token: owner.token, body: { userId: member.id, role: 'member' } });
  const t2 = await rest('POST', `/api/groups/${groupId2}/tasks`, { token: owner.token, body: { title: 'g2 task' } });
  const taskId2 = t2.data.task.id;
  await rest('PUT', `/api/tasks/${taskId2}/assign`, { token: owner.token, body: { assigneeId: member.id } }); // TASK_ASSIGNED notif w/ groupId2

  const sockM2 = new PollingClient(); await sockM2.connect(member.token);
  await sockM2.emitAck('group:join', { groupId: groupId2 });
  await sockM2.emitAck('task:join', { taskId: taskId2 });

  r = await rest('DELETE', `/api/groups/${groupId2}`, { token: owner.token });
  assert('group deletion succeeds', r.status === 200);

  const whoDeleted = await sockM2.emitAck('foundation:whoami');
  assert("member sockets evicted from deleted group's room",
    whoDeleted && !whoDeleted.rooms.includes(`group:${groupId2}`));

  const delJoin = await sockM2.emitAck('group:join', { groupId: groupId2 });
  assert('future join to deleted group fails', delJoin && delJoin.ok === false);
  const delTaskJoin = await sockM2.emitAck('task:join', { taskId: taskId2 });
  assert('task room of cascaded task inaccessible', delTaskJoin && delTaskJoin.ok === false);
  r = await rest('GET', `/api/tasks/${taskId2}`, { token: member.token });
  assert('cascaded task gone (404)', r.status === 404);
  r = await rest('GET', `/api/groups/${groupId2}`, { token: member.token });
  assert('deleted group gone (404)', r.status === 404);
  r = await rest('GET', `/api/groups/${groupId2}/messages`, { token: member.token });
  assert('messages of deleted group unreachable', r.status === 404);

  // notifications referencing deleted group follow FK CASCADE
  const notifRows = await rest('GET', '/api/notifications?type=TASK_ASSIGNED&limit=100', { token: member.token });
  assert('notifications referencing deleted group cascade-deleted',
    !notifRows.data.items.some(n => n.groupId === groupId2));
  void sockM2;

  // ================= D2. MULTI-TAB DELIVERY =================
  console.log('\n--- Multi-tab delivery ---');
  const mTabA = new PollingClient(); await mTabA.connect(member.token);
  const mTabB = new PollingClient(); await mTabB.connect(member.token);
  await mTabA.emitAck('group:join', { groupId });
  await mTabB.emitAck('group:join', { groupId });
  await mTabB.emitAck('task:join', { taskId });

  await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'fanout' } });
  const gotA = await mTabA.waitFor('message:new', 4000);
  const gotB = await mTabB.waitFor('message:new', 4000);
  assert('each tab receives its own copy of chat event', !!gotA && !!gotB && gotA.id === gotB.id);

  const assignAgain = await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: member.id } });
  void assignAgain; // documented: reassign re-notifies
  const notifA = await mTabA.waitFor('notification:new', 4000);
  const notifB = await mTabB.waitFor('notification:new', 4000);
  assert('notification fans out to ALL tabs (user room copies)',
    !!notifA && !!notifB && notifA.id === notifB.id && notifA.recipientId === member.id);

  await mTabA.close();
  await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'after tab close' } });
  const gotB2 = await mTabB.waitFor('message:new', 4000);
  assert('remaining tab keeps receiving after sibling closes', !!gotB2 && gotB2.content === 'after tab close');

  // ================= E. OFFLINE RECIPIENT RESYNC =================
  console.log('\n--- Offline recipient resync ---');
  await mTabB.close();
  await sleep(150);
  const offlineMsg = await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'while away' } });
  assert('REST persists while recipient offline', offlineMsg.status === 201);
  const mBack = new PollingClient(); await mBack.connect(member.token);
  const listed = await rest('GET', `/api/groups/${groupId}/messages?limit=50`, { token: member.token });
  const dupes = listed.data.items.filter(x => x.id === offlineMsg.data.item.id);
  assert('resync via REST shows exactly one authoritative row', dupes.length === 1);
  const backNotifs = await mBack.collectEvents(['notification:new'], 1200); // quiet drain
  void backNotifs;

  // ================= F. FAILED OPS LEAVE NO REALTIME STATE =================
  console.log('\n--- Failed operations ---');
  const taBaseline = (await rest('GET', '/api/notifications?type=TASK_ASSIGNED', { token: member.token })).data.pagination.total;
  r = await rest('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: outsider.id } });
  assert('assign to non-member rejected (400)', r.status === 400);
  const taAfterFail = (await rest('GET', '/api/notifications?type=TASK_ASSIGNED', { token: member.token })).data.pagination.total;
  assert('failed assignment produced no notification rows', taAfterFail === taBaseline);

  await rest('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: '' } });
  const silentWin = await mBack.collectEvents(['message:new'], 1500);
  assert('invalid message emits no broadcast', silentWin['message:new'].length === 0);

  // ================= G. ROOM BOUNDARIES / LEAKAGE =================
  console.log('\n--- Room boundaries & leakage ---');
  const g3 = await rest('POST', '/api/groups', { token: owner.token, body: { name: `si-g3-${Date.now()}` } });
  await rest('POST', `/api/groups/${g3.data.group.id}/members`, { token: owner.token, body: { userId: plain.id, role: 'member' } });
  const tp = await rest('POST', `/api/groups/${g3.data.group.id}/tasks`, { token: owner.token, body: { title: 'g3 task' } });
  const pSock = new PollingClient(); await pSock.connect(plain.token);
  await pSock.emitAck('task:join', { taskId: tp.data.task.id });

  const leakJoin = await sockM.emitAck('task:join', { taskId: tp.data.task.id });
  assert('cross-group task room join rejected', leakJoin && leakJoin.ok === false);
  const ghostRoom = await sockM.emitAck('group:join', { groupId: 424242 });
  assert('guessed group room rejected', ghostRoom && ghostRoom.ok === false);
  await rest('POST', `/api/tasks/${tp.data.task.id}/comments`, { token: owner.token, body: { content: 'g3 only' } });
  const pGot = await pSock.waitFor('comment:new', 3000);
  const mLeak = await sockM.collectEvents(['comment:new'], 1200);
  assert('comment reaches authorized task room', !!pGot && pGot.content === 'g3 only');
  assert('no cross-group comment leakage', mLeak['comment:new'].length === 0);
  const whoM = await sockM.emitAck('foundation:whoami');
  assert("client cannot obtain another user's private room", whoM && whoM.rooms.every(r2 => !r2.startsWith('user:') || r2 === `user:${member.id}`));

  // ================= CLEANUP =================
  console.log('\n--- Cleanup ---');
  [sockM, mTabA, mTabB, mBack, pSock].forEach(s => s.stop());
  for (const gid of [groupId, g3.data.group.id]) {
    await rest('DELETE', `/api/groups/${gid}`, { token: owner.token });
  }
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  const names = [owner.username, member.username, plain.username, outsider.username];
  await User.destroy({ where: { username: { [Op.in]: names } } });
  const remaining = await User.count({ where: { username: { [Op.in]: names } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== SYSTEM INTEGRATION RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
