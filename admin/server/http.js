/**
 * Vayu admin — request/response plumbing shared by every route module.
 *
 * Nothing here knows about products, orders or sessions: it is the layer
 * that turns Node's raw req/res into the small vocabulary the route
 * modules speak (sendJson, readJson, sendCsv, resource).
 */

const fs = require('node:fs');
const path = require('node:path');

const UI_DIR = path.join(__dirname, '..', 'ui');

/* ---------- responses ---------- */

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

/**
 * Send rows as a downloadable CSV. The leading BOM is what makes Excel
 * read the ₹ sign and Indian names as UTF-8 instead of mojibake.
 */
function sendCsv(res, filename, rows) {
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.end('﻿' + csv);
}

const escHtml = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/* ---------- requests ---------- */

function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  return JSON.parse(raw.toString('utf8'));
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/* ---------- admin UI static files ---------- */

const UI_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serveUiFile(res, file, status = 200) {
  const full = path.join(UI_DIR, file);
  if (!full.startsWith(UI_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(status, {
    'Content-Type': UI_MIME[path.extname(full)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(fs.readFileSync(full));
}

/* ---------- REST resource dispatch ---------- */

/**
 * Dispatch one REST-ish resource, so each route module describes *what* it
 * does rather than repeating the same find/404/405 ladder eight times.
 *
 *   GET    /<section>            → list
 *   POST   /<section>            → create
 *   POST   /<section>/<verb>     → collectionActions[verb]   (e.g. products/bulk)
 *   GET    /<section>/<id>       → read
 *   PUT    /<section>/<id>       → update
 *   DELETE /<section>/<id>       → remove
 *   POST   /<section>/<id>/<verb> → actions[verb]            (e.g. .../duplicate)
 *
 * `find` resolves the id; when it returns nothing the request 404s before
 * any hook runs, so item hooks always receive a real record. Hooks are
 * called as (ctx) for collection routes and (ctx, item) for item routes;
 * any hook left undefined means "405 Method Not Allowed".
 */
function resource(ctx, spec) {
  const { res, method, parts } = ctx;
  const [id, verb] = parts;

  if (!id) {
    const fn = method === 'GET' ? spec.list : (method === 'POST' ? spec.create : null);
    return fn ? fn(ctx) : sendJson(res, 405, { error: 'Method not allowed' });
  }

  const collectionAction = spec.collectionActions?.[id];
  if (collectionAction) return collectionAction(ctx);

  const item = spec.find(id);
  if (!item) return sendJson(res, 404, { error: spec.notFound || 'Not found' });

  if (verb) {
    const fn = spec.actions?.[verb];
    return fn ? fn(ctx, item) : sendJson(res, 404, { error: 'Not found' });
  }

  const fn = method === 'GET' ? spec.read
    : method === 'PUT' ? spec.update
      : method === 'DELETE' ? spec.remove : null;
  return fn ? fn(ctx, item) : sendJson(res, 405, { error: 'Method not allowed' });
}

module.exports = {
  sendJson, sendHtml, sendCsv, csvEscape, escHtml,
  readBody, readJson, parseCookies,
  serveUiFile, resource,
};
