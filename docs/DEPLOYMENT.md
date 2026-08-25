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
- JWT: HS256, 15-min expiry, HttpOnly+SameSite=Lax cookie AND localStorage bearer transport; logout clears the cookie but stateless tokens stay valid until expiry (no revocation list)
- Login brute-force lockout is per-IP, in-memory (resets on restart)
- Presence + join limiter are in-memory and reset on restart
- Set `JWT_SECRET`, `CLIENT_ORIGIN`, `NODE_ENV=production` before exposing publicly; put HTTPS/TLS termination in front (not handled in-app)
- Scheduled job: DEADLINE_APPROACHING check runs daily at 09:00 UTC in-process; missed runs while stopped are not back-filled

## Explicit non-goals of current architecture
- Multi-instance/horizontal scaling (would require Redis adapter + shared presence + moving off SQLite)
- Distributed job queue for the scheduler
- Email/push delivery channels
