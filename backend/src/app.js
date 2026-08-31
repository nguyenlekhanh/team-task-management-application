const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const apiRoutes = require('./routes');

const app = express();

// Reverse-proxy posture (9.3): TLS terminates at the proxy (documented
// architecture — the app itself stays plain HTTP). By default trust proxy is
// OFF so clients cannot spoof their IP via X-Forwarded-* (the rate limiters
// key on req.ip). Deployments behind a trusted proxy set TRUST_PROXY to make
// Express honor forwarding headers ONLY from that many trusted hops:
//   TRUST_PROXY=1        (one proxy hop, e.g. nginx on the same host)
//   TRUST_PROXY=loopback (proxies on 127.0.0.1/::1)
//   TRUST_PROXY=<cidr>   (Express 5 trust-proxy grammar)
if (process.env.TRUST_PROXY) {
  const raw = process.env.TRUST_PROXY.trim();
  const asNumber = Number.parseInt(raw, 10);
  app.set('trust proxy', Number.isFinite(asNumber) && String(asNumber) === raw ? asNumber : raw);
}

// CORS allowlist (5E.3): browser origins restricted to CLIENT_ORIGIN
// (comma-separated). Requests without an Origin (tests/curl/server-to-server)
// pass through; disallowed browser origins get no ACAO header and are blocked
// by the browser. Socket.IO uses the same allowlist (src/socket/index.js).
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

// Security headers (5E.3 base + 9.3 production additions).
// Development: only the three 5E.3 headers (HSTS on plain HTTP would be wrong
// and could lock browsers to a non-TLS local origin; CSP would fight the Vite
// dev server's HMR machinery — the dev posture is documented instead).
// Production (NODE_ENV=production, i.e. TLS is terminated in front):
//   - HSTS, conservative: 1 year, NO preload, NO includeSubDomains (the project
//     has no requirement justifying either; they can brick sibling subdomains).
//     The reverse proxy must use the SAME max-age (docs/DEPLOYMENT.md) so the
//     headers never contradict each other.
//   - A strict CSP for API responses: this app serves JSON only — it loads
//     nothing, embeds nothing, frames nothing. default-src 'none' is exact.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api', apiRoutes);

// Global error handler (5E.2): any uncaught controller/route error returns a
// safe JSON envelope. Client errors (e.g. malformed JSON from body-parser)
// map to 400; everything else becomes a generic 500. Never exposes stack
// traces, SQL, or internals to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR] unhandled:', err.message);
  if (res.headersSent) {
    return next(err);
  }
  const isClientParseError =
    err.type === 'entity.parse.failed' ||
    (err instanceof SyntaxError && err.status === 400 && 'body' in err);
  if (isClientParseError) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

module.exports = app;