/**
 * Vayu — the oversell window at payment confirmation.
 *
 * Drives the real /api/checkout + /api/checkout/confirm pair against a live
 * worker, with the stock deliberately sold out underneath the pending order
 * between the two calls — which is exactly what a second shopper does during
 * the up-to-an-hour window a card payment can sit in.
 *
 *   ADMIN_PASSWORD=... node scripts/checkout-oversell-test.mjs
 */
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PASSWORD = process.env.ADMIN_PASSWORD || 'local-test-pass';
let cookie = '';
let pass = 0, fail = 0;

async function call(path, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      origin: BASE,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setC = res.headers.get('set-cookie');
  if (setC) cookie = setC.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { /* none */ }
  return { status: res.status, data };
}

const admin = (p, m, b) => call(`/api/admin/${p}`, m, b);

/**
 * Run SQL against the local D1. Two things here have no API: seeding the
 * pending payment row, and removing the order afterwards — orders are
 * deliberately not deletable through the panel, which is right for a shop
 * and inconvenient for a test.
 */
function sql(text) {
  const file = join(tmpdir(), `oversell-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(file, text);
  try {
    execFileSync(process.execPath,
      [join('node_modules', 'wrangler', 'bin', 'wrangler.js'),
        'd1', 'execute', 'vayu-db', '--local', '--file', file],
      { encoding: 'utf8', stdio: 'pipe' });
  } finally { rmSync(file, { force: true }); }
}
async function step(name, fn) {
  try { const m = await fn(); pass++; console.log(`PASS  ${name}${m ? ` — ${m}` : ''}`); }
  catch (e) { fail++; console.log(`FAIL  ${name} — ${e.message}`); }
}
const must = (c, m) => { if (!c) throw new Error(m); };

await admin('login', 'POST', { email: 'admin@vayu.com', password: PASSWORD });

// Razorpay in test mode: put a known secret in so the signature we forge
// below is the one the handler expects.
const settingsBefore = (await admin('settings')).data.settings;
const SECRET = 'test_secret_for_oversell_check';
await admin('settings', 'PUT', {
  ...settingsBefore,
  payment: { provider: 'razorpay', razorpayKeyId: 'rzp_test_key', razorpayKeySecret: SECRET },
});

// A product with exactly one in stock.
const made = await admin('products', 'POST', {
  name: 'Oversell Probe', price: 1000, status: 'active', stock: 1,
  img: '/assets/images/cat_objects.png', gallery: ['/assets/images/cat_objects.png'],
  categories: [{ cat: 'decor', sub: '' }],
});
const productId = made.data.product.id;

const customer = {
  name: 'Test Buyer', email: 'buyer@example.com', phone: '9999999999',
  address: '1 Test Street', city: 'Jaipur', pin: '302001',
};

/*
 * The pending order is seeded straight into D1 rather than gone after
 * through /api/checkout, because that endpoint's last act is a live call to
 * Razorpay to open a gateway order. With no real key that fails with
 * "Authentication failed", and the gateway is not what is under test — the
 * window *after* it is. This writes exactly the row putPending() writes.
 */
const rzpOrderId = `order_oversell_${Date.now()}`;
await step('an order is priced and held pending payment', async () => {
  const prep = {
    lines: [{
      productId, variantId: null, name: 'Oversell Probe',
      price: 1000, qty: 1, img: '/assets/images/cat_objects.png', variant: null,
    }],
    customer, subtotal: 1000, discount: 0, couponCode: null, shipping: 150,
    total: 1150, sid: '', accountId: null, saveAddress: false,
  };
  const items = JSON.stringify(prep).replaceAll("'", "''");
  sql(`INSERT INTO carts (sid, items, total, updated_at)
       VALUES ('pending:${rzpOrderId}', '${items}', 1150, '${new Date().toISOString()}');`);
  return rzpOrderId;
});

await step('another shopper takes the last one', async () => {
  const r = await admin(`products/${productId}`, 'PUT', {
    name: 'Oversell Probe', price: 1000, status: 'active', stock: 0,
    img: '/assets/images/cat_objects.png', gallery: ['/assets/images/cat_objects.png'],
    categories: [{ cat: 'decor', sub: '' }],
  });
  must(r.status === 200, 'could not zero the stock');
  return 'stock now 0';
});

await step('confirm accepts the paid order and flags the shortfall', async () => {
  const paymentId = 'pay_testoversell';
  const signature = createHmac('sha256', SECRET).update(`${rzpOrderId}|${paymentId}`).digest('hex');
  const r = await call('/api/checkout/confirm', 'POST', {
    rzpOrderId, rzpPaymentId: paymentId, rzpSignature: signature,
  });
  must(r.status === 201, `expected the order to stand, got ${r.status} ${JSON.stringify(r.data)}`);
  must(Array.isArray(r.data.delayed) && r.data.delayed.length === 1,
    `expected a delayed line, got ${JSON.stringify(r.data.delayed)}`);
  return `order ${r.data.number}, delayed: ${r.data.delayed.join(', ')}`;
});

await step('stock never goes negative', async () => {
  const p = (await admin('products')).data.products.find(x => x.id === productId);
  must(p.stock === 0, `stock is ${p.stock}, expected 0`);
  return 'floored at 0';
});

await step('the shortfall is on the order timeline', async () => {
  const orders = (await admin('orders')).data.orders;
  const order = orders.find(o => o.customer?.email === customer.email);
  must(order, 'order not found');
  const notes = (order.timeline || []).map(t => t.note).join(' | ');
  must(/Oversold/i.test(notes), `no oversold note: ${notes}`);
  return notes.split('|').find(n => /Oversold/i.test(n)).trim();
});

await step('the shop is emailed about it', async () => {
  const out = (await admin('outbox')).data;
  const mails = out.outbox || out.messages || [];
  must(mails.some(m => m.kind === 'order.oversold' || /do not have/i.test(m.subject || '')),
    'no oversold email queued');
  return 'queued';
});

/* ---- put everything back ---- */
await admin(`products/${productId}`, 'DELETE');
await admin('settings', 'PUT', settingsBefore);
sql(`
  DELETE FROM order_timeline WHERE order_id IN (SELECT id FROM orders WHERE email = '${customer.email}');
  DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE email = '${customer.email}');
  DELETE FROM orders WHERE email = '${customer.email}';
  DELETE FROM customers WHERE email = '${customer.email}';
  DELETE FROM outbox WHERE event = 'order.oversold' OR to_addr = '${customer.email}';
  DELETE FROM carts WHERE sid = 'pending:${rzpOrderId}';
  DELETE FROM inventory_log WHERE name LIKE 'Oversell Probe%';
  DELETE FROM products WHERE name LIKE 'Oversell Probe%';
`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
