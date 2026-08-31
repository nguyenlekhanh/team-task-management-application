// General REST request-rate limiter (9.2): bounded in-memory fixed-window
// counter keyed by client IP — the same architecture and memory discipline as
// loginLimiter (5E.3) and joinLimiter (5D.5), applied to request counting on
// the protected REST surface. Abuse shield only: it never replaces
// authentication or authorization, and it runs BEFORE them so throttled
// requests never reach the database.
//
// Client identification: req.ip — identical to the login limiter. The app does
// NOT set 'trust proxy', so this is the socket remote address and cannot be
// spoofed via forwarding headers. Deployments behind a reverse proxy must set
// 'trust proxy' deliberately (see docs/DEPLOYMENT.md) — doing it implicitly
// here would let clients spoof their IP and bypass the limit.
//
// Single-instance by design (docs/DEPLOYMENT.md non-goal: no Redis).
const windows = new Map(); // ip -> { count, expiresAt }

let limit = parseInt(process.env.REST_RATE_LIMIT || '600', 10);
if (!Number.isFinite(limit) || limit < 1) limit = 600;

let windowMs = parseInt(process.env.REST_RATE_WINDOW_MS || '60000', 10);
if (!Number.isFinite(windowMs) || windowMs < 1000) windowMs = 60000;

function pruneExpired(now = Date.now()) {
  for (const [ip, w] of windows) {
    if (w.expiresAt <= now) windows.delete(ip);
  }
  if (windows.size > 10000) {
    const oldest = [...windows.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < oldest.length - 5000; i++) windows.delete(oldest[i][0]);
  }
}

function getLimit() { return limit; }
function getWindowMs() { return windowMs; }

// Test-only.
function reset() { windows.clear(); }

// Express middleware: consumes one request from the caller's IP window.
// Allowed requests pass through; throttled requests get a safe 429 envelope
// with a standard Retry-After header (whole seconds, min 1).
function restLimiter(req, res, next) {
  pruneExpired();
  const now = Date.now();
  const key = req.ip || 'unknown';
  let w = windows.get(key);
  if (!w || w.expiresAt <= now) {
    w = { count: 0, expiresAt: now + windowMs };
    windows.set(key, w);
  }
  w.count++;

  if (w.count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((w.expiresAt - now) / 1000));
    return res.status(429)
      .set('Retry-After', String(retryAfterSec))
      .json({ error: 'Too many requests. Please try again later.' });
  }

  next();
}

module.exports = { restLimiter, getLimit, getWindowMs, reset };
