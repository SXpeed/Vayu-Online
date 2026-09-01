/**
 * Vayu — the checkout pipeline on D1: coupons, variants, shipping, payment.
 *
 * Still split in two halves on purpose. `prepareOrder` only reads and
 * validates — it can be run for a quote without touching anything.
 * `commitOrder` is the half that writes. Razorpay needs exactly that seam,
 * because an order must not exist until the payment signature checks out.
 *
 * What D1 adds is that the writing half is now a single `batch`, which D1
 * runs as one transaction: stock down, coupon used, customer updated,
 * order and its lines inserted, all or nothing. The JSON store could only
 * promise that by holding the whole file in memory.
 *
 * Signing in is never required to buy. A guest sends every delivery field;
 * a signed-in shopper sends only what their account does not already know,
 * and `orderCustomer` merges the two.
 */

import { json, badRequest } from '#shared/utils/http.js';
import { now, normPhone, formatPrice } from '#shared/database/store.js';
import { productById, productByCatIdx, totalStock } from '#services/products/catalogue.js';
import { currentCustomer } from '#services/auth/sessions.js';
import { checkoutDetails, loadAddresses, rememberAddress, CHECKOUT_FIELDS } from '#services/users/accounts.js';
import {
  putPending, takePending, createOrder, verifyPayment, isRazorpayEnabled, keyIdFor,
} from '#services/payments/razorpay.js';

/* ---------- coupons ---------- */

/**
 * Validate a coupon for this customer and subtotal. Returns
 * { coupon, discount } or { error }. A coupon may be restricted to named
 * customers by email and/or phone — it applies when EITHER matches, since
 * a shopper may check out with a different address than we have on file.
 */
async function checkCoupon(store, code, email, phone, subtotal) {
  const wanted = String(code || '').toUpperCase().trim();
  const c = await store.one('SELECT * FROM coupons WHERE code = ?', wanted);
  if (!c || !c.active) return { error: 'Invalid coupon code' };
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return { error: 'This coupon has expired' };
  if (c.usage_limit && c.used_count >= c.usage_limit) return { error: 'This coupon has been fully redeemed' };
  if (c.min_order && subtotal < c.min_order) {
    return { error: `Coupon needs a minimum order of ${formatPrice(c.min_order)}` };
  }

  const restrictions = await store.all('SELECT kind, value FROM coupon_restrictions WHERE coupon_id = ?', c.id);
  if (restrictions.length) {
    const mail = String(email || '').toLowerCase().trim();
    const phone10 = normPhone(phone);
    const match = restrictions.some(r =>
      (r.kind === 'email' && mail && r.value.toLowerCase() === mail)
      || (r.kind === 'phone' && phone10 && normPhone(r.value) === phone10));
    if (!match) return { error: 'This coupon is not valid for this account' };
  }

  if (c.per_customer_limit) {
    const used = await store.value(
      'SELECT COUNT(*) FROM coupon_uses WHERE code = ? AND email = ?',
      c.code, String(email || '').toLowerCase().trim(),
    );
    if (used >= c.per_customer_limit) return { error: 'You have already used this coupon' };
  }

  const discount = c.type === 'percent'
    ? Math.round(subtotal * Math.min(100, c.value) / 100)
    : Math.min(subtotal, c.value);
  return { coupon: c, discount };
}

/* ---------- shipping ---------- */

/** Shipping for a PIN code: first matching zone by prefix, else flat rate. */
function shippingFor(settings, subtotal, pin) {
  if (subtotal >= settings.freeShippingAbove) return 0;
  const p = String(pin || '');
  for (const z of settings.zones || []) {
    if ((z.pinPrefixes || []).some(pre => pre && p.startsWith(String(pre)))) return Number(z.rate) || 0;
  }
  return settings.shippingFlat;
}

/* ---------- order assembly ---------- */

/** Resolve one cart line to a product (and variant), checking stock. */
async function resolveLine(store, it) {
  const product = it.id
    ? await productById(store, it.id)
    : await productByCatIdx(store, it.cat, Number(it.idx));
  if (!product || product.status !== 'active') {
    return { error: `Item no longer available: ${it.name || '?'}` };
  }
  const qty = Math.max(1, Number(it.qty) || 1);

  let price = product.price;
  let variant = null;

  // A product with options is only sold as one of its combinations. Without
  // this the fallback below would price the line at the base price and take
  // the stock off the product row, so a line that named no colour or size
  // would check out at the wrong price against stock nobody tracks — the
  // product page cannot produce that, but a replayed or hand-built request
  // can, and this is the last place to catch it.
  if (product.options?.length && !it.variant) {
    const names = product.options.map(o => o.name).join(' and ');
    return { error: `Choose a ${names} for "${product.name}"` };
  }

  if (it.variant && product.variants?.length) {
    variant = product.variants.find(v => v.label === it.variant);
    if (!variant) return { error: `Option "${it.variant}" of "${product.name}" is gone` };
    if (variant.price != null) price = variant.price;
    if ((Number(variant.stock) || 0) < qty) {
      return { error: `Only ${variant.stock} left of "${product.name} — ${variant.label}"` };
    }
  } else if (totalStock(product) < qty) {
    return { error: `Only ${totalStock(product)} left of "${product.name}"` };
  }

  return {
    line: {
      productId: product.id,
      variantId: variant?.id || null,
      name: product.name,
      price, qty,
      img: product.img,
      variant: variant ? variant.label : null,
    },
  };
}

/**
 * The delivery details to ship against. For a signed-in shopper anything
 * the form left out is filled from the account, and the email is forced to
 * the account's own: an order placed while signed in belongs to that
 * person, which is also what stops a second customer row (and a second run
 * at a once-per-customer coupon) appearing under a typo.
 */
function orderCustomer(body, account, known) {
  const submitted = body.customer || {};
  if (!account) return { ...submitted };

  const merged = {};
  for (const field of CHECKOUT_FIELDS) {
    merged[field] = String(submitted[field] ?? '').trim() || known[field] || '';
  }
  merged.email = account.email;
  return merged;
}

/** Price a checkout without writing anything. Returns { error } on refusal. */
export async function prepareOrder(store, body, account) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return { error: 'Cart is empty' };

  const known = account
    ? checkoutDetails(account, await loadAddresses(store, account.id))
    : {};
  const customer = orderCustomer(body, account, known);

  if (!customer.name || !customer.email) return { error: 'Name and email are required' };
  if (normPhone(customer.phone).length < 10) return { error: 'A valid 10-digit phone number is required' };
  if (!String(customer.address || '').trim()) return { error: 'A delivery address is required' };
  if (!String(customer.pin || '').trim()) return { error: 'A PIN code is required' };

  const lines = [];
  for (const it of items) {
    const r = await resolveLine(store, it);
    if (r.error) return { error: r.error, status: 409 };
    lines.push(r.line);
  }

  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  let discount = 0;
  let couponCode = null;
  if (body.coupon) {
    const r = await checkCoupon(store, body.coupon, customer.email, customer.phone, subtotal);
    if (r.error) return { error: r.error };
    discount = r.discount;
    couponCode = r.coupon.code;
  }

  const settings = await store.settings();
  const shipping = shippingFor(settings, subtotal - discount, customer.pin);

  return {
    lines, customer, subtotal, discount, couponCode, shipping,
    total: subtotal - discount + shipping,
    sid: String(body.sid || '').slice(0, 40),
    accountId: account?.id || null,
    saveAddress: !!body.saveAddress,
    settings,
  };
}

/* ---------- committing ---------- */

async function upsertCustomer(store, prep) {
  const email = String(prep.customer.email || '').toLowerCase().trim();
  const stamp = now();
  let record = prep.accountId
    ? await store.one('SELECT * FROM customers WHERE id = ?', prep.accountId)
    : await store.one('SELECT * FROM customers WHERE email = ?', email);

  if (!record) {
    const id = await store.nextId('cust');
    await store.run(
      `INSERT INTO customers
        (id, email, name, phone, address, city, pin, orders_count, total_spent,
         first_seen, last_seen, source, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'checkout', '')`,
      id, email, prep.customer.name || '', prep.customer.phone || '',
      prep.customer.address || '', prep.customer.city || '', prep.customer.pin || '',
      stamp, stamp,
    );
    record = await store.one('SELECT * FROM customers WHERE id = ?', id);
  }

  // The whole delivery address, not just the street line: without the city
  // and PIN the next checkout would have to ask for them again even though
  // this order shipped somewhere perfectly well known.
  await store.update('customers', 'id', record.id, {
    name: prep.customer.name || record.name,
    phone: prep.customer.phone || record.phone,
    address: prep.customer.address || record.address,
    city: prep.customer.city || record.city || '',
    pin: prep.customer.pin || record.pin || '',
    orders_count: (record.orders_count || 0) + 1,
    total_spent: (record.total_spent || 0) + prep.total,
    last_seen: stamp,
  });
  return record;
}

function confirmationEmail(prep, number) {
  const lines = prep.lines
    .map(l => `  ${l.name}${l.variant ? ` (${l.variant})` : ''} × ${l.qty} — ${formatPrice(l.price * l.qty)}`)
    .join('\n');
  const discountLine = prep.discount
    ? `\n  Discount (${prep.couponCode}): −${formatPrice(prep.discount)}` : '';
  return `Namaste ${prep.customer.name},\n\nThank you for your order ${number}.\n\n${lines}`
    + discountLine
    + `\n  Shipping: ${prep.shipping ? formatPrice(prep.shipping) : 'Free'}`
    + `\n  Total: ${formatPrice(prep.total)}\n\nWe will write again when it ships.\n\n— Vayu`;
}

/**
 * Write a prepared order. Everything that must not half-apply — stock,
 * coupon use, the order and its lines — goes in one batch, which D1 runs
 * inside a transaction.
 */
export async function commitOrder(store, prep, paymentInfo, { shortfalls = [] } = {}) {
  const stamp = now();
  const customer = await upsertCustomer(store, prep);

  const count = await store.value('SELECT COUNT(*) FROM orders');
  const number = 'VAY-' + (1000 + count + 1);
  const orderId = await store.nextId('ord');
  const payment = paymentInfo || { method: 'cod' };

  // A non-COD order only reaches this function after confirmPayment has
  // verified Razorpay's signature, so by the time it commits the money is
  // already taken — it is born 'paid', not 'pending'. COD collects on
  // delivery and stays pending until someone marks it otherwise.
  const paid = payment.method !== 'cod' && !!payment.paymentId;

  const statements = [
    store.stmt(
      `INSERT INTO orders
        (id, number, customer_id, name, email, phone, address, city, pin,
         subtotal, discount, coupon, shipping, total,
         payment_method, payment_id, payment_order_id, guest, status, created_at,
         payment_status, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`,
      orderId, number, customer.id,
      prep.customer.name, customer.email, prep.customer.phone || '',
      prep.customer.address || '', prep.customer.city || '', prep.customer.pin || '',
      prep.subtotal, prep.discount, prep.couponCode, prep.shipping, prep.total,
      payment.method, payment.paymentId || null, payment.orderId || null,
      prep.accountId ? 0 : 1, stamp,
      paid ? 'paid' : 'pending', paid ? stamp : null,
    ),
    store.stmt(
      'INSERT INTO order_timeline (order_id, t, status, note) VALUES (?, ?, ?, ?)',
      orderId, stamp, 'new',
      prep.accountId ? 'Order placed from storefront (signed in)' : 'Order placed from storefront (guest)',
    ),
  ];

  prep.lines.forEach((l, i) => {
    const label = l.name + (l.variant ? ` — ${l.variant}` : '');
    statements.push(
      store.stmt(
        `INSERT INTO order_items (order_id, product_id, name, price, qty, img, variant, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        orderId, l.productId, l.name, l.price, l.qty, l.img, l.variant, i,
      ),
      // Stock comes off the variant when there is one, off the product when
      // there is not — the same rule totalStock() reads by.
      //
      // Floored at zero. resolveLine checks stock, but the check and this
      // write are not one transaction: two carts can both pass it, and an
      // online payment may confirm up to an hour after it was priced. A bare
      // `stock - qty` then leaves a negative count, which is not a fact about
      // anything — it silently absorbs the next restock (a product at -3
      // given 5 more shows 2) and reads as a shortfall nobody recorded. The
      // inventory_log line below still records the full -qty, so the
      // discrepancy stays visible where stock movements are actually read.
      l.variantId
        ? store.stmt('UPDATE product_variants SET stock = MAX(0, stock - ?) WHERE id = ?', l.qty, l.variantId)
        : store.stmt('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?', l.qty, l.productId),
      store.stmt('UPDATE products SET sold = sold + ? WHERE id = ?', l.qty, l.productId),
      store.stmt(
        'INSERT INTO inventory_log (t, product_id, name, delta, reason, by) VALUES (?, ?, ?, ?, ?, ?)',
        stamp, l.productId, label, -l.qty, 'sale', 'storefront',
      ),
    );
  });

  if (prep.couponCode) {
    statements.push(
      store.stmt('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?', prep.couponCode),
      store.stmt('INSERT INTO coupon_uses (code, email, t) VALUES (?, ?, ?)',
        prep.couponCode, customer.email, stamp),
    );
  }

  // Sold out between pricing and payment. The order is still committed —
  // see confirm() for why — so the timeline is where it has to be said, in
  // the one place someone packing this order will actually look.
  for (const s of shortfalls) {
    statements.push(store.stmt(
      'INSERT INTO order_timeline (order_id, t, status, note) VALUES (?, ?, ?, ?)',
      orderId, stamp, 'new',
      `Oversold: ${s.label} — ${s.wanted} ordered, ${s.available} in stock at payment. Contact the customer.`,
    ));
  }

  // Converted, so no longer an abandoned cart.
  if (prep.sid) statements.push(store.stmt('DELETE FROM carts WHERE sid = ?', prep.sid));

  await store.batch(statements);

  // Only on request: a delivery address is the shopper's to keep or not.
  if (prep.accountId && prep.saveAddress) {
    await rememberAddress(store, prep.accountId, prep.customer);
  }

  await store.queueEmail(customer.email, `Vayu — order ${number} confirmed`,
    confirmationEmail(prep, number), 'order.placed');

  // The shop is told separately. A timeline note is only found by someone
  // already looking at the order, and the whole point of this case is that
  // nobody knows to look yet.
  if (shortfalls.length) {
    const settings = await store.settings();
    const to = settings.storeEmail;
    if (to) {
      await store.queueEmail(to, `Vayu — order ${number} was paid for stock we do not have`,
        `Order ${number} completed payment, but these lines were short by the time it confirmed:\n\n`
        + shortfalls.map(s => `  ${s.label}: ${s.wanted} ordered, ${s.available} in stock`).join('\n')
        + `\n\nThe payment has been captured and the order stands. Contact ${customer.email} to `
        + 'arrange a restock, a substitution or a refund.\n\n— Vayu',
        'order.oversold');
    }
  }

  return { id: orderId, number, total: prep.total, discount: prep.discount, shortfalls };
}

/* ---------- routes ---------- */

export async function checkout({ store, request, body, env }) {
  // Signed in or not, the order goes through the same pipeline — an account
  // only saves the shopper from typing what we already know.
  const account = await currentCustomer(store, request, env);
  const prep = await prepareOrder(store, body, account);
  if (prep.error) return json(prep.status || 400, { error: prep.error });

  const payment = prep.settings.payment || {};
  // (env, settings) — the payments service resolves the key and secret
  // itself; only the non-secret key id is read here, to render the button.
  const online = isRazorpayEnabled(env, prep.settings);

  if (online) {
    // The order is only recorded once /api/checkout/confirm verifies the
    // signature; until then it exists solely as a pending row.
    // Amount in paise, and a receipt inside Razorpay's 40-char cap. Same
    // shape the pre-refactor createRazorpayOrder() sent.
    const rz = await createOrder(env, prep.settings, {
      amount: prep.total * 100,
      currency: 'INR',
      receipt: 'vayu_' + Date.now(),
    });
    if (rz.error) return json(502, { error: rz.error });

    await putPending(store, rz.id, prep);
    return json(200, {
      payment: 'razorpay',
      // From the Workers secret, not the settings row. This was the last
      // read of payment.razorpayKeyId, and it is what would have handed the
      // browser an empty key the moment those columns were cleared.
      keyId: keyIdFor(env),
      rzpOrderId: rz.id,
      amount: prep.total * 100,
      name: prep.settings.storeName,
      prefill: { name: prep.customer.name, email: prep.customer.email, contact: prep.customer.phone },
    });
  }

  const order = await commitOrder(store, prep, { method: 'cod' });
  return json(201, { ok: true, number: order.number, total: order.total, discount: order.discount });
}

/**
 * What each line of a priced-but-not-yet-committed order can still be filled
 * from, read fresh at confirm time.
 *
 * resolveLine checked stock when the cart was priced. For card payments that
 * can be up to an hour earlier (PENDING_TTL_MS), and in that window another
 * shopper can take the last one. Returns only the lines that no longer add
 * up.
 */
async function stockShortfalls(store, lines) {
  const short = [];

  for (const l of lines) {
    const product = await productById(store, l.productId);
    if (!product) {
      short.push({ label: l.name, wanted: l.qty, available: 0 });
      continue;
    }
    const available = l.variantId
      ? (Number(product.variants?.find(v => v.id === l.variantId)?.stock) || 0)
      : totalStock(product);

    if (available < l.qty) {
      short.push({
        label: l.name + (l.variant ? ` — ${l.variant}` : ''),
        wanted: l.qty,
        available,
      });
    }
  }
  return short;
}

export async function confirm({ store, body, env }) {
  const prep = await takePending(store, body.rzpOrderId);
  if (!prep) return badRequest('Payment session expired — please try again');

  const settings = await store.settings();
  // The secret is never read here. verifyPayment resolves it inside the
  // payments service; this module only says which payment to check.
  if (!verifyPayment(env, settings, {
    orderId: body.rzpOrderId,
    paymentId: body.rzpPaymentId,
    signature: body.rzpSignature,
  })) {
    return badRequest('Payment verification failed');
  }

  // Stock is re-read here, but a shortfall does not reject the order.
  //
  // By this point Razorpay has captured the money. Refusing would leave the
  // shopper paid-up with no order and no refund — the worst of the three
  // outcomes, and the one they can do least about. The stock write is
  // floored at zero either way, so the sale is recorded honestly; what was
  // missing was anyone being told. The order is committed, its timeline
  // says what was short, and the shop gets an email naming the customer to
  // contact. A human then decides between restocking, substituting and
  // refunding, which is a judgement this code should not be making at 3am.
  const shortfalls = await stockShortfalls(store, prep.lines);

  const order = await commitOrder(store, prep, {
    method: 'razorpay', paymentId: body.rzpPaymentId, orderId: body.rzpOrderId,
  }, { shortfalls });

  return json(201, {
    ok: true, number: order.number, total: order.total, discount: order.discount,
    // The confirmation page can say so rather than promising a dispatch date
    // the shop may not be able to meet.
    ...(shortfalls.length ? { delayed: shortfalls.map(s => s.label) } : {}),
  });
}

/** Quote a coupon against a live cart, before the customer commits to it. */
export async function validateCoupon({ store, request, body, env }) {
  // A signed-in shopper does not retype their email into the cart, so a
  // coupon restricted to their address still has to find them.
  const account = await currentCustomer(store, request, env);

  const items = Array.isArray(body.items) ? body.items : [];
  let subtotal = Number(body.subtotal) || 0;
  if (items.length) {
    subtotal = 0;
    for (const it of items) {
      const r = await resolveLine(store, it);
      if (r.line) subtotal += r.line.price * r.line.qty;
    }
  }

  const r = await checkCoupon(store, body.code,
    body.email || account?.email, body.phone || account?.phone, subtotal);
  if (r.error) return badRequest(r.error);

  return json(200, {
    ok: true, code: r.coupon.code, discount: r.discount,
    type: r.coupon.type, value: r.coupon.value,
  });
}
