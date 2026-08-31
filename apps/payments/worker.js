/**
 * Vayu payments — the isolated Razorpay Worker.
 *
 * This Worker has NO public route and NO database binding. It is reachable
 * only over a service binding from the API Worker (see services/payments/
 * index.js), which means nothing on the internet can address it directly.
 *
 * It exists so that exactly one Worker in the fleet holds RAZORPAY_KEY_SECRET
 * and RAZORPAY_WEBHOOK_SECRET. A bug anywhere in the catalogue, the account
 * tree or the admin panel cannot read a payment credential, because those
 * credentials are not in that Worker's environment at all.
 *
 * The contract is deliberately narrow: verify signatures, and talk to
 * Razorpay. It never writes to D1 — the caller does that with the verdict it
 * gets back. That is what keeps this Worker free of a database binding, and
 * it is the whole reason the isolation is worth anything: the Worker holding
 * the payment keys cannot reach customer or order data.
 *
 * Every endpoint is POST with a JSON body, and each is the mirror of one
 * function in services/payments/index.js.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import * as razorpay from '#services/payments/razorpay.js';

/** JSON response helper — this Worker has no shared http.js dependency. */
const reply = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Settings are the legacy fallback path, where the Razorpay keys lived in a
 * database row. This Worker has no database, so it passes an empty object
 * and the keys can only come from its own environment. That is intentional:
 * the isolated Worker should be configured by secrets, not by a table that
 * some other Worker can write.
 */
const SETTINGS = {};

/**
 * Constant-time compare of two hex digests. A length mismatch means the
 * candidate was malformed, which cannot be valid — return early rather than
 * letting Buffer.from throw on odd input.
 */
function hexEqual(expected, candidate) {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(candidate || ''), 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

const ROUTES = {
  /** Is Razorpay configured on this Worker? */
  '/enabled': async (env) => reply(200, { enabled: razorpay.enabled(env, SETTINGS) }),

  '/order': async (env, { spec }) =>
    reply(200, await razorpay.createOrder(env, SETTINGS, spec || {})),

  '/verify': async (env, { proof }) =>
    reply(200, { valid: razorpay.verifyPayment(env, SETTINGS, proof || {}) }),

  '/refund': async (env, { spec }) =>
    reply(200, await razorpay.refund(env, SETTINGS, spec || {})),

  '/status': async (env, { paymentId }) =>
    reply(200, await razorpay.paymentStatus(env, SETTINGS, paymentId)),

  /**
   * Verify a webhook signature and hand back the parsed event.
   *
   * The caller passes the RAW body text, because the signature is computed
   * over the exact bytes Razorpay sent — re-serialising parsed JSON would
   * change the digest and reject every genuine webhook.
   */
  '/webhook/verify': async (env, { body, signature }) => {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return reply(200, { ok: false, reason: 'not-configured' });

    const expected = createHmac('sha256', secret).update(String(body ?? '')).digest('hex');
    if (!hexEqual(expected, signature)) return reply(200, { ok: false, reason: 'bad-signature' });

    let event;
    try { event = JSON.parse(body); }
    catch { return reply(200, { ok: false, reason: 'malformed' }); }

    return reply(200, { ok: true, event });
  },
};

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });

    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname];
    if (!route) return reply(404, { error: 'Not found' });

    let payload = {};
    try { payload = await request.json(); }
    catch { return reply(400, { error: 'Malformed JSON body' }); }

    try {
      return await route(env, payload);
    } catch (err) {
      // The message can carry Razorpay's own error text, which is useful in
      // logs and safe here: this Worker answers only its bound caller, never
      // a browser.
      return reply(502, { error: String(err?.message || err) });
    }
  },
};
