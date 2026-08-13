/**
 * Vayu — static serving for the public site.
 *
 * Everything the browser asks for that is not /api/* or /admin* ends up
 * here: a URL is turned into a path inside the site root, checked, then
 * streamed with the right content type and caching policy. Nothing in
 * this module knows about the admin panel or the store.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

/**
 * The site root. No request may ever resolve outside of it.
 *
 * public/ since the Cloudflare move: the site's files live there and
 * nothing else does, which is what keeps server code and the data file
 * unreachable over HTTP by construction rather than by check.
 */
const ROOT = path.join(__dirname, '..', 'public');

const INDEX_FILE = '/index.html';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** Images and fonts: content changes under a new filename, so cache them. */
const ASSET_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.ico',
]);
const ASSET_MAX_AGE = 86400;

/**
 * Documents, partials and modules carry no version in their URL the way
 * styles.css does, so with no header at all the browser is free to apply
 * heuristic caching and serve an edited header, footer or script from its
 * own store indefinitely. no-cache still allows a cached copy — it just
 * has to be revalidated first, so an unchanged file costs a 304 and a
 * changed one is always picked up.
 */
const REVALIDATE_EXTENSIONS = new Set(['.html', '.js']);

/* ---------- helpers ---------- */

/** True while the socket can still take a response. */
const isLive = (res) => !res.destroyed && !res.writableEnded;

function sendStatus(res, status, message) {
  if (!isLive(res) || res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`${status} ${message}`);
}

/**
 * Resolve a URL path to a file inside ROOT, or null when it is malformed
 * or tries to escape. `path.join` collapses `..`, but on its own that is
 * not enough: joining `/../vayu-site-notes` still yields a path that a
 * bare `startsWith(ROOT)` accepts, so the separator has to be part of the
 * comparison.
 */
function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed percent-escape
  }
  if (decoded.includes('\0')) return null;

  const full = path.join(ROOT, decoded === '/' ? INDEX_FILE : decoded);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

function headersFor(filePath, size) {
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': size,
  };
  if (ASSET_EXTENSIONS.has(ext)) headers['Cache-Control'] = `public, max-age=${ASSET_MAX_AGE}`;
  else if (REVALIDATE_EXTENSIONS.has(ext)) headers['Cache-Control'] = 'no-cache';
  return headers;
}

/* ---------- entry ---------- */

async function serve(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (isLive(res)) {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
      res.end('405 Method Not Allowed');
    }
    return;
  }

  const urlPath = req.url.split('?')[0];

  // The admin panel and its data folder are served (or refused) by
  // admin/server/api.js alone; nothing under /admin is ever a static file.
  if (urlPath.startsWith('/admin')) return sendStatus(res, 404, 'Not Found');

  const filePath = resolvePath(urlPath);
  if (!filePath) return sendStatus(res, 400, 'Bad Request');

  let stats;
  try {
    stats = await fsp.stat(filePath);
  } catch {
    return sendStatus(res, 404, 'Not Found');
  }
  if (!stats.isFile()) return sendStatus(res, 404, 'Not Found');
  if (!isLive(res)) return;

  res.writeHead(200, headersFor(filePath, stats.size));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  try {
    await pipeline(fs.createReadStream(filePath), res);
  } catch (err) {
    // A visitor navigating away mid-download is normal, not an error.
    if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.code !== 'ECONNRESET') throw err;
  }
}

module.exports = { serve, ROOT };
