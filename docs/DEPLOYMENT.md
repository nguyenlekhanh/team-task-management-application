# Deployment & Operations Guide

Honest scope: this is a **single-node** deployment. SQLite, the presence registry, rate limiters, and Socket.IO rooms are all in-memory/single-process. There is **no Redis adapter, no horizontal scaling, and no distributed scheduler**.

## Build
```bash
# frontend
cd frontend
npm ci
npm run build          # -> dist/  (initial JS ≈ 265 kB / 87 kB gzip; pages code-split)

# backend (no build step)
cd backend
npm ci
```

## Environment (backend/.env)
| Variable | Required | Notes |
|---|---|---|
| NODE_ENV | yes → `production` | enables Secure cookie flag |
| PORT | yes | API + Socket.IO port |
| JWT_SECRET | **yes — strong random value** | dev fallback exists but MUST be overridden |
| DB_DATABASE | no | SQLite filename under `backend/data/` |
| CLIENT_ORIGIN | **yes** | exact browser origin(s), comma-separated; CORS + socket handshake allowlist |
| PRESENCE_GRACE_MS | no | offline grace (default 5000) |
| SOCKET_JOIN_LIMIT / SOCKET_JOIN_WINDOW_MS | no | join throttle (default 20 / 10 s) |
| AUTH_MAX_FAILED / AUTH_FAILURE_WINDOW_MS | no | login lockout (default 30 failures / 15 min per IP) |
| REFRESH_TOKEN_TTL_MS | no | session/refresh family lifetime (default 7 days); restart clears all sessions |
| REST_RATE_LIMIT / REST_RATE_WINDOW_MS | no | general per-IP REST limit on protected routes (default 600/min); health + auth exempt; restart clears counters |

**Reverse proxy note (9.2):** the rate limiters key on `req.ip` and the app deliberately
does NOT set `trust proxy`. If you deploy behind a load balancer/reverse proxy, set
`app.set('trust proxy', <your hop count>)` (or the `TRUSTED_PROXY` equivalent you
choose) so `req.ip` reflects the real client — otherwise all proxied traffic shares
one window and a spoofer could inject `X-Forwarded-For` values. Do not enable trust
for untrusted hops.

Frontend build-time: `VITE_API_URL` (e.g. `https://api.example.com/api`) — `VITE_SOCKET_URL` optional override.

## Run
```bash
node src/server.js     # serves REST (/api) AND Socket.IO (/socket.io) on PORT
```
Use a process manager (systemd, pm2). Health probe: `GET /api/health`.
Graceful restart: in-flight socket connections drop and clients auto-reconnect + re-authenticate + re-join authorized rooms + resync via REST — safe to restart at any time.

## Frontend serving
Serve `frontend/dist/` from a static host or the same Node process (add static middleware if desired). The browser must reach the API origin over HTTPS in production (`VITE_API_URL`). CORS allows only `CLIENT_ORIGIN`.

## Persistence & backups
- All data lives in the single file `backend/data/team-management.sqlite`
- Back up with the server stopped, or use SQLite's backup API/VACUUM INTO while running
- Deleting/recreating the file loses everything (there is no external store)

## Security posture & limitations
- JWT: HS256, 15-min expiry, HttpOnly+SameSite=Lax cookie AND localStorage bearer transport. Sessions (9.1): single-use refresh tokens (7-day families, `REFRESH_TOKEN_TTL_MS`) with rotation and replay-based theft detection; logout with the refresh token revokes the session server-side so its access tokens die immediately. Session store is in-memory single-process — restart logs all users out; pre-upgrade tokens stay valid ≤15 min without revocation
- Login brute-force lockout is per-IP, in-memory (resets on restart)
- General REST rate limit (9.2): 600 requests/min/IP on protected routes (env-adjustable), in-memory, safe 429 + Retry-After; health and auth are exempt
- Presence + join limiter are in-memory and reset on restart
- Set `JWT_SECRET`, `CLIENT_ORIGIN`, `NODE_ENV=production` before exposing publicly; put HTTPS/TLS termination in front (not handled in-app)
- Scheduled job: DEADLINE_APPROACHING check runs daily at 09:00 UTC in-process; missed runs while stopped are not back-filled

## Explicit non-goals of current architecture
- Multi-instance/horizontal scaling (would require Redis adapter + shared presence + moving off SQLite)
- Distributed job queue for the scheduler
- Email/push delivery channels
