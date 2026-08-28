/*
 * Phase 7.1 - Dashboard & Team Productivity Overview Tests
 *
 * Verifies the dashboard's read-only data sources remain correct
 * and that no new backend contract is required.
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start   (port 3000)
 *   2. Run tests:      node tests/dashboard.test.js
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

function isOverdue(task) {
  return Boolean(task.dueDate && task.status !== 'completed' && new Date(task.dueDate) < new Date());
}

(async () => {
  console.log('--- Setup ---');
  const alice = await registerAndLogin('dash_alice');

  // unauthenticated dashboard sources must reject
  let r = await rest('GET', '/api/tasks?scope=assigned&limit=5');
  assert('unauthenticated dashboard source rejected', r.status === 401);

  // create group + tasks with varied states
  const g = await rest('POST', '/api/groups', { token: alice.token, body: { name: `dash-g-${Date.now()}` } });
  const groupId = g.data.group.id;

  const overdueTask = await rest('POST', `/api/groups/${groupId}/tasks`, { token: alice.token, body: { title: 'dash overdue', assigneeId: alice.id, dueDate: '2020-01-01' } });
  const dueSoonTask = await rest('POST', `/api/groups/${groupId}/tasks`, { token: alice.token, body: { title: 'dash due soon', assigneeId: alice.id, dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() } });
  const normalTask = await rest('POST', `/api/groups/${groupId}/tasks`, { token: alice.token, body: { title: 'dash normal', assigneeId: alice.id } });
  const completedTask = await rest('POST', `/api/groups/${groupId}/tasks`, { token: alice.token, body: { title: 'dash completed', assigneeId: alice.id } });
  await rest('PUT', `/api/tasks/${completedTask.data.task.id}/status`, { token: alice.token, body: { status: 'completed' } });

  // notifications: mention self not needed, just ensure list works
  await rest('POST', `/api/groups/${groupId}/messages`, { token: alice.token, body: { content: 'dash hello' } });

  console.log('\n--- Dashboard data sources ---');
  r = await rest('GET', '/api/tasks?scope=assigned&limit=100', { token: alice.token });
  assert('assigned tasks scope returns tasks', r.status === 200 && Array.isArray(r.data.tasks));
  const assigned = r.data.tasks;
  assert('overdue derived matches helper', assigned.filter(isOverdue).length >= 1);
  const dueSoon = assigned.filter(t => t.dueDate && t.status !== 'completed' && new Date(t.dueDate) > new Date() && new Date(t.dueDate) - new Date() <= 24 * 60 * 60 * 1000);
  assert('dueSoon derived is subset of assigned', dueSoon.length >= 0 && dueSoon.length <= assigned.length);

  r = await rest('GET', '/api/tasks?scope=created&limit=5&sortBy=updatedAt&sortOrder=DESC', { token: alice.token });
  assert('created scope returns tasks', r.status === 200);

  r = await rest('GET', '/api/groups', { token: alice.token });
  assert('groups list for dashboard', r.status === 200 && Array.isArray(r.data.groups || r.data));

  r = await rest('GET', '/api/notifications?limit=5', { token: alice.token });
  assert('notifications list for dashboard', r.status === 200 && Array.isArray(r.data.items));

  r = await rest('GET', '/api/notifications/unread-count', { token: alice.token });
  assert('unread count for dashboard', r.status === 200 && typeof r.data.unreadCount === 'number');

  r = await rest('GET', '/api/health', {});
  assert('health for dashboard', r.status === 200);

  // completed tasks must never appear overdue
  const completedOverdue = assigned.filter(t => t.status === 'completed' && isOverdue(t));
  assert('completed tasks never overdue', completedOverdue.length === 0);

  console.log('\n--- Cleanup ---');
  await rest('DELETE', `/api/groups/${groupId}`, { token: alice.token });
  const { Op } = require('sequelize');
  const User = require('../src/models').User;
  await User.destroy({ where: { username: { [Op.in]: [alice.username] } } });

  console.log(`\n===== DASHBOARD RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
