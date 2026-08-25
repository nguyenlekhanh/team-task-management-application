// In-memory presence registry (5D.5). Single-instance by design (5D.1 §14).
//
// Tracks authenticated sockets per user so online state is CONNECTION-DERIVED:
//   0 -> 1 sockets : user comes online, broadcast once
//   n -> n         : no transition
//   1 -> 0 sockets : grace period starts; offline broadcast ONLY if the timer
//                    fires while the user still has zero sockets (generation-
//                    guarded so stale timers can never mark a live user offline)
//
// User.onlineStatus (Users table) is a separate USER-CONTROLLED profile flag -
// it is intentionally NOT written here (no per-connection DB writes; see 5D.5 docs).
const { GroupMember } = require('../models');
const { groupRoom } = require('./rooms');

// Map<userId, { sockets:Set<socketId>, generation:number, offlineTimer }>
const registry = new Map();
let ioRef = null;

let graceMs = parseInt(process.env.PRESENCE_GRACE_MS || '5000', 10);
if (!Number.isFinite(graceMs) || graceMs < 0) graceMs = 5000;

function init(io) {
  ioRef = io;
}

function isInitialized() {
  return !!ioRef;
}

// Test/diagnostic knob without leaking test-only behavior into production paths.
function configure({ graceMs: ms }) {
  if (Number.isFinite(ms) && ms >= 0) graceMs = ms;
}

function getGraceMs() {
  return graceMs;
}

function isOnline(userId) {
  const entry = registry.get(Number(userId));
  return !!entry && entry.sockets.size > 0;
}

function getConnectionCount(userId) {
  const entry = registry.get(Number(userId));
  return entry ? entry.sockets.size : 0;
}

function getSocketIds(userId) {
  const entry = registry.get(Number(userId));
  return entry ? [...entry.sockets] : [];
}

async function getUserGroupRooms(userId) {
  const memberships = await GroupMember.findAll({
    where: { userId },
    attributes: ['groupId']
  });
  return memberships.map(m => groupRoom(m.groupId));
}

// Best-effort: a failed presence broadcast must never affect socket lifecycle.
async function broadcastPresence(userId, online) {
  if (!ioRef) return;
  try {
    const payload = { userId: Number(userId), online, at: new Date().toISOString() };
    const rooms = await getUserGroupRooms(userId);
    for (const room of rooms) {
      ioRef.to(room).emit('presence:updated', payload);
    }
  } catch (err) {
    console.error('[PRESENCE] broadcast failed:', err.message);
  }
}

// Returns true when this connection flipped the user online (0 -> 1).
function addSocket(userId, socketId) {
  const uid = Number(userId);
  let entry = registry.get(uid);
  if (!entry) {
    entry = { sockets: new Set(), generation: 0, offlineTimer: null };
    registry.set(uid, entry);
  }
  const wasOffline = entry.sockets.size === 0;
  entry.sockets.add(socketId);

  if (wasOffline) {
    // Cancel any pending offline transition; bump generation so an already-
    // scheduled stale timer becomes a no-op even if clearing raced.
    if (entry.offlineTimer) {
      clearTimeout(entry.offlineTimer);
      entry.offlineTimer = null;
    }
    entry.generation++;
    setImmediate(() => broadcastPresence(uid, true));
    return true;
  }
  return false;
}

// Returns true when the OFFLINE GRACE PERIOD started (last socket gone).
// The offline broadcast itself happens only if the timer fires while the
// user still has zero sockets (generation-checked inside).
function removeSocket(userId, socketId) {
  const uid = Number(userId);
  const entry = registry.get(uid);
  if (!entry) return false;
  entry.sockets.delete(socketId);
  if (entry.sockets.size > 0) {
    return false; // other tabs/devices remain - user stays online
  }
  const generation = ++entry.generation;
  entry.offlineTimer = setTimeout(() => {
    const current = registry.get(uid);
    if (!current || current.generation !== generation || current.sockets.size > 0) {
      return; // stale timer: user reconnected meanwhile
    }
    registry.delete(uid);
    setImmediate(() => broadcastPresence(uid, false));
  }, graceMs);
  return true;
}

// Evicts ALL of a user's sockets from a specific room (multi-tab correct).
// Used on membership removal - clients are never trusted to leave themselves.
function evictUserFromRoom(userId, room) {
  if (!ioRef) return 0;
  let count = 0;
  const ids = getSocketIds(userId);
  for (const sid of ids) {
    const s = ioRef.sockets.sockets.get(sid);
    if (s && s.rooms && s.rooms.has(room)) {
      s.leave(room);
      count++;
    }
  }
  return count;
}

function evictUserFromGroup(userId, groupId) {
  return evictUserFromRoom(userId, groupRoom(groupId));
}

// Test-only: forget everything (timers included).
function reset() {
  for (const entry of registry.values()) {
    if (entry.offlineTimer) clearTimeout(entry.offlineTimer);
  }
  registry.clear();
  ioRef = null;
}

module.exports = {
  init,
  isInitialized,
  configure,
  getGraceMs,
  isOnline,
  getConnectionCount,
  getSocketIds,
  addSocket,
  removeSocket,
  evictUserFromRoom,
  evictUserFromGroup,
  reset
};
