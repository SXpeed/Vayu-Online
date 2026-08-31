/**
 * Vayu — the payments boundary.
 *
 * Every Razorpay operation goes through this module, and this is the only
 * payments module the API imports. Where the work actually happens depends
 * on a single binding:
 *
 *   env.PAYMENTS present  → the isolated payments Worker, over a service
 *                           binding. The Razorpay key secret and the webhook
 *                           secret are bound to THAT Worker alone, so the API
 *                           Worker's environment never holds either one.
 *   env.PAYMENTS absent   → razorpay.js in this isolate. That is the monolith,
 *                           and `wrangler dev` on a single Worker.
 *
 * The same code therefore runs in both topologies, which is what lets the
 * split be introduced without a flag day: the monolith keeps working while
 * the separate Workers are stood up beside it.
 *
 * The boundary is drawn so the payments Worker NEVER touches D1. It verifies
 * signatures and talks to Razorpay; every database write stays on the
 * caller's side of the binding. That is why the isolated Worker needs no
 * database binding at all — the blast radius of the Worker holding the
 * payment credentials is exactly "can call Razorpay", and nothing more.
 *
 * A service binding is a direct Worker-to-Worker call inside Cloudflare: it
 * never leaves the edge, costs no public route, and cannot be reached from
 * the internet. The URL below is a required formality, not a destination —
 * only its path is read.
 */

import { ok, badRequest, unauthorized } from '#shared/utils/http.js';
import { now } from '#shared/database/store.js';
import * as razorpay from '#services/payments/razorpay.js';

/** Whether calls should go over the service binding. */
const isolated = (env) => !!env?.PAYMENTS;

/**
 * Call the payments Worker. The hostname is discarded by the binding; only
 * the path and the body matter.
 *
 * A non-2xx is surfaced as a thrown Error rather than a silent null, because
 * every caller here is in a checkout path where failing quietly would take
 * money without recording it, or record it without taking it.
 */
async function call(env, path, payload) {
  const res = await env.PAYMENTS.fetch(
    new Request(`https://payments.internal${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    }),
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`payments worker ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

/** Is Razorpay configured at all? */
export async function paymentsEnabled(env, settings) {
  if (!isolated(env)) return razorpay.enabled(env, settings);
  const { enabled } = await call(env, '/enabled', {});
  return !!enabled;
}

/** Create a Razorpay order and return its record. */
export async function createPaymentOrder(env, settings, spec) {
  if (!isolated(env)) return razorpay.createOrder(env, settings, spec);
  return call(env, '/order', { spec });
}

/** Verify the signature Razorpay returns to the browser after payment. */
export async function verifyPaymentSignature(env, settings, proof) {
  if (!isolated(env)) return razorpay.verifyPayment(env, settings, proof);
  const { valid } = await call(env, '/verify', { proof });
  return !!valid;
}

/** Refund a captured payment. */
export async function refundPayment(env, settings, spec) {
  if (!isolated(env)) return razorpay.refund(env, settings, spec);
  return call(env, '/refund', { spec });
}

/** Read a payment's current state from Razorpay. */
export async function paymentStatusFor(env, settings, paymentId) {
  if (!isolated(env)) return razorpay.paymentStatus(env, settings, paymentId);
  return call(env, '/status', { paymentId });
}

/**
 * Handle an inbound Razorpay webhook.
 *
 * Signature verification needs the webhook secret and so belongs on the
 * isolated Worker; marking the order paid needs D1 and so belongs here. The
 * two are separated rather than forwarded wholesale, which is why the
 * payments Worker can stay free of a database binding.
 *
 * Note the webhook secret is deliberately not the key secret: Razorpay
 * allows several webhooks each with their own, and verifying with the key
 * secret would accept anything signed with it — including API responses an
 * attacker could replay.
 */
export async function paymentsWebhook({ env, request, store }) {
  // Delegate wholesale in the monolith: razorpay.js already does both halves
  // there, and re-implementing the DB effect here would be a second copy to
  // keep in step.
  if (!isolated(env)) return razorpay.webhook({ env, request, store });

  const body = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';

  let verdict;
  try {
    verdict = await call(env, '/webhook/verify', { body, signature });
  } catch {
    // A payments Worker that is down must not look like a bad signature:
    // Razorpay retries a 5xx and gives up on a 4xx.
    return badRequest('Payments service unavailable');
  }

  if (!verdict.ok) return unauthorized('Invalid signature');

  const event = verdict.event;
  if (event?.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    const orderNumber = payment?.notes?.order_number || payment?.description;
    if (orderNumber && store) {
      await store.run(
        'UPDATE orders SET paid_at = ?, payment_status = ? WHERE number = ?',
        now(), 'paid', orderNumber,
      ).catch(() => {});
    }
  }

  return ok();
}
