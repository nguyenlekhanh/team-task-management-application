/*
 * Phase 6.5 - My Tasks (GET /api/tasks) Tests
 *
 * Verifies cross-group "My Tasks" semantics and security:
 *   - scope=assigned / scope=created are derived from the AUTHENTICATED user
 *   - client-supplied assigneeId/creatorId cannot override the server-derived scope
 *   - cross-group tasks included; other users' tasks excluded
 *   - status/priority/search filters + pagination + empty results
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start
 *   2. Run tests:      node tests/mytasks.test.js
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
  const alice = await registerAndLogin('mt_alice'); // primary user
  const bob = await registerAndLogin('mt_bob');     // isolation target

  // auth required
  let r = await rest('GET', '/api/tasks');
  assert('unauthenticated request rejected (401)', r.status === 401);
  r = await rest('GET', '/api/tasks?scope=assigned&userId=999');
  assert('client userId ignored for identity (still 401 unauthenticated)', r.status === 401);

  // alice group with a task assigned to alice + a task created by alice (unassigned)
  const g1 = await rest('POST', '/api/groups', { token: alice.token, body: { name: `mt-g1-${Date.now()}` } });
  const g1id = g1.data.group.id;
  const tAssigned = await rest('POST', `/api/groups/${g1id}/tasks`, { token: alice.token, body: { title: 'mt assigned uniquezebra', assigneeId: alice.id, dueDate: '2026-12-01' } });
  const tCreated = await rest('POST', `/api/groups/${g1id}/tasks`, { token: alice.token, body: { title: 'mt created unassigned' } });

  // bob's own group/task — must NEVER appear in alice's view
  const g2 = await rest('POST', '/api/groups', { token: bob.token, body: { name: `mt-g2-${Date.now()}` } });
  const tBob = await rest('POST', `/api/groups/${g2.data.group.id}/tasks`, { token: bob.token, body: { title: 'bob private task', assigneeId: bob.id } });

  console.log('\n--- Scope semantics ---');
  r = await rest('GET', '/api/tasks?scope=assigned', { token: alice.token });
  assert('scope=assigned returns only tasks assigned to authenticated user',
    r.status === 200 && r.data.tasks.every(x => x.assigneeId === alice.id));
  assert('cross-group assigned task included', r.data.tasks.some(x => x.id === tAssigned.data.task.id));
  assert("bob's task never leaks", !r.data.tasks.some(x => x.id === tBob.data.task.id));

  r = await rest('GET', '/api/tasks?scope=created', { token: alice.token });
  assert('scope=created returns only tasks created by authenticated user',
    r.status === 200 && r.data.tasks.length === 2 && r.data.tasks.every(x => x.creatorId === alice.id));

  // legacy behavior preserved without scope: all tasks in my groups
  r = await rest('GET', '/api/tasks', { token: alice.token });
  assert('no-scope keeps backward-compatible all-in-my-groups behavior',
    r.status === 200 && r.data.tasks.length === 2);

  // forged identity attempt: explicit assigneeId=bob must be OVERRIDDEN by scope
  r = await rest('GET', '/api/tasks?scope=assigned&assigneeId=' + bob.id, { token: alice.token });
  assert('client-supplied assigneeId cannot override server-derived scope',
    r.status === 200 && r.data.tasks.every(x => x.assigneeId === alice.id));

  console.log('\n--- Filters / search / pagination ---');
  r = await rest('GET', '/api/tasks?scope=assigned&status=todo&priority=medium', { token: alice.token });
  assert('status+priority filters combine with scope',
    r.status === 200 && r.data.tasks.every(x => x.status === 'todo' && x.priority === 'medium'));

  r = await rest('GET', '/api/tasks?scope=assigned&search=uniquezebra', { token: alice.token });
  assert('search works with scope', r.status === 200 && r.data.tasks.length === 1 &&
    r.data.tasks[0].title.includes('uniquezebra'));

  r = await rest('GET', '/api/tasks?scope=assigned&sortBy=dueDate&sortOrder=ASC&page=1&limit=1', { token: alice.token });
  assert('sorting + pagination bounded', r.status === 200 && r.data.tasks.length === 1 &&
    r.data.pagination.limit === 1 && typeof r.data.pagination.totalPages === 'number');

  r = await rest('GET', '/api/tasks?scope=assigned&status=completed', { token: alice.token });
  assert('empty result shape valid', r.status === 200 && r.data.tasks.length === 0 &&
    r.data.pagination.total === 0);

  console.log('\n--- Cleanup ---');
  await rest('DELETE', `/api/groups/${g1id}`, { token: alice.token });
  await rest('DELETE', `/api/groups/${g2.data.group.id}`, { token: bob.token });
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  const names = [alice.username, bob.username];
  await User.destroy({ where: { username: { [Op.in]: names } } });
  const remaining = await User.count({ where: { username: { [Op.in]: names } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== MY TASKS RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
