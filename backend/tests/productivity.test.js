/*
 * Phase 7.2 - Team Productivity Detail Tests
 *
 * Verifies the per-group productivity stats on GET /api/groups?include=stats:
 * backward compatibility, derivation rules, isolation, and cleanup.
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start   (port 3000)
 *   2. Run tests:      node tests/productivity.test.js
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

// Shared derivation rule (must mirror computeGroupStats in groupController)
function expectedStats(tasks, now = Date.now()) {
  const s = { total: tasks.length, todo: 0, inProgress: 0, completed: 0, overdue: 0, dueSoon: 0, unassigned: 0 };
  for (const t of tasks) {
    if (t.status === 'completed') s.completed++;
    else if (t.status === 'in_progress') s.inProgress++;
    else s.todo++;
    if (t.status !== 'completed') {
      if (t.dueDate) {
        const due = new Date(t.dueDate).getTime();
        if (due < now) s.overdue++;
        else if (due - now <= 24 * 60 * 60 * 1000) s.dueSoon++;
      }
      if (!t.assigneeId) s.unassigned++;
    }
  }
  s.completionRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
  return s;
}

(async () => {
  console.log('--- Setup ---');
  const alice = await registerAndLogin('prod_alice');
  const bob = await registerAndLogin('prod_bob');

  // unauthenticated requests must be rejected (both param variants)
  let r = await rest('GET', '/api/groups');
  assert('unauthenticated groups rejected', r.status === 401);
  r = await rest('GET', '/api/groups?include=stats');
  assert('unauthenticated groups+stats rejected', r.status === 401);

  // fixture group with known task states
  const g = await rest('POST', '/api/groups', { token: alice.token, body: { name: `prod-g-${Date.now()}` } });
  const groupId = g.data.group.id;

  const mk = (title, extra = {}) => rest('POST', `/api/groups/${groupId}/tasks`, {
    token: alice.token,
    body: { title, assigneeId: alice.id, ...extra }
  });

  const H = 60 * 60 * 1000;
  const PAST = new Date(Date.now() - 48 * H).toISOString();
  const SOON = new Date(Date.now() + 12 * H).toISOString();
  const FAR = new Date(Date.now() + 72 * H).toISOString();

  // 6 tasks: todo, in_progress, completed(normal), completed(past-due -> NOT overdue),
  // todo+past-due (overdue), todo+soon (dueSoon), plus unassigned open
  await mk('p todo');
  const inprog = await mk('p in progress'); await rest('PUT', `/api/tasks/${inprog.data.task.id}/status`, { token: alice.token, body: { status: 'in_progress' } });
  const done1 = await mk('p completed'); await rest('PUT', `/api/tasks/${done1.data.task.id}/status`, { token: alice.token, body: { status: 'completed' } });
  const done2 = await mk('p completed past due', { dueDate: PAST }); await rest('PUT', `/api/tasks/${done2.data.task.id}/status`, { token: alice.token, body: { status: 'completed' } });
  await mk('p overdue', { dueDate: PAST });
  await mk('p due soon', { dueDate: SOON });
  await mk('p unassigned open', { assigneeId: null });

  // bob's private group - must NEVER appear in alice's list
  const bobG = await rest('POST', '/api/groups', { token: bob.token, body: { name: `prod-bob-g-${Date.now()}` } });
  await rest('POST', `/api/groups/${bobG.data.group.id}/tasks`, { token: bob.token, body: { title: 'bob private' } });

  console.log('\n--- Backward compatibility (no include param) ---');
  r = await rest('GET', '/api/groups', { token: alice.token });
  assert('groups list without param works', r.status === 200 && Array.isArray(r.data.groups));
  assert('no stats field without include=stats', r.data.groups.every(x => !('stats' in x)));
  assert('base shape preserved (id/name/role)', r.data.groups.every(x => x.id && x.name && typeof x.role === 'string'));

  console.log('\n--- Stats correctness ---');
  r = await rest('GET', '/api/groups?include=stats', { token: alice.token });
  assert('groups list with include=stats works', r.status === 200 && Array.isArray(r.data.groups));
  const row = r.data.groups.find(x => x.id === groupId);
  assert('fixture group present with stats', !!row && !!row.stats);
  const expected = expectedStats([
    { status: 'todo', assigneeId: 1 },
    { status: 'in_progress', assigneeId: 1 },
    { status: 'completed', assigneeId: 1 },
    { status: 'completed', dueDate: PAST, assigneeId: 1 },
    { status: 'todo', dueDate: PAST, assigneeId: 1 },
    { status: 'todo', dueDate: SOON, assigneeId: 1 },
    { status: 'todo', assigneeId: null }
  ]);
  const s = row.stats;
  assert('stats has all 8 keys', ['total','todo','inProgress','completed','overdue','dueSoon','unassigned','completionRate'].every(k => k in s));
  assert('total counts all tasks', s.total === 7, `got ${s.total}`);
  assert('todo count (todo+overdue+dueSoon+unassigned)', s.todo === 4, `got ${s.todo}`);
  assert('inProgress count', s.inProgress === 1, `got ${s.inProgress}`);
  assert('completed count', s.completed === 2, `got ${s.completed}`);
  assert('overdue derived only from open past-due tasks', s.overdue === 1, `got ${s.overdue}`);
  assert('dueSoon counts 12h-out open task', s.dueSoon === 1, `got ${s.dueSoon}`);
  assert('unassigned counts only OPEN unassigned', s.unassigned === 1, `got ${s.unassigned}`);
  assert('completionRate = round(completed/total*100)', s.completionRate === Math.round((2 / 7) * 100), `got ${s.completionRate}`);
  assert('full stats object matches expected derivation', JSON.stringify(s) === JSON.stringify(expected), `got ${JSON.stringify(s)} want ${JSON.stringify(expected)}`);

  console.log('\n--- Isolation ---');
  assert("bob's group absent from alice's stats list", !r.data.groups.some(x => x.id === bobG.data.group.id));

  console.log('\n--- Empty group / rate math ---');
  const emptyG = await rest('POST', '/api/groups', { token: alice.token, body: { name: `prod-empty-${Date.now()}` } });
  r = await rest('GET', '/api/groups?include=stats', { token: alice.token });
  const emptyRow = r.data.groups.find(x => x.id === emptyG.data.group.id);
  assert('empty group stats present', !!emptyRow && !!emptyRow.stats);
  assert('empty group: total 0, rate 0', emptyRow.stats.total === 0 && emptyRow.stats.completionRate === 0);

  console.log('\n--- Cleanup ---');
  await rest('DELETE', `/api/groups/${groupId}`, { token: alice.token });
  await rest('DELETE', `/api/groups/${emptyG.data.group.id}`, { token: alice.token });
  await rest('DELETE', `/api/groups/${bobG.data.group.id}`, { token: bob.token });
  const { Op } = require('sequelize');
  const { User, Group } = require('../src/models');
  await Group.destroy({ where: { name: { [Op.like]: `prod-g-%` } } });
  await Group.destroy({ where: { name: { [Op.like]: `prod-bob-g-%` } } });
  await Group.destroy({ where: { name: { [Op.like]: `prod-empty-%` } } });
  await User.destroy({ where: { username: { [Op.in]: [alice.username, bob.username] } } });
  const remaining = await Group.count({ where: { name: { [Op.like]: 'prod-%' } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== PRODUCTIVITY RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
