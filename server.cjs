/**
 * Vayu — dev/production server entry point.
 *
 * Two handlers, tried in order:
 *
 *   admin/server/api.js   /api/* and /admin* — the store API and panel;
 *                         returns false for anything that is not its own
 *   server/static.js      the public site's files
 *
 * This file only wires those together, keeps the process alive when
 * something throws, and prints the addresses the site can be reached on.
 */

const http = require('node:http');
const os = require('node:os');

const adminApi = require('./admin/server/api.js');
const staticSite = require('./server/static.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/* ---------- request handling ---------- */

/** Last-resort reply when a handler throws before answering. */
function sendServerError(req, res) {
  if (res.headersSent || res.destroyed) {
    res.destroy();
    return;
  }
  if (req.url.startsWith('/api/')) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{"error":"Server error"}');
  } else {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Server Error');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (await adminApi.handle(req, res)) return;
    await staticSite.serve(req, res);
  } catch (err) {
    console.error(`Request failed: ${req.method} ${req.url} — ${err.message}`);
    sendServerError(req, res);
  }
});

/* ---------- process resilience ---------- */

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use.`);
  else console.error('Server error:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('Handled Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Handled Unhandled Rejection:', reason);
});

/* ---------- startup ---------- */

/** The machine's LAN addresses, so a phone on the same wifi can be used. */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net?.family === 'IPv4' && !net.internal)
    .map((net) => net.address);
}

server.listen(PORT, HOST, () => {
  const line = '---------------------------------';
  console.log(`\n🚀 Server is running!`);
  console.log(line);
  console.log(`Local Access:   http://localhost:${PORT}`);
  for (const address of lanAddresses()) {
    console.log(`Network Access: http://${address}:${PORT}`);
  }
  console.log(`${line}\n`);
});
