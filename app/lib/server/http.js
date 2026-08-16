/**
 * Vayu — request/response plumbing for the Workers runtime.
 *
 * The port of admin/server/http.js. The vocabulary the route modules speak
 * is deliberately unchanged in spirit — json(), readJson(), csv(),
 * resource() — but a handler now *returns* a Response instead of writing
 * to a socket, which is the one change that ripples through every route.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });

export const ok = (body = { ok: true }) => json(200, body);

export const badRequest = (error) => json(400, { error });
export const unauthorized = (error = 'Not signed in') => json(401, { error });
export const forbidden = (error) => json(403, { error });
export const notFound = (error = 'Not found') => json(404, { error });
export const methodNotAllowed = () => json(405, { error: 'Method not allowed' });

export const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export const text = (body, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export const redirect = (location) => new Response(null, { status: 302, headers: { Location: location } });

/* ---------- requests ---------- */

/** Parse a JSON body, tolerating an empty one. Throws on malformed JSON. */
export async function readJson(request) {
  const raw = await request.text();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function parseCookies(request) {
  const out = {};
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** The client IP, for the sign-in throttles. */
export const clientIp = (request) =>
  request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '?';

/* ---------- CSV ---------- */

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

/**
 * Rows as a downloadable CSV. The leading BOM is what makes Excel read the
 * ₹ sign and Indian names as UTF-8 instead of mojibake.
 */
export function csv(filename, rows) {
  const body = '﻿' + rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export const escHtml = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/* ---------- REST resource dispatch ---------- */

/**
 * Dispatch one REST-ish resource, so each route module describes *what* it
 * does rather than repeating the same find/404/405 ladder eight times.
 *
 *   GET    /<section>             → list
 *   POST   /<section>             → create
 *   POST   /<section>/<verb>      → collectionActions[verb]   (e.g. products/bulk)
 *   GET    /<section>/<id>        → read
 *   PUT    /<section>/<id>        → update
 *   DELETE /<section>/<id>        → remove
 *   POST   /<section>/<id>/<verb> → actions[verb]             (e.g. .../duplicate)
 *
 * `find` resolves the id — now async, since it is a query — and when it
 * returns nothing the request 404s before any hook runs, so item hooks
 * always receive a real record. Hooks are called as (ctx) for collection
 * routes and (ctx, item) for item routes; any hook left undefined means
 * "405 Method Not Allowed". Every hook returns a Response.
 */
export async function resource(ctx, spec) {
  const { method, parts } = ctx;
  const [id, verb] = parts;

  if (!id) {
    const fn = method === 'GET' ? spec.list : (method === 'POST' ? spec.create : null);
    return fn ? fn(ctx) : methodNotAllowed();
  }

  const collectionAction = spec.collectionActions?.[id];
  if (collectionAction) return collectionAction(ctx);

  const item = await spec.find(id);
  if (!item) return notFound(spec.notFound || 'Not found');

  if (verb) {
    const fn = spec.actions?.[verb];
    return fn ? fn(ctx, item) : notFound();
  }

  const fn = method === 'GET' ? spec.read
    : method === 'PUT' ? spec.update
      : method === 'DELETE' ? spec.remove : null;
  return fn ? fn(ctx, item) : methodNotAllowed();
}
