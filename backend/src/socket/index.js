const { Server } = require('socket.io');
const { authenticateSocket } = require('./auth');
const { userRoom } = require('./rooms');

let io = null;

function getAllowedOrigins() {
  return (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

// Initializes Socket.IO on the shared HTTP server and wires the emitter.
// Safe reasons only are surfaced to clients (see socket/auth.js).
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

    // Unknown events are ignored silently - the server never trusts or
    // executes arbitrary client events (5D.1 §17).
    socket.on('disconnect', (reason) => {
      console.log(`[SOCKET] user ${socket.user.username} (#${socket.userId}) disconnected (${reason})`);
    });
  });

  require('../services/realtimeEmitter').init(io);
  return io;
}

function getIo() {
  return io;
}

module.exports = { init, getIo };
