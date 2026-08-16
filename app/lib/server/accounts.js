/**
 * Vayu — customer accounts, on D1.
 *
 * The model is unchanged from the Node version and is worth restating,
 * because the schema now makes it explicit: a customer row is written by
 * checkout as a guest with `hash IS NULL`, and registering with that email
 * sets a password on the *same* row. That is what carries a guest's order
 * history into a new account. Signing in is never required to buy.
 *
 * NOTE: there is still no email verification — the site has no sending
 * path, only the outbox. Claiming an email therefore relies on nobody
 * registering someone else's; account creation queues a mail so the real
 * owner hears about it. Wire up sending, then require a verified link here
 * before the row is claimed.
 */

import { hashPassword, verifyPassword, now } from './db.js';
import { json, ok, badRequest, notFound, unauthorized, methodNotAllowed } from './http.js';
import {
  currentCustomer, customerSession, customerCookie, clearCustomerCookie, createThrottle,
} from './sessions.js';
import { googleEnabled, start as googleStart, callback as googleCallback } from './google.js';

const MIN_PASSWORD = 8;

// Split on the dots explicitly rather than letting two greedy classes
// fight over them — same shape, no backtracking.
const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

const cleanEmail = (v) => String(v || '').toLowerCase().trim();
const cleanText = (v, max = 200) => String(v ?? '').trim().slice(0, max);

/* ---------- what the storefront is allowed to see ---------- */

/** The fields checkout needs, and the ones it must not proceed without. */
export const CHECKOUT_FIELDS = ['name', 'email', 'phone', 'address', 'city', 'pin'];
const REQUIRED_FIELDS = ['name', 'email', 'phone', 'address', 'pin'];

const addressRow = (a) => ({
  id: a.id,
  label: a.label,
  name: a.name || '',
  phone: a.phone || '',
  address: a.address,
  city: a.city || '',
  pin: a.pin,
  isDefault: !!a.is_default,
});

export const loadAddresses = async (store, customerId) =>
  (await store.all(
    'SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, rowid', customerId,
  )).map(addressRow);

/** Address the shopper marked default, else the most recently added. */
export const defaultAddress = (addresses) =>
  addresses.find(a => a.isDefault) || addresses[addresses.length - 1] || null;

/**
 * Merge the account's own fields with its default address. The address
 * book wins for delivery fields, since that is the more deliberate entry.
 * `missing` is the whole point of the shape: checkout asks only for what
 * is not here yet.
 */
export function checkoutDetails(customer, addresses = []) {
  const addr = defaultAddress(addresses) || {};
  const details = {
    name: addr.name || customer.name || '',
    email: customer.email || '',
    phone: addr.phone || customer.phone || '',
    address: addr.address || customer.address || '',
    city: addr.city || customer.city || '',
    pin: addr.pin || customer.pin || '',
  };
  return {
    ...details,
    missing: REQUIRED_FIELDS.filter(f => !String(details[f] || '').trim()),
  };
}

export async function publicCustomer(store, customer) {
  const addresses = await loadAddresses(store, customer.id);
  return {
    id: customer.id,
    name: customer.name || '',
    email: customer.email,
    phone: customer.phone || '',
    ordersCount: customer.orders_count || 0,
    addresses,
    details: checkoutDetails(customer, addresses),
    // What Google gave us, where it did. `hasPassword` is what tells the
    // account page whether to offer a password change at all — an account
    // created through Google has none to change.
    picture: customer.picture || null,
    givenName: customer.given_name || null,
    familyName: customer.family_name || null,
    locale: customer.locale || null,
    emailVerified: !!customer.email_verified,
    hasPassword: !!customer.hash,
    hasGoogle: !!customer.google_sub,
  };
}

const passwordError = (password) =>
  String(password || '').length < MIN_PASSWORD
    ? `Password must be at least ${MIN_PASSWORD} characters`
    : null;

/* ---------- open routes ---------- */

const throttle = createThrottle();

/**
 * Create an account, or claim the guest row that already carries this
 * email — which is what makes "I ordered once as a guest, now I want an
 * account" keep its orders.
 */
async function register({ store, request, body }) {
  const email = cleanEmail(body.email);
  const name = cleanText(body.name, 120);
  if (!EMAIL_RE.test(email)) return badRequest('Please enter a valid email address');
  if (!name) return badRequest('Please enter your name');

  const pwError = passwordError(body.password);
  if (pwError) return badRequest(pwError);

  const existing = await store.one('SELECT * FROM customers WHERE email = ?', email);
  if (existing?.hash) {
    return json(409, { error: 'An account with this email already exists — please sign in' });
  }

  const stamp = now();
  const { salt, hash } = hashPassword(body.password);
  const phone = cleanText(body.phone, 20);

  let customer;
  if (existing) {
    await store.update('customers', 'id', existing.id, {
      name: name || existing.name,
      phone: phone || existing.phone,
      salt, hash,
      account_created_at: stamp,
      last_seen: stamp,
    });
    customer = await store.one('SELECT * FROM customers WHERE id = ?', existing.id);
  } else {
    const id = await store.nextId('cust');
    await store.run(
      `INSERT INTO customers
        (id, email, name, phone, address, city, pin, orders_count, total_spent,
         first_seen, last_seen, source, notes, salt, hash, account_created_at)
       VALUES (?, ?, ?, ?, '', '', '', 0, 0, ?, ?, 'account', '', ?, ?, ?)`,
      id, email, name, phone, stamp, stamp, salt, hash, stamp,
    );
    customer = await store.one('SELECT * FROM customers WHERE id = ?', id);
  }

  await store.queueEmail(email, 'Vayu — your account is ready',
    `Namaste ${customer.name},\n\nAn account was created for this email address at Vayu.`
    + `\n\nIf that was not you, reply to this message and we will remove it.\n\n— Vayu`,
    'account.created');
  await store.logActivity('system', 'account.register', `${email} created a customer account`);

  const { token, maxAge } = await customerSession(store, customer.id);
  return json(201, { ok: true, customer: await publicCustomer(store, customer) },
    { 'Set-Cookie': customerCookie(token, maxAge, request) });
}

async function login({ store, request, body }) {
  if (throttle.blocked(request)) {
    return json(429, { error: `Too many attempts. Try again in ${throttle.retryAfterMinutes} minutes.` });
  }
  const customer = await store.one('SELECT * FROM customers WHERE email = ?', cleanEmail(body.email));
  // Same message either way: whether an email has an account is not ours
  // to disclose to whoever is guessing.
  if (!customer?.hash || !verifyPassword(body.password || '', customer.salt, customer.hash)) {
    throttle.noteFailure(request);
    return json(401, { error: 'Invalid email or password' });
  }

  throttle.clear(request);
  await store.update('customers', 'id', customer.id, { last_seen: now() });
  const { token, maxAge } = await customerSession(store, customer.id);
  return json(200, { ok: true, customer: await publicCustomer(store, customer) },
    { 'Set-Cookie': customerCookie(token, maxAge, request) });
}

async function logout({ store, request }) {
  const headers = await clearCustomerCookie(store, request);
  return json(200, { ok: true }, headers);
}

/**
 * Who is signed in. Always 200 — the storefront asks this on every
 * checkout and a signed-out shopper is a normal answer, not an error.
 */
async function me({ store, env, customer }) {
  return json(200, {
    signedIn: !!customer,
    // So the sign-in screens only offer Google when it is actually wired up.
    google: googleEnabled(env),
    ...(customer ? { customer: await publicCustomer(store, customer) } : {}),
  });
}

/* ---------- signed-in routes ---------- */

async function updateProfile({ store, customer, body }) {
  const patch = { last_seen: now() };
  if (body.name !== undefined) patch.name = cleanText(body.name, 120) || customer.name;
  if (body.phone !== undefined) patch.phone = cleanText(body.phone, 20);
  await store.update('customers', 'id', customer.id, patch);
  const fresh = await store.one('SELECT * FROM customers WHERE id = ?', customer.id);
  return json(200, { ok: true, customer: await publicCustomer(store, fresh) });
}

async function changePassword({ store, customer, body }) {
  // A Google-only account has no password, and "current password is
  // incorrect" would be a baffling thing to tell someone who never set one.
  if (!customer.hash) {
    return badRequest('This account signs in with Google, so it has no password to change.');
  }
  if (!verifyPassword(body.current || '', customer.salt, customer.hash)) {
    return badRequest('Current password is incorrect');
  }
  const pwError = passwordError(body.next);
  if (pwError) return badRequest(pwError);
  const { salt, hash } = hashPassword(body.next);
  await store.update('customers', 'id', customer.id, { salt, hash });
  return ok();
}

/** Validate one address from a request body. Returns { error } or { data }. */
function readAddress(body) {
  const data = {
    label: cleanText(body.label, 40) || 'Address',
    name: cleanText(body.name, 120),
    phone: cleanText(body.phone, 20),
    address: cleanText(body.address, 400),
    city: cleanText(body.city, 80),
    pin: cleanText(body.pin, 12),
    is_default: body.isDefault ? 1 : 0,
  };
  if (!data.address) return { error: 'Please enter the street address' };
  if (!data.pin) return { error: 'Please enter the PIN code' };
  return { data };
}

/** Only one address may carry the default flag. */
async function applyDefault(store, customerId, addressId, wanted) {
  if (wanted) {
    await store.run('UPDATE addresses SET is_default = CASE id WHEN ? THEN 1 ELSE 0 END WHERE customer_id = ?',
      addressId, customerId);
    return;
  }
  // The first address saved is the default whether or not it was ticked.
  const count = await store.value('SELECT COUNT(*) FROM addresses WHERE customer_id = ?', customerId);
  if (count === 1) await store.run('UPDATE addresses SET is_default = 1 WHERE customer_id = ?', customerId);
}

async function addresses(ctx) {
  const { store, method, customer, body, parts } = ctx;
  const [id] = parts;

  if (method === 'GET') return json(200, { addresses: await loadAddresses(store, customer.id) });

  if (method === 'POST' && !id) {
    const r = readAddress(body);
    if (r.error) return badRequest(r.error);
    const addressId = await store.nextId('addr');
    await store.run(
      `INSERT INTO addresses (id, customer_id, label, name, phone, address, city, pin, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      addressId, customer.id, r.data.label, r.data.name, r.data.phone,
      r.data.address, r.data.city, r.data.pin, r.data.is_default, now(),
    );
    await applyDefault(store, customer.id, addressId, r.data.is_default);
    return json(201, { ok: true, customer: await publicCustomer(store, customer) });
  }

  const existing = await store.one('SELECT * FROM addresses WHERE id = ? AND customer_id = ?', id, customer.id);
  if (!existing) return notFound('Address not found');

  if (method === 'PUT') {
    const r = readAddress(body);
    if (r.error) return badRequest(r.error);
    await store.update('addresses', 'id', id, r.data);
    await applyDefault(store, customer.id, id, r.data.is_default);
    return json(200, { ok: true, customer: await publicCustomer(store, customer) });
  }

  if (method === 'DELETE') {
    await store.run('DELETE FROM addresses WHERE id = ? AND customer_id = ?', id, customer.id);
    // Never leave the book without a default to fall back on.
    const left = await store.all('SELECT id, is_default FROM addresses WHERE customer_id = ? ORDER BY rowid', customer.id);
    if (left.length && !left.some(a => a.is_default)) {
      await store.run('UPDATE addresses SET is_default = 1 WHERE id = ?', left[0].id);
    }
    return json(200, { ok: true, customer: await publicCustomer(store, customer) });
  }

  return methodNotAllowed();
}

/**
 * This customer's orders, newest first. Matched on the customer id the
 * order was written with, falling back to the email so guest orders placed
 * before the account existed still appear.
 */
async function orders({ store, customer }) {
  const rows = await store.all(
    `SELECT * FROM orders WHERE customer_id = ? OR email = ? ORDER BY created_at DESC LIMIT 100`,
    customer.id, customer.email,
  );
  if (!rows.length) return json(200, { orders: [] });

  const ids = rows.map(o => o.id);
  const holes = ids.map(() => '?').join(', ');
  const [items, timeline] = await Promise.all([
    store.all(`SELECT * FROM order_items WHERE order_id IN (${holes}) ORDER BY sort_order, id`, ...ids),
    store.all(`SELECT * FROM order_timeline WHERE order_id IN (${holes}) ORDER BY t`, ...ids),
  ]);

  return json(200, {
    orders: rows.map(o => ({
      number: o.number,
      createdAt: o.created_at,
      status: o.status,
      items: items.filter(i => i.order_id === o.id)
        .map(i => ({ name: i.name, qty: i.qty, price: i.price, variant: i.variant, img: i.img })),
      subtotal: o.subtotal,
      discount: o.discount,
      shipping: o.shipping,
      total: o.total,
      payment: o.payment_method || 'cod',
      address: [o.address, o.city, o.pin].filter(Boolean).join(', '),
      timeline: timeline.filter(t => t.order_id === o.id)
        .map(t => ({ t: t.t, status: t.status, note: t.note })),
    })),
  });
}

/* ---------- dispatch ---------- */

const OPEN = {
  'POST register': register,
  'POST login': login,
  'POST logout': logout,
  'GET me': me,
};

/** Full-page redirects, so these are plain GETs rather than fetch calls. */
const GOOGLE = {
  '': googleStart,
  callback: googleCallback,
};

const PRIVATE = {
  'PUT profile': updateProfile,
  'POST password': changePassword,
  'GET orders': orders,
};

/**
 * /api/account/<section>[/<id>]. `me` is deliberately open so the
 * storefront can ask "who is this?" without handling a 401 on every page.
 */
export async function route(ctx, section) {
  const customer = await currentCustomer(ctx.store, ctx.request, ctx.env);
  const full = { ...ctx, customer };

  if (section === 'google' && ctx.method === 'GET') {
    const step = GOOGLE[ctx.parts[0] || ''];
    return step ? step(full) : notFound();
  }

  const open = OPEN[`${ctx.method} ${section}`];
  if (open) return open(full);

  if (!customer) return unauthorized('Please sign in');
  if (section === 'addresses') return addresses(full);

  const priv = PRIVATE[`${ctx.method} ${section}`];
  return priv ? priv(full) : notFound();
}

/** Save a delivery address the shopper used at checkout, if it is new. */
export async function rememberAddress(store, customerId, details, label = 'Delivery address') {
  if (!details.address || !details.pin) return;
  const same = await store.one(
    'SELECT id FROM addresses WHERE customer_id = ? AND address = ? AND pin = ?',
    customerId, details.address, details.pin,
  );
  if (same) return;

  const count = await store.value('SELECT COUNT(*) FROM addresses WHERE customer_id = ?', customerId);
  await store.run(
    `INSERT INTO addresses (id, customer_id, label, name, phone, address, city, pin, is_default, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    await store.nextId('addr'), customerId, label, details.name || '', details.phone || '',
    details.address, details.city || '', details.pin, count ? 0 : 1, now(),
  );
}
