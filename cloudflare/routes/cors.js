/**
 * Vayu — CORS gate for the API app.
 *
 * The API lives on api.vayuindia.com and is called cross-origin by the
 * storefront (vayuindia.com) and the admin panel (admin.vayuindia.com).
 * Credentialed cross-origin requests need:
 *   - Access-Control-Allow-Origin set to the *specific* caller (never *)
 *   - Access-Control-Allow-Credentials: true
 *   - Vary: Origin, so the CDN does not cache one origin's answer for another
 *
 * Only the two configured origins are allowed. In dev (no PUBLIC_ORIGIN)
 * localhost on the wrangler ports is allowed.
 */

import { corsHeaders, corsAllowedOrigins } from '#shared/config/index.js';

/** Methods the API accepts. */
const METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

/** Headers a caller may send. Content-Type covers every route here. */
const HEADERS = 'Content-Type';

/**
 * Handle a pre-flight OPTIONS request. Returns 204 with CORS headers when
 * the origin is allowed, 403 otherwise. The body is empty.
 */
export function preflight(env, request) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(env, origin);
  if (!headers['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      'Access-Control-Allow-Methods': METHODS,
      'Access-Control-Allow-Headers': HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Stamp the CORS headers on a response, for the actual (non-preflight)
 * request. Clones the response so the body stream stays intact.
 */
export function withCors(env, request, response) {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(env, origin);
  if (!headers['Access-Control-Allow-Origin']) return response;
  const out = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

/** Whether a request is a CORS pre-flight (OPTIONS + Origin + Access-Control-Request-Method). */
export const isPreflight = (request) =>
  request.method === 'OPTIONS' &&
  request.headers.get('Origin') &&
  request.headers.get('Access-Control-Request-Method');

/** Re-export for tests. */
export { corsAllowedOrigins };
