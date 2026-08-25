// Bounded in-memory sliding-window rate limiter for socket room-join commands
// (5D.5). Single-instance by design. Abuse shield ONLY - authorization
// (database membership checks) always runs independently for allowed requests.
const windows = new Map(); // key `${userId}:${event}` -> { count, expiresAt }

let limit = parseInt(process.env.SOCKET_JOIN_LIMIT || '20', 10);
if (!Number.isFinite(limit) || limit < 1) limit = 20;

let windowMs = parseInt(process.env.SOCKET_JOIN_WINDOW_MS || '10000', 10);
if (!Number.isFinite(windowMs) || windowMs < 100) windowMs = 10000;

function pruneExpired(now = Date.now()) {
  // Opportunistic bounded cleanup; also hard-cap map size against abuse.
  for (const [key, w] of windows) {
    if (w.expiresAt <= now) windows.delete(key);
  }
  if (windows.size > 10000) {
    const oldest = [...windows.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < oldest.length - 5000; i++) windows.delete(oldest[i][0]);
  }
}

// Returns { allowed, remaining, retryAfterMs }.
function check(userId, event) {
  pruneExpired();
  const now = Date.now();
  const key = `${Number(userId)}:${event}`;
  let w = windows.get(key);
  if (!w || w.expiresAt <= now) {
    w = { count: 0, expiresAt: now + windowMs };
    windows.set(key, w);
  }
  w.count++;
  return {
    allowed: w.count <= limit,
    remaining: Math.max(0, limit - w.count),
    retryAfterMs: Math.max(0, w.expiresAt - now)
  };
}

// Called on disconnect so reconnects never inherit stale counters.
function clearUser(userId) {
  const prefix = `${Number(userId)}:`;
  for (const key of windows.keys()) {
    if (key.startsWith(prefix)) windows.delete(key);
  }
}

function getLimit() { return limit; }
function getWindowMs() { return windowMs; }

// Test-only.
function reset() { windows.clear(); }

module.exports = { check, clearUser, pruneExpired, getLimit, getWindowMs, reset };
