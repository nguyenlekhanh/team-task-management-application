const { userRoom } = require('../socket/rooms');

// No-op-safe realtime emitter (5D.1 §11). Services emit through this module
// without knowing Socket.IO internals; before init() everything is a silent
// no-op, so REST-only code paths and test suites are unaffected.
let ioInstance = null;

function init(io) {
  ioInstance = io;
}

function isInitialized() {
  return !!ioInstance;
}

// Test-only: forget the current instance so "before init" behavior can be asserted.
function reset() {
  ioInstance = null;
}

function emitToUser(userId, event, payload) {
  if (!ioInstance || userId === null || userId === undefined) {
    return false;
  }
  ioInstance.to(userRoom(Number(userId))).emit(event, payload);
  return true;
}

function emitToRoom(room, event, payload) {
  if (!ioInstance || !room) {
    return false;
  }
  ioInstance.to(room).emit(event, payload);
  return true;
}

module.exports = { init, isInitialized, reset, emitToUser, emitToRoom };
