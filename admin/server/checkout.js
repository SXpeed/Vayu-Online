/**
 * Vayu — the checkout pipeline: coupons, variants, shipping zones, payment.
 *
 * Split in two halves on purpose. `prepareOrder` only reads and validates —
 * it can be run for a quote without touching anything. `commitOrder` is the
 * half that writes: stock down, coupon used, customer upserted, order
 * recorded, confirmation queued. Razorpay needs exactly that seam, because
 * an order must not exist until the payment signature checks out.
 *
 * Signing in is never required to buy. A guest sends every delivery field
 * in the request; a signed-in shopper sends only what their account does
 * not already know, and `orderCustomer` merges the two. Either way the
 * rest of this file works on one plain customer object.
 */

const crypto = require('node:crypto');
const store = require('./db');
const { sendJson } = require('./http');
const accounts = require('./accounts');

/* ---------- coupons ---------- */

/**
 * Validate a coupon for this customer and subtotal. Returns
 * { coupon, discount } or { error }. A coupon may be restricted to named
 * customers by email and/or phone — it applies when EITHER matches, since
 * a shopper may check out with a different address than we have on file.
 */
function checkCoupon(code, email, phone, subtotal) {
  const c = store.db.coupons.find(x => x.code === String(code || '').toUpperCase().trim());
  if (!c || !c.active) return { error: 'Invalid coupon code' };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return { error: 'This coupon has expired' };
  if (c.usageLimit && c.usedCount >= c.usageLimit) return { error: 'This coupon has been fully redeemed' };
  if (c.minOrder && subtotal < c.minOrder) return { error: `Coupon needs a minimum order of ${store.formatPrice(c.minOrder)}` };

  const emails = c.restrictTo?.emails || [];
  const phones = c.restrictTo?.phones || [];
  const mail = String(email || '').toLowerCase().trim();
  if (emails.length || phones.length) {
    const phone10 = store.normPhone(phone);
    const match = (mail && emails.includes(mail))
      || (phone10 && phones.some(x => store.normPhone(x) === phone10));
    if (!match) return { error: 'This coupon is not valid for this account' };
  }
  if (c.perCustomerLimit) {
    const used = (c.uses || []).filter(u => u.email === mail).length;
    if (used >= c.perCustomerLimit) return { error: 'You have already used this coupon' };
  }

  const discount = c.type === 'percent'
    ? Math.round(subtotal * Math.min(100, c.value) / 100)
    : Math.min(subtotal, c.value);
  return { coupon: c, discount };
}

/* ---------- shipping ---------- */

/** Shipping for a PIN code: first matching zone by prefix, else flat rate. */
function shippingFor(subtotal, pin) {
  const s = store.db.settings;
  if (subtotal >= s.freeShippingAbove) return 0;
  const p = String(pin || '');
  for (const z of s.zones || []) {
    if ((z.pinPrefixes || []).some(pre => pre && p.startsWith(String(pre)))) return Number(z.rate) || 0;
  }
  return s.shippingFlat;
}

/* ---------- order assembly ---------- */

/** Resolve one cart line to a product (and variant), checking stock. */
function resolveLine(it) {
  const prod = it.id ? store.productById(it.id) : store.productByCatIdx(it.cat, Number(it.idx));
  if (!prod || prod.status !== 'active') return { error: `Item no longer available: ${it.name || '?'}` };
  const qty = Math.max(1, Number(it.qty) || 1);

  let price = prod.price;
  let variant = null;
  if (it.variant && prod.variants?.length) {
    variant = prod.variants.find(v => v.label === it.variant);
    if (!variant) return { error: `Option "${it.variant}" of "${prod.name}" is gone` };
    if (variant.price != null) price = variant.price;
    if ((Number(variant.stock) || 0) < qty) return { error: `Only ${variant.stock} left of "${prod.name} — ${variant.label}"` };
  } else if (store.totalStock(prod) < qty) {
    return { error: `Only ${store.totalStock(prod)} left of "${prod.name}"` };
  }
  return {
    line: { productId: prod.id, name: prod.name, price, qty, img: prod.img, variant: variant ? variant.label : null },
  };
}

/**
 * The delivery details to ship against.
 *
 * For a guest that is simply what the form sent. For a signed-in shopper,
 * anything the form left out is filled from the account, and the email is
 * forced to the account's own: an order placed while signed in belongs to
 * that person, which is also what stops a second customer record (and a
 * second run at a once-per-customer coupon) appearing under a typo.
 */
function orderCustomer(body, account) {
  const submitted = body.customer || {};
  if (!account) return { ...submitted };

  const known = accounts.checkoutDetails(account);
  const merged = {};
  for (const field of accounts.CHECKOUT_FIELDS) {
    merged[field] = String(submitted[field] ?? '').trim() || known[field] || '';
  }
  merged.email = account.email;
  return merged;
}

/** Price a checkout without writing anything. Returns { error } on refusal. */
function prepareOrder(body, account = null) {
  const items = Array.isArray(body.items) ? body.items : [];
  const customer = orderCustomer(body, account);
  if (!items.length) return { error: 'Cart is empty' };
  if (!customer.name || !customer.email) return { error: 'Name and email are required' };
  if (store.normPhone(customer.phone).length < 10) return { error: 'A valid 10-digit phone number is required' };
  if (!String(customer.address || '').trim()) return { error: 'A delivery address is required' };
  if (!String(customer.pin || '').trim()) return { error: 'A PIN code is required' };

  const lines = [];
  for (const it of items) {
    const r = resolveLine(it);
    if (r.error) return { error: r.error, status: 409 };
    lines.push(r.line);
  }

  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  let discount = 0;
  let couponCode = null;
  if (body.coupon) {
    const r = checkCoupon(body.coupon, customer.email, customer.phone, subtotal);
    if (r.error) return { error: r.error };
    discount = r.discount;
    couponCode = r.coupon.code;
  }
  const shipping = shippingFor(subtotal - discount, customer.pin);
  return {
    lines, customer, subtotal, discount, couponCode, shipping,
    total: subtotal - discount + shipping,
    sid: String(body.sid || '').slice(0, 40),
    account,
    saveAddress: !!body.saveAddress,
  };
}

/**
 * The customer record to bill this order to. A signed-in shopper already
 * has one; a guest is matched on email so repeat guests stay one customer.
 */
function upsertCustomer(customer, orderTotal, account = null) {
  const email = String(customer.email || '').toLowerCase().trim();
  const now = new Date().toISOString();
  let c = account || (email ? store.db.customers.find(x => x.email === email) : null);
  if (!c) {
    c = {
      id: store.nextId('cust'),
      name: customer.name || '',
      email,
      phone: customer.phone || '',
      address: customer.address || '',
      ordersCount: 0,
      totalSpent: 0,
      firstSeen: now,
      lastSeen: now,
      source: 'checkout',
      notes: '',
      tags: [],
      // A guest record is a full account record with no password on it, so
      // registering later with this email claims it (see accounts.js).
      salt: null,
      hash: null,
      addresses: [],
    };
    store.db.customers.push(c);
  }
  c.name = customer.name || c.name;
  c.phone = customer.phone || c.phone;
  // The whole delivery address, not just the street line: without the city
  // and PIN the next checkout would have to ask for them again even though
  // this order shipped somewhere perfectly well known.
  c.address = customer.address || c.address;
  c.city = customer.city || c.city || '';
  c.pin = customer.pin || c.pin || '';
  c.ordersCount += 1;
  c.totalSpent += orderTotal;
  c.lastSeen = now;
  return c;
}

function confirmationEmail(prep, number) {
  const lines = prep.lines
    .map(l => `  ${l.name}${l.variant ? ` (${l.variant})` : ''} × ${l.qty} — ${store.formatPrice(l.price * l.qty)}`)
    .join('\n');
  return `Namaste ${prep.customer.name},\n\nThank you for your order ${number}.\n\n${lines}`
    + (prep.discount ? `\n  Discount (${prep.couponCode}): −${store.formatPrice(prep.discount)}` : '')
    + `\n  Shipping: ${prep.shipping ? store.formatPrice(prep.shipping) : 'Free'}`
    + `\n  Total: ${store.formatPrice(prep.total)}\n\nWe will write again when it ships.\n\n— Vayu`;
}

/** Write a prepared order: stock, coupon use, customer, order, email. */
function commitOrder(prep, paymentInfo) {
  const now = new Date().toISOString();

  for (const l of prep.lines) {
    const prod = store.productById(l.productId);
    if (l.variant) {
      prod.variants.find(x => x.label === l.variant).stock -= l.qty;
    } else {
      prod.stock -= l.qty;
    }
    prod.sold = (prod.sold || 0) + l.qty;
    store.logInventory(prod.id, prod.name + (l.variant ? ` — ${l.variant}` : ''), -l.qty, 'sale', 'storefront');
  }

  if (prep.couponCode) {
    const c = store.db.coupons.find(x => x.code === prep.couponCode);
    if (c) {
      c.usedCount = (c.usedCount || 0) + 1;
      (c.uses ||= []).push({ email: String(prep.customer.email).toLowerCase().trim(), t: now });
    }
  }

  const number = 'VAY-' + (1000 + store.db.orders.length + 1);
  const cust = upsertCustomer(prep.customer, prep.total, prep.account);

  // Only on request: a delivery address is the shopper's to keep or not.
  if (prep.account && prep.saveAddress) {
    accounts.rememberAddress(cust, prep.customer);
  }

  const order = {
    id: store.nextId('ord'),
    number,
    items: prep.lines,
    customer: {
      id: cust.id,
      name: prep.customer.name, email: cust.email, phone: prep.customer.phone || '',
      address: prep.customer.address || '', city: prep.customer.city || '', pin: prep.customer.pin || '',
    },
    subtotal: prep.subtotal,
    discount: prep.discount,
    coupon: prep.couponCode,
    shipping: prep.shipping,
    total: prep.total,
    payment: paymentInfo || { method: 'cod' },
    // Recorded so the panel can tell a one-off buyer from an account holder.
    guest: !prep.account,
    status: 'new',
    createdAt: now,
    timeline: [{
      t: now, status: 'new',
      note: prep.account ? 'Order placed from storefront (signed in)' : 'Order placed from storefront (guest)',
    }],
  };
  store.db.orders.unshift(order);

  if (prep.sid) delete store.db.carts[prep.sid]; // converted — not abandoned

  store.queueEmail(cust.email, `Vayu — order ${number} confirmed`, confirmationEmail(prep, number), 'order.placed');
  store.save();
  return order;
}

/* ---------- routes ---------- */

/* Razorpay orders awaiting confirmation; entries older than an hour are
   dropped, so an abandoned payment window cannot pin a cart forever. */
const pendingPayments = new Map();
const PENDING_TTL = 60 * 60 * 1000;

async function createRazorpayOrder(pay, prep) {
  const auth = Buffer.from(`${pay.razorpayKeyId}:${pay.razorpayKeySecret}`).toString('base64');
  const rzRes = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: prep.total * 100, currency: 'INR', receipt: 'vayu_' + Date.now() }),
  });
  const rz = await rzRes.json();
  if (!rzRes.ok) return { error: rz.error?.description || 'Payment gateway error' };
  return { id: rz.id };
}

async function checkout({ req, res, body }) {
  // Signed in or not, the order goes through the same pipeline — an account
  // only saves the shopper from typing what we already know.
  const prep = prepareOrder(body, accounts.currentCustomer(req));
  if (prep.error) return sendJson(res, prep.status || 400, { error: prep.error });

  const pay = store.db.settings.payment || {};
  const online = pay.provider === 'razorpay' && pay.razorpayKeyId && pay.razorpayKeySecret;

  if (online) {
    // The order is only recorded once /api/checkout/confirm verifies the
    // signature; until then it exists solely in pendingPayments.
    const rz = await createRazorpayOrder(pay, prep);
    if (rz.error) return sendJson(res, 502, { error: rz.error });

    pendingPayments.set(rz.id, { prep, created: Date.now() });
    for (const [k, v] of pendingPayments) {
      if (Date.now() - v.created > PENDING_TTL) pendingPayments.delete(k);
    }
    return sendJson(res, 200, {
      payment: 'razorpay',
      keyId: pay.razorpayKeyId,
      rzpOrderId: rz.id,
      amount: prep.total * 100,
      name: store.db.settings.storeName,
      prefill: { name: prep.customer.name, email: prep.customer.email, contact: prep.customer.phone },
    });
  }

  const order = commitOrder(prep, { method: 'cod' });
  sendJson(res, 201, { ok: true, number: order.number, total: order.total, discount: order.discount });
}

function confirm({ res, body }) {
  const pend = pendingPayments.get(body.rzpOrderId);
  if (!pend) return sendJson(res, 400, { error: 'Payment session expired — please try again' });

  const secret = store.db.settings.payment.razorpayKeySecret;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${body.rzpOrderId}|${body.rzpPaymentId}`).digest('hex');
  if (expected !== body.rzpSignature) return sendJson(res, 400, { error: 'Payment verification failed' });

  pendingPayments.delete(body.rzpOrderId);
  const order = commitOrder(pend.prep, {
    method: 'razorpay', paymentId: body.rzpPaymentId, orderId: body.rzpOrderId,
  });
  sendJson(res, 201, { ok: true, number: order.number, total: order.total, discount: order.discount });
}

/** Quote a coupon against a live cart, before the customer commits to it. */
function validateCoupon({ req, res, body }) {
  // A signed-in shopper does not retype their email into the cart, so a
  // coupon restricted to their address still has to find them.
  const account = accounts.currentCustomer(req);
  const items = Array.isArray(body.items) ? body.items : [];
  let subtotal = Number(body.subtotal) || 0;
  if (items.length) {
    subtotal = items.reduce((n, it) => {
      const r = resolveLine(it);
      return r.line ? n + r.line.price * r.line.qty : n;
    }, 0);
  }
  const r = checkCoupon(body.code, body.email || account?.email, body.phone || account?.phone, subtotal);
  if (r.error) return sendJson(res, 400, { error: r.error });
  sendJson(res, 200, {
    ok: true, code: r.coupon.code, discount: r.discount,
    type: r.coupon.type, value: r.coupon.value,
  });
}

module.exports = { checkout, confirm, validateCoupon };
