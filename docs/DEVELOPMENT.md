# Development Guide

## Prerequisites
- Node.js ≥ 20.17 recommended (project has been exercised on Node 18/20)
- npm

## Repository layout
```
backend/    Express API + Sequelize (SQLite) + Socket.IO + tests/
frontend/   React 18 + Vite SPA
docs/       API / deployment / user guides
*.txt       Per-phase implementation & test records (5A.1 … 5E.5)
```

## Environment variables

Copy `.env.example` to `backend/.env` (and set frontend vars in `frontend/.env`):

| Variable | Where | Default | Purpose |
|---|---|---|---|
| PORT | backend | 3000 | API/socket listen port |
| NODE_ENV | backend | development | `production` enables Secure cookie flag |
| DB_DATABASE | backend | team-management | SQLite file name inside `backend/data/` |
| JWT_SECRET | backend | dev fallback (**set a strong value in production**) | Token signing |
| CLIENT_ORIGIN | backend | http://localhost:5173 | CORS allowlist (REST + Socket.IO), comma-separated |
| PRESENCE_GRACE_MS | backend | 5000 | Offline grace period after last socket disconnect |
| SOCKET_JOIN_LIMIT / SOCKET_JOIN_WINDOW_MS | backend | 20 / 10000 | Socket room-join rate limit |
| AUTH_MAX_FAILED / AUTH_FAILURE_WINDOW_MS | backend | 30 / 900000 | Login brute-force lockout (failed attempts per IP) |
| VITE_API_URL | frontend | /api | e.g. `http://localhost:3000/api` in dev |
| VITE_SOCKET_URL | frontend | derived from VITE_API_URL origin | Explicit socket endpoint override |

Never commit real secrets — only `.env.example` is tracked.

## Setup & run
```bash
# install
npm install && cd backend && npm install && cd ../frontend && npm install && cd ..

# database migrations (SQLite, created under backend/data/)
cd backend
../node_modules/.bin/sequelize db:migrate

# run backend (API on :3000)
npm run dev        # nodemon
# or: npm start

# run frontend dev server (:5173, proxies /api)
cd ../frontend
npm run dev
```

## Production build
```bash
cd frontend && npm run build     # outputs dist/
npm run preview                  # local static preview of dist
# serve dist/ from any static host; point VITE_API_URL/VITE_SOCKET_URL at the API
```

## Database
- SQLite file: `backend/data/team-management.sqlite`
- Migrations live in `backend/migrations/`, tracked by `SequelizeMeta`
- Roll back latest: `../node_modules/.bin/sequelize db:migrate:undo`

## Tests
Start the backend first (`npm start`); suites talk to it over HTTP.
For fast timing knobs use:
```bash
PRESENCE_GRACE_MS=800 SOCKET_JOIN_LIMIT=8 SOCKET_JOIN_WINDOW_MS=3000 npm start
```
Then (from `backend/`):
```bash
npm run test:all                  # aggregate: all 9 suites in order
npm run test:sockets              # foundation
npm run test:chat                 # realtime chat/comments
npm run test:notification-realtime
npm run test:presence
npm run test:system               # cross-feature integration
npm run test:notifications        # REST notification integration (5C.5 style)
npm run test:errors               # error contract/sanitization
npm run test:security             # authz/IDOR/forgery/lockout (lockout section needs AUTH_MAX_FAILED<=8)
npm run test:performance          # statement-bound & cleanup guards
```
Frontend: `npm run build` must succeed; there is no browser automation framework.

## Realtime development notes
- Socket.IO attaches to the same HTTP server as Express (`src/socket/index.js`)
- Emissions flow through `src/services/realtimeEmitter.js` (no-op safe before init)
- Presence registry: `src/socket/presence.js` (in-memory, multi-tab counted)
- Join rate limiter: `src/socket/joinLimiter.js` (per-user fixed windows)
- All notification creation funnels through `src/utils/notificationService.js`

## Debugging
- Backend logs use prefixes: `[ERROR]`, `[JOB]` (deadline scheduler), `[SOCKET]`
- Health probe: `GET http://localhost:3000/api/health`
- SQLite inspection: any sqlite CLI against `backend/data/team-management.sqlite`
- Frontend network errors: axios timeout is 15 s; auth-endpoint 401s do not trigger the global logout redirect

## Common problems
- **EADDRINUSE**: a previous dev server still holds :3000 — kill it before restarting
- **429 on login during tests**: the failed-attempt limiter is per-IP; restart server or wait out the window
- **Presence suite fails without knobs**: it requires the small grace/join-limit env values above
