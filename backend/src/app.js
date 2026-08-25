const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const apiRoutes = require('./routes');

const app = express();

app.use(cors());
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