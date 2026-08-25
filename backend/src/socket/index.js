const { Server } = require('socket.io');
const { GroupMember, Task } = require('../models');
const { authenticateSocket } = require('./auth');
const { userRoom, groupRoom, taskRoom } = require('./rooms');
const presence = require('./presence');
const joinLimiter = require('./joinLimiter');

let io = null;

function getAllowedOrigins() {
  return (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

// Extracts (payload, ack) from variable handler args regardless of position.
function extractArgs(args) {
  let payload;
  let ack;
  for (const arg of args) {
    if (typeof arg === 'function') ack = arg;
    else if (payload === undefined) payload = arg;
  }
  return { payload: payload || {}, ack };
}

function validPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

// Abuse shield only - membership validation below always runs for allowed
// requests. Throttled requests never reach the database.
function enforceJoinRateLimit(socket, event, ack) {
  const verdict = joinLimiter.check(socket.userId, event);
  if (!verdict.allowed && ack) {
    ack({ ok: false, error: 'Too many join attempts, slow down' });
    return false;
  }
  return true;
}

async function handleGroupJoin(socket, args) {
  const { payload, ack } = extractArgs(args);
  if (!enforceJoinRateLimit(socket, 'group:join', ack)) return;
  const groupId = payload ? payload.groupId : undefined;
  if (!validPositiveInt(groupId)) {
    if (ack) ack({ ok: false, error: 'Invalid group ID' });
    return;
  }
  try {
    const membership = await GroupMember.findOne({
      where: { groupId, userId: socket.userId }
    });
    if (!membership) {
      if (ack) ack({ ok: false, error: 'Not a member of this group' });
      return;
    }
    socket.join(groupRoom(groupId));
    if (ack) ack({ ok: true });
  } catch {
    if (ack) ack({ ok: false, error: 'Unable to verify group access' });
  }
}

function handleGroupLeave(socket, args) {
  const { payload, ack } = extractArgs(args);
  const groupId = payload ? payload.groupId : undefined;
  if (!validPositiveInt(groupId)) {
    if (ack) ack({ ok: false, error: 'Invalid group ID' });
    return;
  }
  socket.leave(groupRoom(groupId));
  if (ack) ack({ ok: true });
}

async function handleTaskJoin(socket, args) {
  const { payload, ack } = extractArgs(args);
  if (!enforceJoinRateLimit(socket, 'task:join', ack)) return;
  const taskId = payload ? payload.taskId : undefined;
  if (!validPositiveInt(taskId)) {
    if (ack) ack({ ok: false, error: 'Invalid task ID' });
    return;
  }
  try {
    const task = await Task.findByPk(taskId);
    if (!task) {
      if (ack) ack({ ok: false, error: 'Task not found' });
      return;
    }
    const membership = await GroupMember.findOne({
      where: { groupId: task.groupId, userId: socket.userId }
    });
    if (!membership) {
      if (ack) ack({ ok: false, error: 'Not authorized to access this task' });
      return;
    }
    socket.join(taskRoom(taskId));
    if (ack) ack({ ok: true });
  } catch {
    if (ack) ack({ ok: false, error: 'Unable to verify task access' });
  }
}

function handleTaskLeave(socket, args) {
  const { payload, ack } = extractArgs(args);
  const taskId = payload ? payload.taskId : undefined;
  if (!validPositiveInt(taskId)) {
    if (ack) ack({ ok: false, error: 'Invalid task ID' });
    return;
  }
  socket.leave(taskRoom(taskId));
  if (ack) ack({ ok: true });
}

// Initializes Socket.IO on the shared HTTP server and wires the emitter.
function init(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: getAllowedOrigins(),
      credentials: true
    }
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    // Private room: joined implicitly for the authenticated identity only.
    socket.join(userRoom(socket.userId));

    // Presence registry (connection-derived, multi-tab safe). Broadcasts and
    // DB lookups inside are best-effort and cannot break the connection.
    presence.addSocket(socket.userId, socket.id);

    console.log(`[SOCKET] user ${socket.user.username} (#${socket.userId}) connected (${socket.id})`);

    // Foundation diagnostic (authenticated, self-scoped): lets clients/tests
    // verify identity + room membership. Not a domain event.
    socket.on('foundation:whoami', (...args) => {
      const ack = args.find(a => typeof a === 'function');
      if (typeof ack === 'function') {
        ack({
          userId: socket.userId,
          username: socket.user.username,
          rooms: [...socket.rooms]
        });
      }
    });

    // Domain room commands (5D.1 §8): rate-limited + database-backed authz.
    socket.on('group:join', (...args) => { handleGroupJoin(socket, args); });
    socket.on('group:leave', (...args) => { handleGroupLeave(socket, args); });
    socket.on('task:join', (...args) => { handleTaskJoin(socket, args); });
    socket.on('task:leave', (...args) => { handleTaskLeave(socket, args); });

    // Unknown events are ignored silently - the server never trusts or
    // executes arbitrary client events (5D.1 §17).
    socket.on('disconnect', (reason) => {
      presence.removeSocket(socket.userId, socket.id); // grace period handled internally
      joinLimiter.clearUser(socket.userId);            // reconnects never inherit stale counters
      console.log(`[SOCKET] user ${socket.user.username} (#${socket.userId}) disconnected (${reason})`);
    });
  });

  require('../services/realtimeEmitter').init(io);
  presence.init(io);
  return io;
}

function getIo() {
  return io;
}

module.exports = { init, getIo };
