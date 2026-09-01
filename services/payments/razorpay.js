/**
 * Vayu — payments service (Razorpay).
 *
 * The ONLY place the Razorpay key secret is read or used. No other module
 * imports the secret or does HMAC verification. The checkout service calls
 * `createOrder` and `verifySignature` from here; the secret never leaves
 * this service and is never returned in any API response.
 *
 * Where the credentials live: Workers secrets, RAZORPAY_KEY_ID and
 * RAZORPAY_KEY_SECRET. Nowhere else.
 *
 * They used to be readable from `settings.payment` as well, written there by
 * the admin panel. That put a live payment secret in a D1 row in plaintext,
 * where a database dump, a backup file or anyone who could reach the panel
 * could read it — and the panel returned it to the browser to populate its
 * own form. The fallback is gone and the columns are cleared; a secret that
 * cannot be read out of the application is one fewer copy to leak.
 *
 * The key id is not itself secret — it is handed to the browser to open the
 * checkout — but it lives beside the secret so there is one place to set
 * Razorpay up and one place to look when it is not working.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { json, ok, badRequest, unauthorized } from '#shared/utils/http.js';
import { now } from '#shared/database/store.js';

/** The Razorpay REST base. */
const API_BASE = 'https://api.razorpay.com/v1';

/** Razorpay caps a receipt at 40 chars. */
const RECEIPT_MAX = 40;

/**
 * Resolve the key secret to use. The env secret wins; the settings row is
 * the fallback. Returns '' when neither is set (test/dev without Razorpay).
 */
function secretFor(env) {
  return env?.RAZORPAY_KEY_SECRET || '';
}

/**
 * The key id. Exported because checkout hands it to the browser to open
 * Razorpay's dialog, and used to read it straight off the settings row —
 * which is the last thing that would have broken when those columns were
 * cleared.
 */
export function keyIdFor(env) {
  return env?.RAZORPAY_KEY_ID || '';
}

/** Whether Razorpay is configured at all. */
export const enabled = (env, settings) => !!(keyIdFor(env) && secretFor(env));

/**
 * Whether an ONLINE payment should be attempted for this shop.
 *
 * Stricter than `enabled` on purpose, and the difference matters. `enabled`
 * asks only whether credentials exist; this also honours the shop's chosen
 * provider. Without the provider check a shop switched to cash-on-delivery
 * would still be sent to Razorpay purely because old keys were left in its
 * settings row — which is what the pre-refactor code guarded against with
 * `payment.provider === 'razorpay'`, and what the checkout path needs.
 */
export const isRazorpayEnabled = (env, settings) =>
  (settings?.payment?.provider === 'razorpay') && enabled(env, settings);

/**
 * Verify a completed payment. The signature check itself is `verifySignature`;
 * this is the form callers should use, because it resolves the secret INSIDE
 * this module.
 *
 * Before the refactor the checkout route read
 * `settings.payment.razorpayKeySecret` and passed it in as an argument, which
 * put the live gateway secret into the scope of a module that has no business
 * holding it. Keeping resolution here is the whole point of the payments
 * service boundary.
 */
export function verifyPayment(env, settings, { orderId, paymentId, signature }) {
  return verifySignature(secretFor(env), orderId, paymentId, signature);
}

/* ---------- orders awaiting confirmation ---------- */

/**
 * Razorpay orders that have been created but not yet confirmed.
 *
 * The pre-Workers server kept these in a module-level Map, which cannot work
 * across isolates: the browser may confirm against a different instance than
 * it started on. They live in D1 instead, as a short-lived row in `carts`
 * keyed by the gateway's order id.
 *
 * Two clocks, deliberately different:
 *
 *   PENDING_TTL_MS   how long the row can still buy something. A payment
 *                    confirmed later than this is refused, so the window a
 *                    signature is good for does not widen.
 *   PENDING_KEEP_MS  how long the row is kept at all. A shopper who opened
 *                    the payment window and walked away is the most
 *                    recoverable abandoned cart there is — their name, email
 *                    and phone are right there in the row — and sweeping
 *                    that an hour later meant nobody ever saw it. The
 *                    Abandoned carts card reads these; see insights.js.
 */
const PENDING_TTL_MS = 60 * 60 * 1000;
const PENDING_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Stash a prepared order against its Razorpay order id. */
export async function putPending(store, rzpOrderId, prep) {
  await store.batch([
    store.stmt('DELETE FROM carts WHERE sid LIKE ? AND updated_at < ?',
      'pending:%', new Date(Date.now() - PENDING_KEEP_MS).toISOString()),
    store.stmt(
      `INSERT INTO carts (sid, items, total, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (sid) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at`,
      `pending:${rzpOrderId}`, JSON.stringify(prep), prep.total, now(),
    ),
  ]);
}

/**
 * Take it back, once. Deleted on read so a signature cannot be replayed.
 *
 * The age check is against PENDING_TTL_MS, not the longer retention: a row
 * kept for the abandoned-cart list is evidence, not a live payment.
 */
export async function takePending(store, rzpOrderId) {
  const row = await store.one('SELECT items, updated_at FROM carts WHERE sid = ?', `pending:${rzpOrderId}`);
  if (!row) return null;
  await store.run('DELETE FROM carts WHERE sid = ?', `pending:${rzpOrderId}`);
  if (Date.now() - new Date(row.updated_at).getTime() > PENDING_TTL_MS) return null;
  try { return JSON.parse(row.items); } catch { return null; }
}
/**
 * Create a Razorpay order for an amount in paise.
 *
 * Returns the Razorpay order JSON (id, amount, currency, …) or
 * { error } on failure. The caller stores the id against the pending order
 * so confirm() can verify the signature against it.
 */
export async function createOrder(env, settings, { amount, currency = 'INR', receipt, notes }) {
  const keyId = keyIdFor(env);
  const secret = secretFor(env);
  if (!keyId || !secret) return { error: 'Razorpay is not configured' };

  const body = {
    amount: Math.round(amount),
    currency,
    partial_payment: false,
  };
  if (receipt) body.receipt = String(receipt).slice(0, RECEIPT_MAX);
  if (notes) body.notes = notes;

  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + btoa(`${keyId}:${secret}`),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return { error: detail?.error?.description || `Razorpay order failed (${res.status})` };
  }
  return await res.json();
}

/**
 * Verify a Razorpay payment signature.
 *
 *   expected = HMAC-SHA256(secret, "<order_id>|<payment_id>")
 *
 * Compared with a timing-safe equal rather than ===, so a signature guess
 * leaks no information through timing. Returns true only on an exact match.
 */
export function verifySignature(secret, orderId, paymentId, signature) {
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`).digest('hex');
  return timingSafeHexEqual(expected, String(signature));
}

/**
 * Constant-time comparison of two hex strings. Same length required; a
 * different length means the candidate was malformed and cannot be valid.
 */
function timingSafeHexEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


/**
 * Handle a Razorpay webhook. Verifies the signature against the webhook
 * secret (separate from the key secret), then dispatches by event.
 *
 * The webhook secret is separate from the key secret: Razorpay lets you have
 * multiple webhooks each with its own secret, and verifying with the key
 * secret would accept any request signed with it (including API responses
 * an attacker could replay).
 */
export async function webhook({ env, request, store }) {
  const body = await request.text();
  const sig = request.headers.get('x-razorpay-signature') || '';
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) return badRequest('Webhook secret not configured');

  const expected = createHmac('sha256', webhookSecret).update(body).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return unauthorized('Invalid signature');
  }

  let event;
  try { event = JSON.parse(body); } catch { return badRequest('Malformed body'); }

  // payment.captured — mark the matching order paid. The order number is
  // carried in the payment's notes (set when the order was created) or, as
  // a fallback, in the description.
  if (event.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    const orderNumber = payment?.notes?.order_number || payment?.description;
    if (orderNumber && store) {
      await store.run(
        'UPDATE orders SET paid_at = ?, payment_status = ? WHERE number = ?',
        new Date().toISOString(), 'paid', orderNumber,
      ).catch(() => {});
    }
  }

  return ok();
}

/**
 * Refund a payment through the Razorpay API. Returns the refund record.
 * Only the payments service ever makes this call.
 */
export async function refund(env, settings, { paymentId, amountPaise, notes }) {
  const keyId = keyIdFor(env);
  const keySecret = secretFor(env);
  if (!keyId || !keySecret) throw new Error('Razorpay not configured');

  const res = await fetch(`${API_BASE}/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + btoa(`${keyId}:${keySecret}`),
    },
    body: JSON.stringify({
      amount: amountPaise,
      notes: notes || {},
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Razorpay refund failed: ${res.status} ${detail}`);
  }
  return res.json();
}

/**
 * Fetch a payment's live status from Razorpay (captured / failed / refunded).
 * Used by the admin orders view to show the payment state alongside the order.
 */
export async function paymentStatus(env, settings, paymentId) {
  const keyId = keyIdFor(env);
  const keySecret = secretFor(env);
  if (!keyId || !keySecret || !paymentId) return null;

  const res = await fetch(`${API_BASE}/payments/${paymentId}`, {
    headers: { 'Authorization': 'Basic ' + btoa(`${keyId}:${keySecret}`) },
  });
  if (!res.ok) return null;
  return res.json();
}
