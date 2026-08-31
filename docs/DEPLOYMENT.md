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
does NOT set `trust proxy` by default. If you deploy behind a load balancer/reverse
proxy, set `TRUST_PROXY` (9.3) — e.g. `TRUST_PROXY=1` for one nginx hop on the same
host, `TRUST_PROXY=loopback`, or a CIDR — so `req.ip` reflects the real client.
Express then honors `X-Forwarded-*` ONLY from that many trusted hops; do not enable
trust for untrusted hops (clients could spoof their IP and bypass the rate limiters).

| TRUST_PROXY | no | unset = direct exposure (default). `1` (hops), `loopback`, or CIDR when behind a trusted reverse proxy; makes req.ip real and X-Forwarded-* honored from trusted hops only (9.3) |

Frontend build-time: `VITE_API_URL` (e.g. `https://api.example.com/api`) — `VITE_SOCKET_URL` optional override.

## TLS / HTTPS / HSTS / CSP posture (9.3)

**Architecture: TLS terminates at the reverse proxy.** The Node app serves plain
HTTP on `PORT` to its trusted proxy and never handles certificates — no key material
exists in this repository. Behind the proxy, the browser sees HTTPS, so the
`Secure` cookie flags (enabled by `NODE_ENV=production`) work as intended. Socket.IO
uses the same HTTP server and upgrades transparently once the proxy passes
`Upgrade`/`Connection` headers (see config below); clients reconnect + re-auth +
resync automatically if a connection drops.

**What the APPLICATION enforces (code, verified by `npm run test:posture`):**
- Production only (`NODE_ENV=production`): `Strict-Transport-Security:
  max-age=31536000` — conservative: **no preload, no includeSubDomains** (no project
  requirement justifies them) — and a strict JSON-API CSP
  (`default-src 'none'; frame-ancestors 'none'`) on every API response, alongside the
  existing 5E.3 headers (nosniff / X-Frame-Options DENY / Referrer-Policy no-referrer).
- Development: none of the two production-only headers (HSTS over plain HTTP would be
  wrong; CSP would fight Vite's HMR) — the three 5E.3 headers remain.
- `TRUST_PROXY` handling as described above (default off = no spoofing surface).

**What the REVERSE PROXY must enforce (configuration, not code):** TLS termination,
HTTP→HTTPS redirect, WebSocket upgrade for `/socket.io/`, HSTS + CSP for the static
frontend, and forwarding to the app. Reference nginx configuration — adapt domains,
cert paths, and the API origin to your deployment:

```nginx
# HTTP -> HTTPS redirect (all plaintext traffic moves to TLS)
server {
  listen 80;
  server_name app.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  http2 on;
  server_name app.example.com;

  # TLS termination (proxy-owned; never commit these files)
  ssl_certificate     /etc/ssl/example/fullchain.pem;
  ssl_certificate_key /etc/ssl/example/privkey.pem;
  ssl_protocols       TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;

  # HSTS — MUST match the app's max-age (31536000) so headers never contradict.
  # Same conservative posture: no preload, no includeSubDomains.
  add_header Strict-Transport-Security "max-age=31536000" always;

  # Static frontend (dist/) — CSP is the MINIMUM viable policy for this app
  # (audited 9.3): style-src 'unsafe-inline' is required by three React inline
  # style props; img-src https:/data: because user-supplied avatar URLs render
  # as <img>; connect-src covers the API origin + WebSocket upgrades.
  root /var/www/team-tasks/dist;
  index index.html;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https://api.example.com wss://api.example.com; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" always;
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API + Socket.IO — proxy to the Node app (plain HTTP on its loopback port).
  # The Upgrade/Connection headers are REQUIRED for Socket.IO WebSockets.
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

With `TRUST_PROXY=1` (one trusted hop), the app's rate limiters then key on the real
client IP from `X-Forwarded-For` instead of the proxy's address.

**Security tradeoffs — what is enforced where (honest ledger):**

| Control | Enforced by | Verified how |
|---|---|---|
| TLS / certificates | Reverse proxy only | Deployment checklist (not testable in-repo) |
| HTTP→HTTPS redirect | Reverse proxy only | Deployment checklist |
| HSTS on API responses | App code (production only) | test:posture (header asserted) |
| HSTS on frontend | Reverse proxy config | Static doc check (directive present + matching max-age) |
| CSP on API responses | App code (strict: default-src 'none') | test:posture |
| CSP on frontend | Reverse proxy config (minimum viable policy, documented) | Static doc check; manual browser smoke recommended at deploy |
| Secure/HttpOnly/SameSite cookies | App code (NODE_ENV=production) | test:posture (login Set-Cookie flags) |
| trust proxy / real client IP | App code (TRUST_PROXY opt-in; default off) | Deployment checklist + static config check |
| WebSocket upgrades | Reverse proxy config | Static doc check (Upgrade/Connection directives) |

**Not enabled in development (intentionally):** HSTS (wrong over plain HTTP — could
lock browsers to a non-TLS local origin), the API CSP header (Vite dev server injects
its own machinery; the production CSP is enforced only when `NODE_ENV=production`),
and `Secure` cookie flags (dev cookies must work over http://localhost).

**Deployment verification checklist (must be performed at deploy time, not in-repo):**
1. `curl -sI http://app.example.com/api/health` redirects (301) to https.
2. `curl -sI https://app.example.com/api/health` shows `Strict-Transport-Security`,
   `Content-Security-Policy` (API policy), `X-Content-Type-Options`, `X-Frame-Options`.
3. Frontend page loads without CSP console violations (scripts/styles/images/sockets).
4. Socket.IO connects over wss:// and messages arrive live.
5. Login works and cookies carry `Secure; HttpOnly; SameSite=Lax` in the browser.
6. With `TRUST_PROXY` set, repeated requests from two different clients count as two
   IPs (rate-limit windows are per-client, not shared through the proxy).

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
- Set `JWT_SECRET`, `CLIENT_ORIGIN`, `NODE_ENV=production` before exposing publicly; put HTTPS/TLS termination in front (not handled in-app — see the 9.3 proxy section below); when behind a proxy, set `TRUST_PROXY`
- App-level production headers (9.3): HSTS `max-age=31536000` (no preload/includeSubDomains) + strict JSON-API CSP (`default-src 'none'; frame-ancestors 'none'`) on API responses — dev emits neither
- Scheduled job: DEADLINE_APPROACHING check runs daily at 09:00 UTC in-process; missed runs while stopped are not back-filled

## Explicit non-goals of current architecture
- Multi-instance/horizontal scaling (would require Redis adapter + shared presence + moving off SQLite)
- Distributed job queue for the scheduler
- Email/push delivery channels
