/**
 * Vayu — customer accounts for the storefront.
 *
 * Deliberately built on the customer records checkout already writes: a
 * guest order creates a customer with `hash: null`, and registering with
 * that same email sets a password on the *same* record, so the order
 * history a shopper built up as a guest is there the moment they make an
 * account. Signing in is never required to buy — see checkout.js, where
 * an account only pre-fills what the shopper would otherwise type.
 *
 * Sessions mirror the admin ones (auth.js): a random token in db.json
 * against a customer id, handed out as an HttpOnly cookie, revocable
 * server-side. They are kept in their own `customerSessions` map so that
 * a customer token can never be mistaken for an admin one.
 *
 * NOTE: there is no email verification yet — the site has no SMTP, only
 * the outbox. Claiming an email therefore relies on nobody registering
 * someone else's address; account creation queues a mail to the address
 * so the real owner at least hears about it. Wire up sending, then
 * require a verified link here before the record is claimed.
 */

const crypto = require('node:crypto');
const store = require('./db');
const { sendJson, parseCookies } = require('./http');
const { createThrottle } = require('./throttle');

const SESSION_COOKIE = 'vayu_customer_sid';
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days — a shopper is not an admin
const MIN_PASSWORD = 8;

/* ---------- sessions ---------- */

function pruneSessions() {
  const now = Date.now();
  for (const [tok, s] of Object.entries(store.db.customerSessions)) {
    if (s.expires < now) delete store.db.customerSessions[tok];
  }
}

/** The signed-in customer, or null. Safe to call on any request. */
function currentCustomer(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const sess = store.db.customerSessions?.[token];
  if (!sess || sess.expires < Date.now()) return null;
  const customer = store.customerById(sess.customerId);
  // A record whose password was cleared is no longer an account.
  return customer?.hash ? customer : null;
}

function createSession(res, customerId) {
  pruneSessions();
  const token = crypto.randomBytes(32).toString('hex');
  store.db.customerSessions[token] = { customerId, expires: Date.now() + SESSION_TTL };
  store.save();
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`);
}

function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) delete store.db.customerSessions[token];
  store.save();
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/* ---------- what the storefront is allowed to see ---------- */

/**
 * The fields checkout needs from a customer. `missing` is the whole point
 * of the shape: the checkout form asks only for what is not here yet.
 */
const CHECKOUT_FIELDS = ['name', 'email', 'phone', 'address', 'city', 'pin'];
const REQUIRED_FIELDS = ['name', 'email', 'phone', 'address', 'pin'];

/** Address the shopper marked default, else the most recently added. */
function defaultAddress(customer) {
  const list = customer.addresses || [];
  return list.find(a => a.isDefault) || list[list.length - 1] || null;
}

/**
 * Merge the account's own fields with its default address. The address
 * book wins for delivery fields, since that is the more deliberate entry.
 */
function checkoutDetails(customer) {
  const addr = defaultAddress(customer) || {};
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

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name || '',
    email: customer.email,
    phone: customer.phone || '',
    ordersCount: customer.ordersCount || 0,
    addresses: customer.addresses || [],
    details: checkoutDetails(customer),
  };
}

/* ---------- validation ---------- */

// Split on the dots explicitly rather than letting two greedy classes fight
// over them — same shape, no backtracking.
const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

const cleanEmail = (v) => String(v || '').toLowerCase().trim();
const cleanText = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function passwordError(password) {
  if (String(password || '').length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters`;
  }
  return null;
}

/* ---------- routes: open ---------- */

const throttle = createThrottle();

/**
 * Create an account, or claim the guest record that already carries this
 * email. Claiming is what makes "I ordered once as a guest, now I want an
 * account" keep its orders.
 */
function register({ res, body }) {
  const email = cleanEmail(body.email);
  const name = cleanText(body.name, 120);
  if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: 'Please enter a valid email address' });
  if (!name) return sendJson(res, 400, { error: 'Please enter your name' });

  const pwError = passwordError(body.password);
  if (pwError) return sendJson(res, 400, { error: pwError });

  const now = new Date().toISOString();
  let customer = store.customerByEmail(email);

  if (customer?.hash) {
    return sendJson(res, 409, { error: 'An account with this email already exists — please sign in' });
  }

  if (!customer) {
    customer = {
      id: store.nextId('cust'),
      name,
      email,
      phone: cleanText(body.phone, 20),
      address: '',
      addresses: [],
      ordersCount: 0,
      totalSpent: 0,
      firstSeen: now,
      lastSeen: now,
      source: 'account',
      notes: '',
      tags: [],
      salt: null,
      hash: null,
    };
    store.db.customers.push(customer);
  } else {
    customer.name = name || customer.name;
    if (body.phone) customer.phone = cleanText(body.phone, 20);
  }

  Object.assign(customer, store.hashPassword(body.password));
  customer.accountCreatedAt = now;
  customer.lastSeen = now;

  store.queueEmail(email, 'Vayu — your account is ready',
    `Namaste ${customer.name},\n\nAn account was created for this email address at Vayu.`
    + `\n\nIf that was not you, reply to this message and we will remove it.\n\n— Vayu`,
    'account.created');
  store.logActivity('system', 'account.register', `${email} created a customer account`);
  createSession(res, customer.id);
  store.save();
  sendJson(res, 201, { ok: true, customer: publicCustomer(customer) });
}

function login({ req, res, body }) {
  if (throttle.blocked(req)) {
    return sendJson(res, 429, { error: `Too many attempts. Try again in ${throttle.retryAfterMinutes} minutes.` });
  }
  const customer = store.customerByEmail(body.email);
  // Same message either way: whether an email has an account is not ours
  // to disclose to whoever is guessing.
  if (!customer?.hash || !store.verifyPassword(body.password || '', customer.salt, customer.hash)) {
    throttle.noteFailure(req);
    return sendJson(res, 401, { error: 'Invalid email or password' });
  }
  throttle.clear(req);
  customer.lastSeen = new Date().toISOString();
  createSession(res, customer.id);
  store.save();
  sendJson(res, 200, { ok: true, customer: publicCustomer(customer) });
}

function logout({ req, res }) {
  destroySession(req, res);
  sendJson(res, 200, { ok: true });
}

/**
 * Who is signed in. Always 200 — the storefront asks this on every
 * checkout and a signed-out shopper is a normal answer, not an error.
 */
function me({ res, customer }) {
  sendJson(res, 200, customer
    ? { signedIn: true, customer: publicCustomer(customer) }
    : { signedIn: false });
}

/* ---------- routes: signed in ---------- */

function updateProfile({ res, customer, body }) {
  if (body.name !== undefined) customer.name = cleanText(body.name, 120) || customer.name;
  if (body.phone !== undefined) customer.phone = cleanText(body.phone, 20);
  customer.lastSeen = new Date().toISOString();
  store.save();
  sendJson(res, 200, { ok: true, customer: publicCustomer(customer) });
}

function changePassword({ res, customer, body }) {
  if (!store.verifyPassword(body.current || '', customer.salt, customer.hash)) {
    return sendJson(res, 400, { error: 'Current password is incorrect' });
  }
  const pwError = passwordError(body.next);
  if (pwError) return sendJson(res, 400, { error: pwError });
  Object.assign(customer, store.hashPassword(body.next));
  store.save();
  sendJson(res, 200, { ok: true });
}

/** Build one address record from a request body. Returns { error } or { address }. */
function readAddress(body, existing) {
  const address = {
    id: existing?.id || store.nextId('addr'),
    label: cleanText(body.label, 40) || 'Address',
    name: cleanText(body.name, 120),
    phone: cleanText(body.phone, 20),
    address: cleanText(body.address, 400),
    city: cleanText(body.city, 80),
    pin: cleanText(body.pin, 12),
    isDefault: !!body.isDefault,
  };
  if (!address.address) return { error: 'Please enter the street address' };
  if (!address.pin) return { error: 'Please enter the PIN code' };
  return { address };
}

/** Only one address may carry the default flag. */
function applyDefault(customer, address) {
  if (!address.isDefault) {
    // The first address saved is the default whether or not it was ticked.
    if (customer.addresses.length === 1) customer.addresses[0].isDefault = true;
    return;
  }
  for (const a of customer.addresses) a.isDefault = a.id === address.id;
}

function addresses(ctx) {
  const { res, method, customer, body, parts } = ctx;
  const [id] = parts;

  if (method === 'GET') return sendJson(res, 200, { addresses: customer.addresses });

  if (method === 'POST' && !id) {
    const r = readAddress(body);
    if (r.error) return sendJson(res, 400, { error: r.error });
    customer.addresses.push(r.address);
    applyDefault(customer, r.address);
    store.save();
    return sendJson(res, 201, { ok: true, customer: publicCustomer(customer) });
  }

  const existing = customer.addresses.find(a => a.id === id);
  if (!existing) return sendJson(res, 404, { error: 'Address not found' });

  if (method === 'PUT') {
    const r = readAddress(body, existing);
    if (r.error) return sendJson(res, 400, { error: r.error });
    Object.assign(existing, r.address);
    applyDefault(customer, existing);
    store.save();
    return sendJson(res, 200, { ok: true, customer: publicCustomer(customer) });
  }

  if (method === 'DELETE') {
    customer.addresses = customer.addresses.filter(a => a.id !== id);
    // Never leave the book without a default to fall back on.
    if (customer.addresses.length && !customer.addresses.some(a => a.isDefault)) {
      customer.addresses[0].isDefault = true;
    }
    store.save();
    return sendJson(res, 200, { ok: true, customer: publicCustomer(customer) });
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}

/**
 * This customer's orders. Matched on the customer id the order was written
 * with, falling back to the email so guest orders placed before the
 * account existed still appear.
 */
function orders({ res, customer }) {
  const mine = store.db.orders.filter(o =>
    o.customer?.id === customer.id
    || String(o.customer?.email || '').toLowerCase() === customer.email);

  sendJson(res, 200, {
    orders: mine.map(o => ({
      number: o.number,
      createdAt: o.createdAt,
      status: o.status,
      items: o.items.map(i => ({ name: i.name, qty: i.qty, price: i.price, variant: i.variant, img: i.img })),
      subtotal: o.subtotal,
      discount: o.discount,
      shipping: o.shipping,
      total: o.total,
      payment: o.payment?.method || 'cod',
      address: [o.customer?.address, o.customer?.city, o.customer?.pin].filter(Boolean).join(', '),
      timeline: o.timeline || [],
    })),
  });
}

/* ---------- dispatch ---------- */

/** Endpoints anyone may call; everything else needs a signed-in customer. */
const OPEN = {
  'POST register': register,
  'POST login': login,
  'POST logout': logout,
  'GET me': me,
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
function route(ctx, section) {
  const { res, method } = ctx;
  const customer = currentCustomer(ctx.req);
  const full = { ...ctx, customer };

  const open = OPEN[`${method} ${section}`];
  if (open) return open(full);

  if (!customer) return sendJson(res, 401, { error: 'Please sign in' });

  if (section === 'addresses') return addresses(full);

  const priv = PRIVATE[`${method} ${section}`];
  if (priv) return priv(full);

  return sendJson(res, 404, { error: 'Not found' });
}

/** Save a delivery address the shopper used at checkout, if it is new. */
function rememberAddress(customer, details, label = 'Delivery address') {
  if (!details.address || !details.pin) return;
  const same = (customer.addresses || []).some(a =>
    a.address === details.address && a.pin === details.pin);
  if (same) return;

  customer.addresses ||= [];
  customer.addresses.push({
    id: store.nextId('addr'),
    label,
    name: details.name || '',
    phone: details.phone || '',
    address: details.address,
    city: details.city || '',
    pin: details.pin,
    isDefault: !customer.addresses.length,
  });
}

module.exports = {
  route,
  currentCustomer,
  checkoutDetails,
  defaultAddress,
  rememberAddress,
  CHECKOUT_FIELDS,
};
