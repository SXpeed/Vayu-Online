/**
 * Vayu — sign in with Google.
 *
 * The standard OAuth 2.0 authorization-code flow, server side:
 *
 *   1. /api/account/google        → redirect the browser to Google
 *   2. Google asks the shopper to approve, redirects back with a code
 *   3. /api/account/google/callback → swap the code for tokens, read the
 *      profile out of the id_token, sign the shopper in
 *
 * What Google gives us for the `openid email profile` scopes is the whole
 * of what is publicly available on the account: a stable subject id, the
 * email and whether it is verified, the display name and its two halves,
 * the avatar URL and the locale. It does **not** include a phone number or
 * a postal address — Google has no such thing to give. Checkout therefore
 * still asks for those, which is exactly what the "we just need these"
 * step already exists for.
 *
 * The client secret is a Worker secret, never in the bundle:
 *   npx wrangler secret put GOOGLE_CLIENT_SECRET
 */

import { now } from './db.js';
import { json, redirect, parseCookies, badRequest } from './http.js';
import { customerSession, customerCookie } from './sessions.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPES = 'openid email profile';

const STATE_COOKIE = 'vayu_oauth_state';
const STATE_TTL = 600; // ten minutes is plenty to approve a consent screen

/** Configured, and therefore offerable. The UI hides the button when not. */
export const googleEnabled = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** Both ends of the flow must send Google the identical redirect_uri. */
const redirectUri = (url) => `${url.origin}/api/account/google/callback`;

/**
 * Where to send the shopper afterwards. Only same-site paths are allowed:
 * an attacker must not be able to turn our sign-in into an open redirect.
 */
function safeNext(raw) {
  const next = String(raw || '');
  if (!next.startsWith('/') || next.startsWith('//')) return '/pages/user-profile.html';
  return next.slice(0, 200);
}

/* ---------- step 1: off to Google ---------- */

export function start({ env, url }) {
  if (!googleEnabled(env)) return badRequest('Google sign-in is not configured');

  const state = crypto.randomUUID();
  const next = safeNext(url.searchParams.get('next'));

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(url),
    response_type: 'code',
    scope: SCOPES,
    state,
    // Ask for the account chooser every time: shared machines are common,
    // and silently reusing whichever Google session is open is a bad
    // surprise when it is the wrong one.
    prompt: 'select_account',
  });

  // GOOGLE_AUTH_ENDPOINT, like GOOGLE_TOKEN_ENDPOINT, exists so the flow
  // can be driven against a stub in tests. Unset in production.
  const response = redirect(`${env.GOOGLE_AUTH_ENDPOINT || AUTH_ENDPOINT}?${params}`);
  // The state travels in a cookie and comes back in the URL; the callback
  // refuses unless the two agree, which is what stops a forged callback.
  // SameSite=Lax still sends it on Google's top-level redirect back to us.
  response.headers.append('Set-Cookie',
    `${STATE_COOKIE}=${state}.${encodeURIComponent(next)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${STATE_TTL}`);
  return response;
}

/* ---------- step 2: back from Google ---------- */

const clearState = `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

/**
 * The payload of a JWT, without signature checking.
 *
 * Safe here, and only here: this token was not handed to us by the
 * browser, it came back over TLS from Google's own token endpoint in
 * response to an authenticated request. Google's documentation says
 * verification may be skipped in exactly this case. Never decode a token
 * this way if it arrived from a client.
 */
function readIdToken(idToken) {
  const payload = String(idToken || '').split('.')[1];
  if (!payload) return null;
  const json = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(json, c => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

async function exchangeCode(env, url, code) {
  // GOOGLE_TOKEN_ENDPOINT is an override for local testing against a stub,
  // never set in production — the default is Google's own endpoint.
  const res = await fetch(env.GOOGLE_TOKEN_ENDPOINT || TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(url),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error_description || data.error || 'Google rejected the sign-in' };
  return { idToken: data.id_token };
}

/**
 * Find or make the customer behind a Google profile.
 *
 * Three cases, in order: we have seen this Google id before; we have the
 * email already (as a guest order or a password account) and link the two;
 * or this is somebody new.
 */
async function resolveCustomer(store, profile) {
  const stamp = now();
  const email = String(profile.email || '').toLowerCase().trim();

  const shared = {
    picture: profile.picture || null,
    given_name: profile.given_name || null,
    family_name: profile.family_name || null,
    locale: profile.locale || null,
    email_verified: profile.email_verified ? 1 : 0,
    last_seen: stamp,
  };

  const bySub = await store.one('SELECT * FROM customers WHERE google_sub = ?', profile.sub);
  if (bySub) {
    // Google is the authority on their own email; keep ours in step.
    await store.update('customers', 'id', bySub.id, { ...shared, email: email || bySub.email });
    return store.one('SELECT * FROM customers WHERE id = ?', bySub.id);
  }

  const byEmail = email ? await store.one('SELECT * FROM customers WHERE email = ?', email) : null;
  if (byEmail) {
    await store.update('customers', 'id', byEmail.id, {
      ...shared,
      google_sub: profile.sub,
      name: byEmail.name || profile.name || '',
    });
    await store.logActivity('system', 'account.link',
      `${email} linked a Google account to an existing customer`);
    return store.one('SELECT * FROM customers WHERE id = ?', byEmail.id);
  }

  const id = await store.nextId('cust');
  await store.run(
    `INSERT INTO customers
      (id, email, name, phone, address, city, pin, orders_count, total_spent,
       first_seen, last_seen, source, notes, google_sub, picture, given_name,
       family_name, locale, email_verified, account_created_at)
     VALUES (?, ?, ?, '', '', '', '', 0, 0, ?, ?, 'google', '', ?, ?, ?, ?, ?, ?, ?)`,
    id, email, profile.name || '', stamp, stamp, profile.sub,
    shared.picture, shared.given_name, shared.family_name, shared.locale,
    shared.email_verified, stamp,
  );
  await store.logActivity('system', 'account.register', `${email} signed up with Google`);
  return store.one('SELECT * FROM customers WHERE id = ?', id);
}

export async function callback(ctx) {
  const { env, url, store, request } = ctx;
  if (!googleEnabled(env)) return badRequest('Google sign-in is not configured');

  // A shopper who presses "Cancel" on Google's consent screen comes back
  // here with an error; that is a normal outcome, not a failure to report.
  if (url.searchParams.get('error')) {
    return redirect('/pages/user-profile.html?signin=cancelled');
  }

  // The cookie is "<state>.<next>". Split on the FIRST dot only: the state
  // is a UUID and has none, but the path after it very much does
  // ("/pages/user-profile.html"), and a plain split() would drop the
  // extension and land the shopper on a 404.
  const cookie = parseCookies(request)[STATE_COOKIE] || '';
  const dot = cookie.indexOf('.');
  const expectedState = dot === -1 ? cookie : cookie.slice(0, dot);
  const encodedNext = dot === -1 ? '' : cookie.slice(dot + 1);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  if (!code || !state || !expectedState || state !== expectedState) {
    const response = redirect('/pages/user-profile.html?signin=failed');
    response.headers.append('Set-Cookie', clearState);
    return response;
  }

  const exchanged = await exchangeCode(env, url, code);
  if (exchanged.error) {
    console.error('[google]', exchanged.error);
    const response = redirect('/pages/user-profile.html?signin=failed');
    response.headers.append('Set-Cookie', clearState);
    return response;
  }

  const profile = readIdToken(exchanged.idToken);
  if (!profile?.sub || !profile.email) {
    const response = redirect('/pages/user-profile.html?signin=failed');
    response.headers.append('Set-Cookie', clearState);
    return response;
  }

  const customer = await resolveCustomer(store, profile);
  const { token, maxAge } = await customerSession(store, customer.id);

  const response = redirect(safeNext(decodeURIComponent(encodedNext || '')));
  response.headers.append('Set-Cookie', customerCookie(token, maxAge));
  response.headers.append('Set-Cookie', clearState);
  return response;
}

/** Reported by /api/account/me so the UI only offers what is configured. */
export const status = (env) => json(200, { google: googleEnabled(env) });
