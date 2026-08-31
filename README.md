# Team Task Management Application

A collaboration platform combining **team groups, task management, checklists, group chat, task comments, notifications, and realtime updates** — built with React + Vite on the frontend and Node/Express + Sequelize (SQLite) + Socket.IO on the backend.

**Status: feature-complete for implemented scope.** 439 automated assertions across 15 test suites, all passing.

## Features
- **Authentication** — register/login (JWT, bcrypt-hashed passwords), profile editing, password change, brute-force login lockout
- **Groups & members** — create/update/delete groups; owner/admin/member roles; member management with realtime room eviction on removal
- **Tasks** — CRUD, assignment, statuses, priorities, filters/search/sorting/pagination, per-task authorization
- **Checklists** — ordered items, completion tracking with completer + timestamp
- **Chat & comments** — group chat + per-task comments with edit/delete and role-based deletion
- **Notifications** — TASK_ASSIGNED, TASK_COMPLETED, NEW_MESSAGE, DEADLINE_APPROACHING, MENTION; unread badge; mark read/all-read/delete; per-type user preferences
- **Realtime** — Socket.IO: instant messages/comments, pushed notifications, connection-derived presence with multi-tab support, automatic reconnect + REST resync
- **Sessions** — 15-minute access tokens + single-use refresh tokens with rotation and theft detection; logout revokes the session server-side (9.1)
- **Security** — CORS allowlist, HS256-pinned JWTs, HttpOnly+SameSite cookies, security headers, rate limiting (logins + socket joins + general per-IP REST limit on protected routes), validated/sanitized inputs, blind-404 authorization, safe error envelopes

## Architecture
```
React 18 + Vite + TailwindCSS  ──HTTP/WS──►  Express + Socket.IO ──Sequelize──► SQLite
      Context/hooks, code-split routes            JWT auth · in-memory presence/limiters
```
REST is authoritative for all reads/writes; Socket.IO is a best-effort delivery layer. Single-node by design (see docs/DEPLOYMENT.md).

## Repository structure
```
backend/
  src/{controllers,routes,middleware,models,services,socket,utils,jobs,jobs,config}
  migrations/          Sequelize migrations (Users…Notifications)
  tests/               15 integration/security/perf suites (plain node scripts)
frontend/
  src/{pages,components,contexts,hooks,services}
docs/                  API.md · DEVELOPMENT.md · DEPLOYMENT.md · USER_GUIDE.md
PROJECT_*.md / *.txt   Phase plans, records, and final reports (5A … 5E.5)
```

## Quick start
```bash
npm install && cd backend && npm install && cd ../frontend && npm install && cd ..
cp .env.example backend/.env           # defaults work for local dev

cd backend
../node_modules/.bin/sequelize db:migrate
PRESENCE_GRACE_MS=800 SOCKET_JOIN_LIMIT=8 SOCKET_JOIN_WINDOW_MS=3000 npm start   # :3000

# second terminal
cd frontend && npm run dev             # :5173 (proxies /api)
```
Full configuration reference: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## Test commands (backend/, server must be running)
```bash
npm run test:all        # aggregate: all 15 suites
npm run test:sockets | test:chat | test:notification-realtime | test:presence
npm run test:system | test:notifications | test:errors | test:security | test:performance
npm run test:mytasks | test:dashboard | test:productivity | test:member-workload | test:refresh-auth | test:rest-limit
```
Presence suite needs `PRESENCE_GRACE_MS=800 SOCKET_JOIN_LIMIT=8` env values; security lockout section needs `AUTH_MAX_FAILED<=8`; rest-limit throttle section needs `REST_RATE_LIMIT<=50` on server and test env. Frontend: `npm run build`.

## Documentation
- [docs/API.md](docs/API.md) — REST endpoints + Socket.IO event contract
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, env vars, tests, debugging
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production notes and honest limitations
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — end-user walkthrough

## Security notes
JWTs expire after 15 minutes (HttpOnly SameSite cookie + bearer transport) and are backed by single-use refresh tokens (7-day families, rotation + replay revocation; logout revokes the session — 9.1); passwords are bcrypt-hashed and never returned; CORS is an allowlist; logins, socket joins, and general REST traffic on protected routes are rate-limited (9.2); error responses are sanitized envelopes. See 5E.3.txt for the security review and 9.1.txt/9.2.txt for the session and rate-limit work. Production checklist: set a strong `JWT_SECRET`, exact `CLIENT_ORIGIN`, `NODE_ENV=production`, HTTPS in front.

## Known limitations
Single-node only (SQLite + in-memory presence/rate-limiters/rooms; no Redis adapter); no token revocation list (stateless 15-min tokens); scheduler runs in-process daily at 09:00 UTC; no email/push delivery; no mobile-native client.
