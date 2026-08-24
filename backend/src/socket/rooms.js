// Room naming helpers (5D.1 §6). Rooms are memory-only; membership is
// authorized server-side. Clients can never name a room directly.

const userRoom = (userId) => `user:${userId}`;
const groupRoom = (groupId) => `group:${groupId}`;
const taskRoom = (taskId) => `task:${taskId}`;

module.exports = { userRoom, groupRoom, taskRoom };
