/*
 * Phase 7.3 - Per-Member Workload Drill-Down Tests
 *
 * Verifies GET /api/groups/:id/members?include=stats: backward compatibility,
 * per-member aggregation correctness, unassigned bucket, cross-group isolation,
 * authorization (blind 404), forged-identity immunity, and cleanup.
 *
 * Usage:
 *   1. Start backend:  cd backend && npm start   (port 3000)
 *   2. Run tests:      node tests/member-workload.test.js
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

// Mirrors computeTaskStats derivation rules (shared with group stats since 7.3)
function expectedStats(tasks, now = Date.now()) {
  const s = { total: tasks.length, todo: 0, inProgress: 0, completed: 0, overdue: 0, dueSoon: 0 };
  for (const t of tasks) {
    if (t.status === 'completed') s.completed++;
    else if (t.status === 'in_progress') s.inProgress++;
    else s.todo++;
    if (t.status !== 'completed' && t.dueDate) {
      const due = new Date(t.dueDate).getTime();
      if (due < now) s.overdue++;
      else if (due - now <= 24 * 60 * 60 * 1000) s.dueSoon++;
    }
  }
  s.completionRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
  return s;
}

(async () => {
  console.log('--- Setup ---');
  const alice = await registerAndLogin('wl_alice');
  const bob = await registerAndLogin('wl_bob');
  const carol = await registerAndLogin('wl_carol'); // member with ZERO tasks

  // auth checks
  let r = await rest('GET', '/api/groups/1/members');
  assert('unauthenticated members rejected', r.status === 401);
  r = await rest('GET', '/api/groups/1/members?include=stats');
  assert('unauthenticated members+stats rejected', r.status === 401);

  // fixture group: alice owner, bob member (has tasks), carol member (zero tasks)
  const g = await rest('POST', '/api/groups', { token: alice.token, body: { name: `wl-g-${Date.now()}` } });
  const groupId = g.data.group.id;
  await rest('POST', `/api/groups/${groupId}/members`, { token: alice.token, body: { userId: bob.id, role: 'member' } });
  await rest('POST', `/api/groups/${groupId}/members`, { token: alice.token, body: { userId: carol.id, role: 'member' } });

  const H = 60 * 60 * 1000;
  const PAST = new Date(Date.now() - 48 * H).toISOString();
  const SOON = new Date(Date.now() + 12 * H).toISOString();

  const mk = (title, assigneeId, extra = {}) => rest('POST', `/api/groups/${groupId}/tasks`, {
    token: alice.token,
    body: { title, assigneeId, ...extra }
  });
  const setStatus = (id, token, status) => rest('PUT', `/api/tasks/${id}/status`, { token, body: { status } });

  // alice: todo, in_progress, completed-past-due (NOT overdue)
  await mk('a todo', alice.id);
  const aInprog = await mk('a inprog', alice.id); await setStatus(aInprog.data.task.id, alice.token, 'in_progress');
  const aDone = await mk('a done past due', alice.id, { dueDate: PAST }); await setStatus(aDone.data.task.id, alice.token, 'completed');
  // bob: overdue todo, dueSoon todo
  await mk('b overdue', bob.id, { dueDate: PAST });
  await mk('b soon', bob.id, { dueDate: SOON });
  // unassigned: one overdue-ish open, one completed
  await mk('u open', null);
  const uDone = await mk('u done', null); await setStatus(uDone.data.task.id, alice.token, 'completed');

  // second group: alice is ALSO a member with tasks there - must not leak into group 1 drill-down
  const g2 = await rest('POST', '/api/groups', { token: alice.token, body: { name: `wl-g2-${Date.now()}` } });
  const g2Task = await rest('POST', `/api/groups/${g2.data.group.id}/tasks`, { token: alice.token, body: { title: 'g2 alice task', assigneeId: alice.id } });

  console.log('\n--- Backward compatibility (no include param) ---');
  r = await rest('GET', `/api/groups/${groupId}/members`, { token: alice.token });
  assert('members list without param works', r.status === 200 && Array.isArray(r.data.members));
  assert('no stats field without include=stats', r.data.members.every(m => !('stats' in m)));
  assert('no unassigned key without include=stats', !('unassigned' in r.data));
  assert('base member shape preserved (user+role)', r.data.members.every(m => m.user && typeof m.role === 'string'));

  console.log('\n--- Validation / authorization ---');
  r = await rest('GET', '/api/groups/notanumber/members?include=stats', { token: alice.token });
  assert('invalid group id -> 400', r.status === 400);
  r = await rest('GET', '/api/groups/999999/members?include=stats', { token: alice.token });
  assert('nonexistent group -> 404', r.status === 404);
  const outsider = await registerAndLogin('wl_outsider');
  r = await rest('GET', `/api/groups/${groupId}/members?include=stats`, { token: outsider.token });
  assert('non-member gets blind 404 (no member data leak)', r.status === 404 && (!r.data || !r.data.members));
  r = await rest('GET', `/api/groups/${groupId}/members?include=stats&userId=${bob.id}`, { token: alice.token });
  assert('client userId param ignored (full member list returned)', r.status === 200 && r.data.members.length === 3);

  console.log('\n--- Member stats correctness ---');
  r = await rest('GET', `/api/groups/${groupId}/members?include=stats`, { token: alice.token });
  assert('members+stats works', r.status === 200 && Array.isArray(r.data.members));
  assert('unassigned bucket present', !!r.data.unassigned && typeof r.data.unassigned === 'object');
  const byUser = new Map(r.data.members.map(m => [m.userId, m]));
  const aliceM = byUser.get(alice.id);
  const bobM = byUser.get(bob.id);
  const carolM = byUser.get(carol.id);
  assert('all members present incl. zero-task member', !!aliceM && !!bobM && !!carolM);

  const STATS_KEYS = ['total', 'todo', 'inProgress', 'completed', 'overdue', 'dueSoon', 'completionRate'];
  assert('every member has all 7 stats keys', r.data.members.every(m => m.stats && STATS_KEYS.every(k => k in m.stats)));

  const aliceExpected = expectedStats([
    { status: 'todo' },
    { status: 'in_progress' },
    { status: 'completed', dueDate: PAST }
  ]);
  assert('alice stats exact', JSON.stringify(aliceM.stats) === JSON.stringify(aliceExpected), `got ${JSON.stringify(aliceM.stats)} want ${JSON.stringify(aliceExpected)}`);
  assert('alice completed-past-due NOT overdue', aliceM.stats.overdue === 0 && aliceM.stats.completed === 1);

  const bobExpected = expectedStats([
    { status: 'todo', dueDate: PAST },
    { status: 'todo', dueDate: SOON }
  ]);
  assert('bob stats exact (overdue + dueSoon)', JSON.stringify(bobM.stats) === JSON.stringify(bobExpected), `got ${JSON.stringify(bobM.stats)}`);

  assert('zero-task member shows zeros', JSON.stringify(carolM.stats) === JSON.stringify({ total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0, dueSoon: 0, completionRate: 0 }), `got ${JSON.stringify(carolM.stats)}`);

  console.log('\n--- Unassigned bucket + cross-endpoint consistency ---');
  const unassignedExpected = expectedStats([
    { status: 'todo' },
    { status: 'completed' }
  ]);
  assert('unassigned bucket exact', JSON.stringify(r.data.unassigned) === JSON.stringify(unassignedExpected), `got ${JSON.stringify(r.data.unassigned)}`);

  // 7.2 group-level stats for the same group
  const groupsRes = await rest('GET', '/api/groups?include=stats', { token: alice.token });
  const gStats = groupsRes.data.groups.find(x => x.id === groupId).stats;
  const memberTotal = r.data.members.reduce((sum, m) => sum + (m.stats?.total || 0), 0);
  assert('member totals + unassigned total === group total', memberTotal + r.data.unassigned.total === gStats.total, `memberTotal=${memberTotal} unassigned=${r.data.unassigned.total} group=${gStats.total}`);
  assert('unassigned todo === group open-unassigned count', r.data.unassigned.todo === gStats.unassigned, `drilldown todo=${r.data.unassigned.todo} group unassigned=${gStats.unassigned}`);

  console.log('\n--- Cross-group isolation ---');
  assert('other-group task not counted in group 1', !gStats || aliceM.stats.total === 3, `alice total in g1 = ${aliceM.stats.total}`);
  const g2Stats = groupsRes.data.groups.find(x => x.id === g2.data.group.id).stats;
  assert('second group has its own task counted there', g2Stats.total === 1);
  const g2Members = await rest('GET', `/api/groups/${g2.data.group.id}/members?include=stats`, { token: alice.token });
  const g2Alice = g2Members.data.members.find(m => m.userId === alice.id);
  assert('alice has 1 task in g2 (isolation verified)', g2Alice && g2Alice.stats.total === 1, `got ${JSON.stringify(g2Alice?.stats)}`);

  console.log('\n--- Cleanup ---');
  await rest('DELETE', `/api/groups/${groupId}`, { token: alice.token });
  await rest('DELETE', `/api/groups/${g2.data.group.id}`, { token: alice.token });
  const { Op } = require('sequelize');
  const { User, Group } = require('../src/models');
  await Group.destroy({ where: { name: { [Op.like]: 'wl-g-%' } } });
  await User.destroy({ where: { username: { [Op.in]: [alice.username, bob.username, carol.username, outsider.username] } } });
  const remaining = await Group.count({ where: { name: { [Op.like]: 'wl-g-%' } } });
  assert('cleanup removed fixtures', remaining === 0);

  console.log(`\n===== MEMBER WORKLOAD RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
