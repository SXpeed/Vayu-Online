/**
 * Vayu — the admin API dispatcher.
 *
 * Hosts only the /api/admin/* surface, behind the admin session gate and
 * the role gate. Runs on the api.vayuindia.com Worker but its routes are a
 * separate table from public.js, and the gate only accepts an admin
 * session cookie — a customer cookie or no cookie gets a 401.
 *
 * The admin panel at admin.vayuindia.com calls this cross-origin with
 * `credentials: 'include'`; CORS is applied by the Worker entry point, not
 * here, so this module is pure dispatch.
 */

import { json, notFound, unauthorized, readJson } from '#shared/utils/http.js';
import { purgeCatalogueCache } from '#shared/utils/cache.js';
import { currentAdmin, roleError } from '#services/auth/sessions.js';
import { ADMIN_ROUTES } from '#cloudflare/routes/tables.js';
import { validate } from '#shared/schemas/index.js';

const HAS_BODY = new Set(['POST', 'PUT', 'PATCH']);

export async function dispatch(event) {
  const { request, platform, url } = event;
  const env = platform?.env;
  if (!env?.DB) return json(503, { error: 'Bindings unavailable' });

  const method = request.method;
  const store = platform.store;
  const path = url.pathname;

  let body = {};
  if (HAS_BODY.has(method)) {
    try { body = await readJson(request); }
    catch { return json(400, { error: 'Malformed JSON body' }); }
  }

  const checked = validate(method, path, body);
  if (!checked.ok) return json(400, { error: checked.error, issues: checked.issues });
  body = checked.value;

  // No public routes on this Worker — even admin/login lives on the public
  // Worker so the panel can sign in without a cross-origin cookie yet.
  const admin = await currentAdmin(store, request);
  if (!admin) return unauthorized();

  const [section, ...parts] = path.slice('/api/admin/'.length).split('/').filter(Boolean);
  const route = ADMIN_ROUTES[section];
  if (!route) return notFound();

  const denied = roleError(admin, route.role);
  if (denied) return json(denied.status, { error: denied.error });

  const ctx = {
    request, env, ctx: platform.ctx, store, body, method,
    query: url.searchParams, url, parts, admin,
  };
  const response = await route.handler(ctx);

  // An admin write can change what /api/nav and /api/catalogue answer, so
  // the edge copy is purged on the colo the edit came from.
  if (method !== 'GET' && response.ok) purgeCatalogueCache(platform.ctx, url);

  return response;
}

export async function GET(event) { return dispatch(event); }
export async function POST(event) { return dispatch(event); }
export async function PUT(event) { return dispatch(event); }
export async function PATCH(event) { return dispatch(event); }
export async function DELETE(event) { return dispatch(event); }
