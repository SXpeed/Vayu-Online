/**
 * Vayu — the Cloudflare Access gate.
 *
 * Zero Trust in front of the admin panel. Access sits at the edge, decides
 * who may reach the origin at all, and stamps a signed JWT on every request
 * it lets through. This module is the second half of that: the Worker
 * verifying the stamp itself.
 *
 * WHY VERIFY IT HERE AT ALL, when Access already turned everyone else away:
 *
 *   Because Access is attached to a HOSTNAME, and a Worker has more than
 *   one. `workers_dev` gives every Worker in this project a
 *   <name>.<subdomain>.workers.dev URL that no Access policy covers, and a
 *   service binding reaches it with no hostname whatsoever. An Access
 *   application on admin.vayuindia.com therefore locks the front door and
 *   leaves the side door open. Checking the JWT inside the Worker closes
 *   it: no valid token, no panel, whichever address you arrived at.
 *
 *   It is also why the password login stays. Access answers "may this
 *   person reach the admin panel", the session answers "which admin are
 *   they, and what may they do" — two questions, two gates, and losing
 *   either one should not be enough on its own.
 *
 * CONFIGURATION. Two Workers vars, both public identifiers rather than
 * secrets, so they live in the wrangler config where a diff shows them:
 *
 *   ACCESS_TEAM_DOMAIN   vayu           (or vayu.cloudflareaccess.com,
 *                                        or the full https:// URL)
 *   ACCESS_AUD           the Application Audience tag — a 64-character hex
 *                        string on the Access application's Overview page.
 *
 * Set NEITHER and the gate is off, which is what a fresh checkout and
 * `wrangler dev` want: there is no Access in front of localhost. Set BOTH
 * and it is enforced. Set exactly one and every request fails closed with a
 * 503, because a half-configured Zero Trust gate that silently waves
 * everyone through is the worst of the three states and much the easiest to
 * ship by accident.
 *
 * The dashboard side cannot be done from this repository — see the Zero
 * Trust section of README-cloudflare.md for those steps.
 */

import { parseCookies } from '#shared/utils/http.js';

/** Access stamps the JWT here. The cookie is the fallback for a plain
 *  browser navigation, which cannot carry a custom header. */
export const ACCESS_HEADER = 'cf-access-jwt-assertion';
export const ACCESS_COOKIE = 'CF_Authorization';

/** Tolerance for clock drift between the edge and this isolate, in seconds. */
const CLOCK_SKEW = 60;

/** How long a fetched key set is trusted. Cloudflare rotates the signing
 *  keys every six weeks, so this bounds staleness rather than chasing it —
 *  an unknown `kid` forces a refetch below whatever the age. */
const JWKS_TTL_MS = 60 * 60 * 1000;

/* ---------- configuration ---------- */

/**
 * The team domain as a full https:// origin.
 *
 * Accepts all three forms anyone actually has to hand: the bare team name
 * off the Zero Trust dashboard, the hostname, or the whole URL. Returns ''
 * when unset.
 */
export function teamDomain(env) {
  const raw = String(env?.ACCESS_TEAM_DOMAIN || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (raw.startsWith('https://')) return raw;
  if (raw.startsWith('http://')) return `https://${raw.slice('http://'.length)}`;
  return `https://${raw.includes('.') ? raw : `${raw}.cloudflareaccess.com`}`;
}

/**
 * 'on' | 'off' | 'half'. See the header comment for why 'half' is a state
 * worth naming rather than rounding down to 'off'.
 */
export function accessState(env) {
  const domain = teamDomain(env);
  const aud = String(env?.ACCESS_AUD || '').trim();
  if (!domain && !aud) return 'off';
  if (!domain || !aud) return 'half';
  return 'on';
}

/* ---------- base64url ---------- */

function b64urlToBytes(part) {
  const b64 = part.replaceAll('-', '+').replaceAll('_', '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

const b64urlToJSON = (part) => JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));

/* ---------- the signing keys ---------- */

/**
 * One entry per team domain: the imported CryptoKeys by `kid`, when they
 * were fetched, and the in-flight fetch if one is running.
 *
 * Module scope, so it is per-isolate and stays warm for the life of it. Two
 * concurrent requests share the one fetch rather than racing to make two —
 * that is what `inflight` is for, and it earns its keep on a cold isolate,
 * where the requests for the panel's dozen files all arrive at once.
 */
const jwksCache = new Map();

async function fetchKeys(domain) {
  const res = await fetch(`${domain}/cdn-cgi/access/certs`, {
    // Belt and braces with the isolate cache above: this one also survives
    // the isolate being recycled between requests.
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`Access certs ${res.status}`);

  const body = await res.json();
  const keys = new Map();

  for (const jwk of body?.keys ?? []) {
    // Matched against the token's own `kid`. The docs are explicit that
    // this is the field to key on, and that `public_cert` can hand back a
    // stale cached value — so only `keys` is read.
    if (!jwk?.kid || jwk.kty !== 'RSA') continue;
    try {
      keys.set(jwk.kid, await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      ));
    } catch { /* a key we cannot import is a key we cannot trust */ }
  }

  if (!keys.size) throw new Error('Access certs carried no usable RSA keys');
  return keys;
}

/**
 * The signing key for one `kid`, refetching once when it is not in the
 * cached set. That refetch is what carries the gate across a key rotation
 * with no deploy: the first token signed by a new key misses, refetches,
 * and hits.
 */
async function signingKey(domain, kid) {
  let entry = jwksCache.get(domain);

  const stale = !entry || Date.now() - entry.fetchedAt > JWKS_TTL_MS;
  const unknownKid = Boolean(entry && !entry.keys.has(kid));

  if (stale || unknownKid) {
    if (!entry?.inflight) {
      const inflight = fetchKeys(domain)
        .then((keys) => {
          jwksCache.set(domain, { keys, fetchedAt: Date.now(), inflight: null });
          return keys;
        })
        .catch((err) => {
          // Clear the failed attempt so the next request retries, rather
          // than every later request awaiting one rejected promise for the
          // remaining life of the isolate.
          const current = jwksCache.get(domain);
          if (current) jwksCache.set(domain, { ...current, inflight: null });
          throw err;
        });

      jwksCache.set(domain, {
        keys: entry?.keys ?? new Map(),
        fetchedAt: entry?.fetchedAt ?? 0,
        inflight,
      });
      entry = jwksCache.get(domain);
    }

    // A failed fetch falls back to whatever is still cached; it fails closed
    // below anyway if that set does not hold the kid.
    try { await entry.inflight; } catch { /* fall through to the cached set */ }
    entry = jwksCache.get(domain);
  }

  return entry?.keys.get(kid) ?? null;
}

/* ---------- verification ---------- */

/**
 * Verify the Access token on a request.
 *
 * Returns { ok: true, identity } or { ok: false, reason }. The reason is for
 * the log line and never for the response body — telling an unauthenticated
 * caller *why* their token was rejected is free reconnaissance.
 *
 * Order matters. The signature is checked before a single claim is read, so
 * nothing in an unverified payload is ever acted on.
 */
export async function verifyAccess(env, request) {
  const domain = teamDomain(env);
  const audience = String(env?.ACCESS_AUD || '').trim();
  if (!domain || !audience) return { ok: false, reason: 'not-configured' };

  const token = request.headers.get(ACCESS_HEADER)
    || parseCookies(request)[ACCESS_COOKIE]
    || '';
  if (!token) return { ok: false, reason: 'no-token' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  let header;
  try { header = b64urlToJSON(parts[0]); }
  catch { return { ok: false, reason: 'malformed-header' }; }

  // Pinned, not taken from the token. Trusting whatever `alg` the token
  // names is how both "alg: none" and HMAC-signed-with-the-public-key work.
  if (header?.alg !== 'RS256' || !header?.kid) return { ok: false, reason: 'alg' };

  let key;
  try { key = await signingKey(domain, header.kid); }
  catch { return { ok: false, reason: 'certs-unavailable' }; }
  if (!key) return { ok: false, reason: 'unknown-kid' };

  let verified = false;
  try {
    verified = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch { return { ok: false, reason: 'malformed-signature' }; }
  if (!verified) return { ok: false, reason: 'bad-signature' };

  let claims;
  try { claims = b64urlToJSON(parts[1]); }
  catch { return { ok: false, reason: 'malformed-claims' }; }

  if (claims?.iss !== domain) return { ok: false, reason: 'issuer' };

  // `aud` is an array in an Access token, but the JWT spec allows a bare
  // string and a future version emitting one should not fail open.
  const aud = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
  if (!aud.includes(audience)) return { ok: false, reason: 'audience' };

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims?.exp !== 'number' || claims.exp + CLOCK_SKEW < now) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof claims?.nbf === 'number' && claims.nbf - CLOCK_SKEW > now) {
    return { ok: false, reason: 'not-yet-valid' };
  }

  return {
    ok: true,
    identity: {
      email: claims.email || '',
      sub: claims.sub || '',
      // A service token carries no email and identifies itself here instead.
      commonName: claims.common_name || '',
      expiresAt: claims.exp,
    },
  };
}

/* ---------- the gate ---------- */

/**
 * Plain text, and deliberately uninformative. Anyone who reaches this either
 * came in past Access — in which case Access would have challenged them — or
 * found an address Access does not cover, and in neither case is a redirect
 * to /admin/login the truth, because signing in there would not help.
 */
const deny = (status, message) => new Response(message, {
  status,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
});

/**
 * The gate every admin entry point calls first.
 *
 * Returns null when the request may proceed, or the Response to send back.
 * `onReject` receives the machine-readable reason, for the log; the caller
 * never sees it.
 */
export async function accessGate(env, request, onReject) {
  const state = accessState(env);
  if (state === 'off') return null;

  if (state === 'half') {
    onReject?.('misconfigured');
    return deny(503, 'Admin unavailable: Access is half-configured. '
      + 'Set both ACCESS_TEAM_DOMAIN and ACCESS_AUD, or neither.');
  }

  const result = await verifyAccess(env, request);
  if (result.ok) return null;

  onReject?.(result.reason);
  return deny(403, 'Forbidden.');
}
