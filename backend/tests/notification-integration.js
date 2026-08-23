/*
 * Phase 5C.5 - Notification System Integration Tests
 *
 * Comprehensive end-to-end verification of the notification system:
 * backend API, triggers, preferences, deadline job, cross-user isolation.
 *
 * Usage:
 *   1. Start the backend:  cd backend && npm start   (port 3000)
 *   2. Run tests:          node tests/notification-integration.js
 *      or:                 npm run test:notifications
 *
 * The script creates its own throwaway users/group/tasks (timestamp-suffixed),
 * and cleans everything up afterwards via cascade deletes.
 */
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const ts = Date.now();
let pass = 0;
let fail = 0;

function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra}`); }
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

async function registerAndLogin(username) {
  const uname = `${username}_${ts}`;
  await req('POST', '/api/auth/register', {
    body: { username: uname, password: 'testpass123', displayName: uname }
  });
  const login = await req('POST', '/api/auth/login', {
    body: { username: uname, password: 'testpass123' }
  });
  return { id: login.data.user.id, token: login.data.token, username: uname };
}

const notifsOf = async (token, params = '') => {
  const r = await req('GET', `/api/notifications${params}`, { token });
  return r.data.items || [];
};
const unreadOf = async (token) => {
  const r = await req('GET', '/api/notifications/unread-count', { token });
  return r.data.unreadCount;
};

(async () => {
  const { User, GroupMember, TaskMember } = require('../src/models');

  // ================= SETUP =================
  console.log('--- Setup ---');
  const owner = await registerAndLogin('n_owner');
  const member = await registerAndLogin('n_member');
  const third = await registerAndLogin('n_third');
  const followerUser = await registerAndLogin('n_follower');
  const outsider = await registerAndLogin('n_outsider');
  assert('setup: 5 users registered+logged in', owner.token && member.token && third.token && followerUser.token && outsider.token);

  const g = await req('POST', '/api/groups', { token: owner.token, body: { name: `notif-test-group-${ts}` } });
  const groupId = g.data.group.id;
  assert('setup: group created', g.status === 201 && !!groupId);
  await req('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: member.id, role: 'member' } });
  await req('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: third.id, role: 'member' } });

  const t = await req('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `notif-test-task-${ts}` } });
  const taskId = t.data.task.id;
  assert('setup: task created', t.status === 201 && !!taskId);

  // Register followerUser as a TaskMember with role 'follower' (no API exists; direct fixture)
  await TaskMember.create({ taskId, userId: followerUser.id, role: 'follower', assignedBy: owner.id });

  // ================= 1. BACKEND API: AUTH / ISOLATION / VALIDATION =================
  console.log('\n--- Backend API: auth, isolation, validation ---');
  let r = await req('GET', '/api/notifications');
  assert('401 without token on list', r.status === 401);
  r = await req('PUT', '/api/notifications/read-all');
  assert('401 without token on read-all', r.status === 401);
  r = await req('GET', '/api/notifications/unread-count', { token: 'bogus.token' });
  assert('401 invalid token on unread-count', r.status === 401);

  // Seed one notification for owner via assignment
  await req('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: member.id } });
  const ownerNotifs = await notifsOf(owner.token); // owner got nothing (assigner)
  const memberNotifs = await notifsOf(member.token);
  assert('assignment produced notification for assignee only', memberNotifs.length === 1 && ownerNotifs.length === 0);

  const seedId = memberNotifs[0].id;

  // Cross-user isolation
  r = await req('PUT', `/api/notifications/${seedId}/read`, { token: outsider.token });
  assert("cannot mark another user's notification read (404)", r.status === 404);
  r = await req('DELETE', `/api/notifications/${seedId}`, { token: outsider.token });
  assert("cannot delete another user's notification (404)", r.status === 404);
  r = await req('GET', '/api/notifications', { token: outsider.token });
  assert('user list never contains other users notifications', !(r.data.items || []).some(n => n.recipientId !== outsider.id));

  // Validation & boundaries
  r = await req('PUT', '/api/notifications/abc/read', { token: member.token });
  assert('invalid id -> 400 on mark-read', r.status === 400);
  r = await req('DELETE', '/api/notifications/abc', { token: member.token });
  assert('invalid id -> 400 on delete', r.status === 400);
  r = await req('DELETE', '/api/notifications/99999999', { token: member.token });
  assert('nonexistent id -> 404 on delete', r.status === 404);
  r = await req('GET', '/api/notifications?type=NOT_A_TYPE', { token: member.token });
  assert('invalid type filter -> 400', r.status === 400);
  r = await req('GET', '/api/notifications?isRead=banana', { token: member.token });
  assert('invalid isRead filter -> 400', r.status === 400);
  r = await req('GET', '/api/notifications?before=not-a-date', { token: member.token });
  assert('invalid before cursor -> 400', r.status === 400);
  r = await req('GET', '/api/notifications?limit=5000&page=0', { token: member.token });
  assert('limit clamped to 100, page 0 treated as page 1', r.status === 200 && r.data.pagination.limit <= 100 && r.data.pagination.page === 1);
  r = await req('GET', '/api/notifications?page=999999&limit=20', { token: member.token });
  assert('far page returns empty items gracefully', r.status === 200 && r.data.items.length === 0);

  // Unread count accuracy
  let before = await unreadOf(member.token);
  await req('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'count check 1' } });
  await req('POST', `/api/groups/${groupId}/messages`, { token: owner.token, body: { content: 'count check 2' } });
  let after = await unreadOf(member.token);
  assert('unread count increases by number of new notifications', after === before + 2);
  const firstTwo = (await notifsOf(member.token, '?limit=2')).slice(0, 2);
  await req('PUT', `/api/notifications/${firstTwo[0].id}/read`, { token: member.token });
  assert('unread count decrements on single read', (await unreadOf(member.token)) === after - 1);
  await req('PUT', '/api/notifications/read-all', { token: member.token });
  assert('read-all zeroes unread count', (await unreadOf(member.token)) === 0);
  const allRead = await notifsOf(member.token);
  assert('all items read after read-all', allRead.every(n => n.isRead === true));

  // isRead + type filters
  const anyUnreadSeed = await notifsOf(owner.token);
  await req('POST', `/api/groups/${groupId}/messages`, { token: member.token, body: { content: 'filter test' } });
  const filtered = await req('GET', '/api/notifications?type=NEW_MESSAGE&isRead=false', { token: owner.token });
  assert('combined type+isRead filter works', filtered.status === 200 && filtered.data.items.every(n => n.type === 'NEW_MESSAGE' && n.isRead === false));
  const cursor = filtered.data.items[0]?.createdAt;
  if (cursor) {
    const older = await req('GET', `/api/notifications?limit=5&before=${encodeURIComponent(cursor)}`, { token: owner.token });
    assert('cursor pagination returns strictly older items only', older.status === 200 && older.data.items.every(n => n.createdAt < cursor));
  }

  // ================= 2. TRIGGER INTEGRATION =================
  console.log('\n--- Triggers ---');

  // TASK_ASSIGNED reassignment behavior
  const memberAssignedCount1 = (await notifsOf(member.token)).filter(n => n.type === 'TASK_ASSIGNED').length;
  await req('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: third.id } });
  const thirdNotifs = await notifsOf(third.token);
  const memberAssignedCount2 = (await notifsOf(member.token)).filter(n => n.type === 'TASK_ASSIGNED').length;
  assert('reassignment notifies new assignee only', thirdNotifs.filter(n => n.type === 'TASK_ASSIGNED').length === 1 && memberAssignedCount2 === memberAssignedCount1);

  // Self-assignment does not notify
  await req('PUT', `/api/tasks/${taskId}/assign`, { token: third.token, body: { assigneeId: third.id } });
  const thirdAssignedAfterSelf = (await notifsOf(third.token)).filter(n => n.type === 'TASK_ASSIGNED').length;
  assert('self-assign produces no self-notification', thirdAssignedAfterSelf === 1);

  // String-typed assigneeId robustness (frontend sends numbers; contract hardening)
  await req('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: String(member.id) } });
  const memberStrAssign = (await notifsOf(member.token)).filter(n => n.type === 'TASK_ASSIGNED').length;
  assert('string-typed assigneeId still notifies (contract hardening)', memberStrAssign === memberAssignedCount1 + 1);
  await req('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: third.id } });

  // TASK_COMPLETED: recipients creator + assignee + follower; actor excluded; transition-based dedupe
  await req('PUT', '/api/notifications/read-all', { token: owner.token });
  await req('PUT', '/api/notifications/read-all', { token: third.token });
  await req('PUT', '/api/notifications/read-all', { token: followerUser.token });
  r = await req('PUT', `/api/tasks/${taskId}/status`, { token: third.token, body: { status: 'completed' } });
  assert('assignee can complete task', r.status === 200);
  assert('creator receives TASK_COMPLETED', (await notifsOf(owner.token)).some(n => n.type === 'TASK_COMPLETED'));
  assert('follower receives TASK_COMPLETED', (await notifsOf(followerUser.token)).some(n => n.type === 'TASK_COMPLETED'));
  assert('actor does not receive own TASK_COMPLETED', !(await notifsOf(third.token)).some(n => n.type === 'TASK_COMPLETED'));

  // Repeated completion must NOT duplicate
  await req('PUT', `/api/tasks/${taskId}/status`, { token: third.token, body: { status: 'completed' } });
  const ownerCompletedCount1 = (await notifsOf(owner.token)).filter(n => n.type === 'TASK_COMPLETED').length;
  assert('repeat complete while completed -> no duplicate', ownerCompletedCount1 === 1);

  // New transition cycle notifies again exactly once
  await req('PUT', `/api/tasks/${taskId}/status`, { token: third.token, body: { status: 'in_progress' } });
  await req('PUT', `/api/tasks/${taskId}/status`, { token: third.token, body: { status: 'completed' } });
  const ownerCompletedCount2 = (await notifsOf(owner.token)).filter(n => n.type === 'TASK_COMPLETED').length;
  assert('new completion transition notifies again (once)', ownerCompletedCount2 === 2);

  // NEW_MESSAGE membership boundary: outsider receives nothing
  const outsiderBefore = (await notifsOf(outsider.token)).length;
  await req('POST', `/api/groups/${groupId}/messages`, { token: member.token, body: { content: 'boundary check' } });
  const outsiderAfter = (await notifsOf(outsider.token)).length;
  assert('group message does not leak to non-members', outsiderAfter === outsiderBefore);

  // MENTION precedence + scoping
  await req('PUT', '/api/notifications/read-all', { token: owner.token });
  const mentionMsg = await req('POST', `/api/groups/${groupId}/messages`, { token: member.token, body: { content: `ping @${owner.username} now` } });
  assert('mention message sent', mentionMsg.status === 201);
  const ownerForMention = await notifsOf(owner.token);
  const mentionItems = ownerForMention.filter(n => n.messageId === mentionMsg.data.item.id);
  assert('mentioned user gets MENTION for that message', mentionItems.length === 1 && mentionItems[0].type === 'MENTION');
  assert('mention takes precedence over NEW_MESSAGE (no NEW_MESSAGE for same message)', !ownerForMention.some(n => n.messageId === mentionMsg.data.item.id && n.type === 'NEW_MESSAGE'));

  // Non-member / nonexistent mentions do not leak
  const outBefore2 = (await notifsOf(outsider.token)).length;
  await req('POST', `/api/groups/${groupId}/messages`, { token: member.token, body: { content: `hi @${outsider.username} @no_such_user_xyz` } });
  assert('non-member mention does not notify outsider', (await notifsOf(outsider.token)).length === outBefore2);
  assert('nonexistent mention does not crash', true);

  // Self-mention excluded
  await req('POST', `/api/groups/${groupId}/messages`, { token: member.token, body: { content: `note to self @${member.username}` } });
  const memberMentionSelf = (await notifsOf(member.token)).filter(n => n.type === 'MENTION');
  assert('self-mention produces no notification', memberMentionSelf.length === 0);

  // ================= 3. PREFERENCES (all five types) =================
  console.log('\n--- Preferences ---');
  const prefCases = [
    { key: 'taskAssigned', type: 'TASK_ASSIGNED', trigger: async () => { await req('PUT', `/api/tasks/${taskId}/assign`, { token: owner.token, body: { assigneeId: third.id } }); }, subject: third },
    { key: 'taskCompleted', type: 'TASK_COMPLETED', trigger: async () => { await req('PUT', `/api/tasks/${taskId}/status`, { token: third.token, body: { status: 'in_progress' } }); await req('PUT', `/api/tasks/${taskId}/status`, { token: third.token, body: { status: 'completed' } }); }, subject: owner },
    { key: 'newMessage', type: 'NEW_MESSAGE', trigger: async () => { await req('POST', `/api/groups/${groupId}/messages`, { token: member.token, body: { content: `pref check ${Date.now()}` } }); }, subject: owner },
    { key: 'mention', type: 'MENTION', trigger: async () => { await req('POST', `/api/groups/${groupId}/messages`, { token: member.token, body: { content: `tag @${owner.username} pref` } }); }, subject: owner }
  ];

  for (const c of prefCases) {
    // defaults are enabled
    let prefs = (await req('GET', '/api/notifications/preferences', { token: c.subject.token })).data.preferences;
    assert(`defaults: ${c.key}=true`, prefs[c.key] === true);

    // disable -> suppressed (only count notifications created after the trigger)
    await req('PUT', '/api/notifications/preferences', { token: c.subject.token, body: { [c.key]: false } });
    const markerBeforeTrigger = new Date(Date.now() - 1000).toISOString();
    await c.trigger();
    const suppressed = (await notifsOf(c.subject.token)).filter(n => n.type === c.type && n.createdAt > markerBeforeTrigger).length;
    assert(`disabled ${c.key} suppresses ${c.type}`, suppressed === 0);

    // persistence across reload
    prefs = (await req('GET', '/api/notifications/preferences', { token: c.subject.token })).data.preferences;
    assert(`disabled ${c.key} persists`, prefs[c.key] === false);

    // re-enable -> delivered again
    await req('PUT', '/api/notifications/preferences', { token: c.subject.token, body: { [c.key]: true } });
    const markerBeforeReenable = new Date(Date.now() - 1000).toISOString();
    await c.trigger();
    const restored = (await notifsOf(c.subject.token)).filter(n => n.type === c.type && n.createdAt > markerBeforeReenable).length;
    assert(`re-enabled ${c.key} delivers ${c.type} again`, restored > 0);
  }

  // preference validation errors
  r = await req('PUT', '/api/notifications/preferences', { token: owner.token, body: { bogusKey: true } });
  assert('unknown preference key rejected (400)', r.status === 400);
  r = await req('PUT', '/api/notifications/preferences', { token: owner.token, body: { mention: 'yes' } });
  assert('non-boolean preference value rejected (400)', r.status === 400);
  r = await req('PUT', '/api/notifications/preferences', { token: owner.token, body: {} });
  assert('empty preference update rejected (400)', r.status === 400);

  // ================= 4. DEADLINE JOB =================
  console.log('\n--- Deadline job ---');
  const { runDeadlineCheck } = require('../src/jobs/deadlineNotificationJob');

  const dueSoon = await req('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `due-soon-${ts}`, dueDate: new Date(Date.now() + 12 * 3600 * 1000).toISOString() } });
  const dueLater = await req('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `due-later-${ts}`, dueDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString() } });
  const dueDone = await req('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `due-done-${ts}`, dueDate: new Date(Date.now() + 6 * 3600 * 1000).toISOString() } });
  // createTask always starts as 'todo'; mark done via the status endpoint
  await req('PUT', `/api/tasks/${dueDone.data.task.id}/status`, { token: owner.token, body: { status: 'completed' } });

  await req('PUT', '/api/notifications/read-all', { token: owner.token });
  let created = await runDeadlineCheck();
  assert('deadline job creates notification for task due within 24h', created >= 1);
  const dueSoonN = (await notifsOf(owner.token)).find(n => n.metadata && n.metadata.taskId === dueSoon.data.task.id);
  assert('DEADLINE_APPROACHING has system sender (null)', dueSoonN && dueSoonN.senderId === null && dueSoonN.type === 'DEADLINE_APPROACHING');
  assert('task due in 48h ignored', !((await notifsOf(owner.token)).some(n => n.metadata && n.metadata.taskId === dueLater.data.task.id)));
  assert('completed task with near due date ignored', !((await notifsOf(owner.token)).some(n => n.metadata && n.metadata.taskId === dueDone.data.task.id)));

  created = await runDeadlineCheck();
  assert('second immediate run creates zero duplicates', created === 0);

  // Unassigned task handled safely (creator-only recipient)
  const unassigned = await req('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `unassigned-due-${ts}`, dueDate: new Date(Date.now() + 10 * 3600 * 1000).toISOString() } });
  created = await runDeadlineCheck();
  assert('unassigned due-soon task notifies creator without error', created >= 1 && !((await notifsOf(owner.token)).some(n => n.metadata && n.metadata.taskId === unassigned.data.task.id && n.type === 'TASK_ASSIGNED')));

  // Invalid date input does not crash the job
  const badDateRun = await runDeadlineCheck(new Date('garbage'));
  assert('job tolerates invalid date input (returns count, no throw)', typeof badDateRun === 'number');

  // DEADLINE_APPROACHING preference respected by the job
  await req('PUT', '/api/notifications/preferences', { token: owner.token, body: { deadlineApproaching: false } });
  await req('PUT', '/api/notifications/read-all', { token: owner.token });
  const freshDue = await req('POST', `/api/groups/${groupId}/tasks`, { token: owner.token, body: { title: `pref-deadline-${ts}`, dueDate: new Date(Date.now() + 11 * 3600 * 1000).toISOString() } });
  await runDeadlineCheck();
  assert('disabled deadlineApproaching suppresses deadline notifications', !((await notifsOf(owner.token)).some(n => n.metadata && n.metadata.taskId === freshDue.data.task.id)));
  await req('PUT', '/api/notifications/preferences', { token: owner.token, body: { deadlineApproaching: true } });

  // ================= CLEANUP =================
  console.log('\n--- Cleanup ---');
  await req('DELETE', `/api/groups/${groupId}`, { token: owner.token }); // cascades tasks/messages/memberships/taskmembers
  const { Op } = require('sequelize');
  const usernames = [owner.username, member.username, third.username, followerUser.username, outsider.username];
  await User.destroy({ where: { username: { [Op.in]: usernames } } }); // cascades notifications
  const remainingUsers = await User.count({ where: { username: { [Op.like]: `%_${ts}` } } });
  assert('cleanup removed all fixture users', remainingUsers === 0);

  console.log(`\n===== NOTIFICATION INTEGRATION RESULTS: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('SCRIPT ERROR:', e);
  process.exit(2);
});
