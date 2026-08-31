/**
 * Vayu — shared configuration.
 *
 * Environment-aware config: the three origins, the CORS allow-list, and the
 * cookie attributes. Everything here is read from env vars (set as Workers
 * secrets or vars) with safe dev fallbacks, so no origin is hard-coded into
 * a service module.
 */

/**
 * The three origins the architecture is split across. Each is set as a
 * Workers env var on the app that needs it; unset in dev, where calls fall
 * back to same-origin relative paths.
 *
 *   PUBLIC_ORIGIN   https://vayuindia.com        (storefront)
 *   ADMIN_ORIGIN    https://admin.vayuindia.com  (admin panel)
 *   API_ORIGIN      https://api.vayuindia.com     (public + admin API)
 */
export const origins = {
  storefront: (env) => env.PUBLIC_ORIGIN || '',
  admin: (env) => env.ADMIN_ORIGIN || '',
  api: (env) => env.API_ORIGIN || '',
};

/**
 * The header the admin Worker stamps on a request it forwards to the API
 * over the service binding, proving the call came from inside Cloudflare
 * rather than off the internet.
 *
 * It lives here, and not as an export of either Worker's entry module,
 * because workerd treats every named export of an entrypoint as an
 * entrypoint itself — exporting a plain string there fails the Worker at
 * startup with "not of type 'function or ExportedHandler'".
 */
export const INTERNAL_HEADER = 'x-vayu-internal';

/**
 * Does this request carry the internal secret?
 *
 * Compared in constant time, and hashed first so that comparing in constant
 * time is possible at all: the two strings are of unrelated lengths, and any
 * comparison that stops early — including one that checks the lengths first —
 * tells the caller something. SHA-256 makes both operands exactly 32 bytes
 * whatever was presented, so the loop below always runs the same number of
 * iterations and reads the same amount of memory.
 *
 * The plain `!==` this replaces compared byte by byte and returned on the
 * first difference. That is a real, if narrow, oracle: an attacker who can
 * time the answer learns the secret one character at a time rather than
 * having to guess all of it at once.
 *
 * The XOR-accumulate is written out rather than calling workerd's own
 * `crypto.subtle.timingSafeEqual`, which exists but is a Cloudflare
 * extension to Web Crypto and is absent from Node. Depending on it would
 * make this function unrunnable — and therefore untestable — anywhere but
 * inside a deployed Worker, which is the wrong trade for eight lines. Over
 * two fixed-length digests this is constant-time by construction.
 *
 * It lives next to INTERNAL_HEADER because the header and the way it is
 * checked are one decision; splitting them is how one of the two Workers
 * ends up checking it differently from the other.
 */
export async function internalCallVerified(env, request) {
  const secret = env?.INTERNAL_SECRET;
  const presented = request.headers.get(INTERNAL_HEADER);
  // An unset secret must never match, or a Worker deployed without one would
  // accept every caller rather than none.
  if (!secret || !presented) return false;

  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(secret)),
    crypto.subtle.digest('SHA-256', encoder.encode(presented)),
  ]);

  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * The origins allowed to make credentialed cross-origin requests to the API.
 *
 * In production these are the storefront and admin subdomains. In dev,
 * localhost on the wrangler ports is allowed so the split can be tested
 * locally. An empty PUBLIC_ORIGIN means dev: the caller's own origin is
 * trusted.
 */
export function corsAllowedOrigins(env) {
  const prod = [env.PUBLIC_ORIGIN, env.ADMIN_ORIGIN].filter(Boolean);
  if (prod.length) return prod;
  return [
    'http://localhost:8787',
    'http://127.0.0.1:8787',
    'http://localhost:8788',
    'http://127.0.0.1:8788',
  ];
}

/**
 * CORS pre-flight headers for an allowed origin. Returns an empty object
 * (no CORS headers) when the origin is not in the allow-list, so a random
 * site cannot read the API.
 */
export function corsHeaders(env, origin) {
  const allowed = corsAllowedOrigins(env);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

/**
 * Cookie attributes for a host-only, HttpOnly, Secure cookie.
 *
 * Host-only (no Domain=) by design: the session is scoped to the exact
 * origin that set it, so a cookie issued by api.vayuindia.com is not sent
 * to admin.vayuindia.com and vice versa. This is the isolation boundary.
 *
 * Secure is conditional on the request protocol, because dev on a LAN
 * address is plain http and a browser silently drops a Secure cookie there.
 */
export function cookieAttributes(maxAgeSeconds, secure) {
  return `HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

/** Whether the request URL is https — fails closed (true) on parse error. */
export const isSecureOrigin = (url) => {
  try { return new URL(url).protocol === 'https:'; }
  catch { return true; }
};
