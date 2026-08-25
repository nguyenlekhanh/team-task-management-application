// Failed-login brute-force shield (5E.3): bounded in-memory fixed-window
// counter keyed by client IP. Only FAILED attempts count; successful logins
// are never blocked. Abuse shield only - it does not replace authentication.
const attempts = new Map(); // ip -> { count, expiresAt }

let maxFailed = parseInt(process.env.AUTH_MAX_FAILED || '30', 10);
if (!Number.isFinite(maxFailed) || maxFailed < 1) maxFailed = 30;

let windowMs = parseInt(process.env.AUTH_FAILURE_WINDOW_MS || '900000', 10); // 15 min
if (!Number.isFinite(windowMs) || windowMs < 1000) windowMs = 900000;

function pruneExpired(now = Date.now()) {
  for (const [ip, w] of attempts) {
    if (w.expiresAt <= now) attempts.delete(ip);
  }
  if (attempts.size > 5000) {
    const oldest = [...attempts.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < oldest.length - 2500; i++) attempts.delete(oldest[i][0]);
  }
}

function isBlocked(ip) {
  pruneExpired();
  const w = attempts.get(ip);
  return !!w && w.count >= maxFailed && w.expiresAt > Date.now();
}

function recordFailure(ip) {
  pruneExpired();
  const now = Date.now();
  let w = attempts.get(ip);
  if (!w || w.expiresAt <= now) {
    w = { count: 0, expiresAt: now + windowMs };
    attempts.set(ip, w);
  }
  w.count++;
}

function getMaxFailed() { return maxFailed; }
function getWindowMs() { return windowMs; }

// Test-only.
function reset() { attempts.clear(); }

module.exports = { isBlocked, recordFailure, getMaxFailed, getWindowMs, reset };
