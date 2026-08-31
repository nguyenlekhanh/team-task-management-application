const crypto = require('crypto');

// Session/refresh-token store (9.1). Single-node, in-memory — the same accepted
// deployment pattern as the presence registry and rate limiters (docs/DEPLOYMENT.md
// "single-node, in-memory" architecture). Server restart invalidates all sessions:
// users re-login. This is strictly safer than the previous posture where logout
// cleared the cookie but the bearer token stayed valid up to 15 minutes.
//
// Structure:
//   families:      Map<familyId, { userId, expiresAt, revokedAt? }> - one per login session
//   live:          Map<hashedRefreshId, { familyId, userId }>       - unconsumed refresh tokens
//   lastConsumed:  Map<familyId, hashedRefreshId>                   - replay detection
//   consumed:      Map<hashedRefreshId, familyId>                   - lookup for the above
//
// Refresh tokens are random 256-bit ids; only their sha256 hash is stored.
//
// Theft detection: refresh tokens are single-use. Presenting an already-consumed
// token means it was copied/stolen — the entire family is revoked immediately.
//
// Memory bounds (same discipline as loginLimiter/joinLimiter): expired families and
// revocation tombstones older than the access-token lifetime are pruned
// opportunistically; hard caps guard pathological volume.

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAMILIES = 10000;
// Revoked families must outlive their access tokens (≤15 min); 1 hour is ample.
const TOMBSTONE_TTL_MS = 60 * 60 * 1000;

function getTtlMs() {
  const parsed = parseInt(process.env.REFRESH_TOKEN_TTL_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

function hashId(id) {
  return crypto.createHash('sha256').update(String(id)).digest('hex');
}

function prune(now = Date.now()) {
  for (const [familyId, family] of families) {
    const expired = family.expiresAt <= now;
    const tombstoneDead = family.revokedAt && now - family.revokedAt > TOMBSTONE_TTL_MS;
    if (expired || tombstoneDead) {
      dropFamily(familyId);
    }
  }
}

function dropFamily(familyId) {
  const last = lastConsumed.get(familyId);
  if (last) {
    consumed.delete(last);
    lastConsumed.delete(familyId);
  }
  for (const [hashed, entry] of live) {
    if (entry.familyId === familyId) live.delete(hashed);
  }
  families.delete(familyId);
}

// Creates a new session family and its first refresh token.
// Returns { refreshToken, sid } — sid is the family id embedded in access tokens
// so revocation can be checked with a single lookup.
function createSession(userId) {
  prune();
  if (families.size >= MAX_FAMILIES) {
    // Defensive cap (same posture as the limiters): shed the oldest entries.
    const byExpiry = [...families.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < Math.ceil(byExpiry.length / 4) && i < byExpiry.length; i++) {
      dropFamily(byExpiry[i][0]);
    }
  }
  const familyId = crypto.randomBytes(24).toString('hex');
  const refreshToken = crypto.randomBytes(32).toString('hex');

  families.set(familyId, { userId, expiresAt: Date.now() + getTtlMs() });
  live.set(hashId(refreshToken), { familyId, userId });
  return { refreshToken, sid: familyId };
}

// Issues the NEXT refresh token for a family (rotation step).
function issueRefreshToken(familyId, userId) {
  const refreshToken = crypto.randomBytes(32).toString('hex');
  live.set(hashId(refreshToken), { familyId, userId });
  return refreshToken;
}

// Validates a refresh token, consumes it (single use), and remembers it for
// replay detection. Returns { userId, sid } on success or null.
function consumeRefreshToken(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken.length < 32 || refreshToken.length > 256) {
    return null;
  }
  const hashed = hashId(refreshToken);

  const entry = live.get(hashed);
  if (entry) {
    live.delete(hashed);

    const family = families.get(entry.familyId);
    if (!family || family.revokedAt || family.expiresAt <= Date.now()) {
      revokeFamily(entry.familyId);
      return null;
    }

    // Remember the just-consumed hash (forget any older one for this family).
    const previous = lastConsumed.get(entry.familyId);
    if (previous) consumed.delete(previous);
    lastConsumed.set(entry.familyId, hashed);
    consumed.set(hashed, entry.familyId);

    return { userId: entry.userId, sid: entry.familyId };
  }

  // Not a live token. If it is a previously CONSUMED one, this is a replay —
  // assume theft and revoke the whole family.
  const replayFamilyId = consumed.get(hashed);
  if (replayFamilyId) {
    console.warn('[AUTH] refresh-token replay detected — revoking session family');
    revokeFamily(replayFamilyId);
  }
  return null;
}

// Revokes an entire session family (logout / theft response / user deletion).
// Keeps a short-lived tombstone so already-issued access tokens (≤15 min) are
// rejected until they naturally expire.
function revokeFamily(familyId) {
  if (!familyId) return;
  const family = families.get(familyId);
  if (family) {
    family.revokedAt = Date.now();
  } else {
    families.set(familyId, { userId: null, expiresAt: 0, revokedAt: Date.now() });
  }
  const last = lastConsumed.get(familyId);
  if (last) {
    consumed.delete(last);
    lastConsumed.delete(familyId);
  }
  for (const [hashed, entry] of live) {
    if (entry.familyId === familyId) live.delete(hashed);
  }
}

// Revokes every family belonging to a user (available for password-change /
// account-deletion flows).
function revokeUser(userId) {
  for (const [familyId, family] of families) {
    if (family.userId === userId && !family.revokedAt) revokeFamily(familyId);
  }
}

// Access-token check: is this session family alive? O(1) — called from
// getUserFromToken for every authenticated request (REST + socket).
function isFamilyActive(sid) {
  if (!sid || typeof sid !== 'string') return false;
  const family = families.get(sid);
  if (!family || family.revokedAt) return false;
  return family.expiresAt > Date.now();
}

const families = new Map();
const live = new Map();
const lastConsumed = new Map();
const consumed = new Map();

// Test-only: clear all state.
function reset() {
  families.clear();
  live.clear();
  lastConsumed.clear();
  consumed.clear();
}

module.exports = {
  createSession,
  issueRefreshToken,
  consumeRefreshToken,
  revokeFamily,
  revokeUser,
  isFamilyActive,
  reset
};
