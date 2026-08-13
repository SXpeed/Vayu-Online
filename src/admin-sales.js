/**
 * Vayu admin — everything downstream of a sale: orders and their invoices,
 * customers, coupons, and review moderation.
 */

import { json, ok, html, badRequest, methodNotAllowed, escHtml, resource } from './http.js';
import { now, normPhone, formatPrice as inr } from './db.js';
import { loadProduct, totalStock, fireStockAlerts } from './catalogue.js';
import { withItems } from './admin-insights.js';

/* ================= orders ================= */

const ORDER_STATUSES = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];

// Statuses worth writing to the customer about. 'new' is absent because the
// confirmation mail already went out when the order was placed.
const STATUS_MAIL = {
  processing: 'is being prepared',
  shipped: 'has shipped and is on its way',
  delivered: 'has been delivered — we hope you love it',
  cancelled: 'has been cancelled. If this is unexpected, please write to us',
};

/** Put a cancelled order's stock back, on the variant it came from. */
async function restock(store, order, admin) {
  for (const l of order.items) {
    const product = await loadProduct(store, l.productId);
    if (!product) continue;

    const variant = l.variant ? (product.variants || []).find(v => v.label === l.variant) : null;
    const wasOut = totalStock(product) <= 0;

    await store.batch([
      variant
        ? store.stmt('UPDATE product_variants SET stock = stock + ? WHERE id = ?', l.qty, variant.id)
        : store.stmt('UPDATE products SET stock = stock + ? WHERE id = ?', l.qty, product.id),
      store.stmt('UPDATE products SET sold = MAX(0, sold - ?) WHERE id = ?', l.qty, product.id),
    ]);

    await store.logInventory(
      product.id, product.name + (l.variant ? ` — ${l.variant}` : ''), l.qty,
      `order ${order.number} cancelled`, admin.name,
    );
    if (wasOut) await fireStockAlerts(store, await loadProduct(store, product.id));
  }
}

export function orders(ctx) {
  const { store } = ctx;
  return resource(ctx, {
    notFound: 'Order not found',
    find: (id) => store.row('orders', 'id', id),

    async list() {
      const rows = await store.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500');
      return json(200, { orders: await withItems(store, rows, { timeline: true }) });
    },

    async update({ admin, body }, row) {
      const status = String(body.status || '');
      if (!ORDER_STATUSES.includes(status)) return badRequest('Invalid status');

      const [order] = await withItems(store, [row], { timeline: true });
      if (status === 'cancelled' && row.status !== 'cancelled') await restock(store, order, admin);

      const previous = row.status;
      const stamp = now();
      await store.batch([
        store.stmt('UPDATE orders SET status = ? WHERE id = ?', status, row.id),
        store.stmt('INSERT INTO order_timeline (order_id, t, status, note) VALUES (?, ?, ?, ?)',
          row.id, stamp, status, body.note || `Marked ${status} by ${admin.name}`),
      ]);

      if (status !== previous && STATUS_MAIL[status]) {
        await store.queueEmail(
          row.email,
          `Vayu — order ${row.number} ${status}`,
          `Namaste ${row.name},\n\nYour order ${row.number} ${STATUS_MAIL[status]}.\n\n— Vayu`,
          'order.' + status,
        );
      }
      await store.logActivity(admin.name, 'order.status', `Order ${row.number} → ${status}`);

      const [fresh] = await withItems(store, [await store.row('orders', 'id', row.id)], { timeline: true });
      return json(200, { order: fresh });
    },

    actions: {
      async invoice({ method }, row) {
        if (method !== 'GET') return methodNotAllowed();
        const [order] = await withItems(store, [row]);
        return html(await invoiceHtml(store, order));
      },
    },
  });
}

/* ---------- printable invoice ---------- */

const INVOICE_CSS = `
  body{font-family:Georgia,serif;color:#141210;max-width:720px;margin:40px auto;padding:0 20px}
  h1{font-size:34px;letter-spacing:.18em;margin:0} .tag{color:#9E3A26;letter-spacing:.3em;font-size:11px;text-transform:uppercase}
  .row{display:flex;justify-content:space-between;margin:28px 0;gap:20px} .row div{font-size:14px;line-height:1.7}
  .mut{color:#777} table{width:100%;border-collapse:collapse;font-size:14px}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.12em;text-align:left;border-bottom:1.5px solid #141210;padding:8px 6px}
  td{padding:9px 6px;border-bottom:1px solid #e5e0d5} .num{text-align:right}
  .totals{margin-top:14px;margin-left:auto;width:280px;font-size:14px} .totals div{display:flex;justify-content:space-between;padding:4px 0}
  .totals .grand{border-top:1.5px solid #141210;font-weight:bold;margin-top:6px;padding-top:8px}
  .foot{margin-top:44px;font-size:12px;color:#777} @media print{.noprint{display:none}}
  .noprint{margin:24px 0}.noprint button{padding:10px 24px;font-size:13px;cursor:pointer}`;

async function invoiceHtml(store, o) {
  const s = await store.settings();

  const address = [
    escHtml(o.customer.address),
    o.customer.city ? ', ' + escHtml(o.customer.city) : '',
    o.customer.pin ? ' — ' + escHtml(o.customer.pin) : '',
  ].join('');

  const rows = o.items.map(l => {
    const variant = l.variant ? ` <span class="mut">(${escHtml(l.variant)})</span>` : '';
    return `
    <tr><td>${escHtml(l.name)}${variant}</td>
        <td class="num">${l.qty}</td><td class="num">${inr(l.price)}</td><td class="num">${inr(l.price * l.qty)}</td></tr>`;
  }).join('');

  const couponLabel = o.coupon ? ` (${escHtml(o.coupon)})` : '';
  const discountRow = o.discount
    ? `<div><span>Discount${couponLabel}</span><span>−${inr(o.discount)}</span></div>`
    : '';

  const footer = [
    escHtml(s.storeAddress || ''),
    s.storeEmail ? ' · ' + escHtml(s.storeEmail) : '',
    s.storePhone ? ' · ' + escHtml(s.storePhone) : '',
  ].join('');

  const invoiceDate = new Date(o.createdAt)
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${escHtml(o.number)}</title>
<style>${INVOICE_CSS}
</style></head><body>
<div class="noprint"><button onclick="print()">Print / Save as PDF</button></div>
<h1>${escHtml(s.storeName || 'VAYU')}</h1><div class="tag">Tax Invoice · ${escHtml(o.number)}</div>
<div class="row">
  <div><b>Billed to</b><br>${escHtml(o.customer.name)}<br>${address}<br>${escHtml(o.customer.email)}<br>${escHtml(o.customer.phone)}</div>
  <div style="text-align:right"><b>Invoice date</b><br>${invoiceDate}<br><b>Status</b> ${escHtml(o.status)}<br><b>Payment</b> ${escHtml(o.payment?.method || 'cod')}</div>
</div>
<table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
  <div><span>Subtotal</span><span>${inr(o.subtotal)}</span></div>
  ${discountRow}
  <div><span>Shipping</span><span>${o.shipping ? inr(o.shipping) : 'Free'}</span></div>
  <div class="grand"><span>Total</span><span>${inr(o.total)}</span></div>
</div>
<div class="foot">${footer}</div>
</body></html>`;
}

/* ================= customers ================= */

/**
 * A customer as the panel may see them. Since customers can hold a
 * password, the credential columns are never selected — nothing outside
 * the sign-in check needs them, and they must not travel to a browser even
 * an owner's one. `hasAccount` carries the one bit of that worth showing.
 */
const CUSTOMER_COLUMNS = `id, email, name, phone, address, city, pin, orders_count, total_spent,
  first_seen, last_seen, source, notes, account_created_at, (hash IS NOT NULL) AS has_account`;

const customerRow = (c, tags = []) => ({
  id: c.id,
  email: c.email,
  name: c.name,
  phone: c.phone,
  address: c.address,
  city: c.city,
  pin: c.pin,
  ordersCount: c.orders_count,
  totalSpent: c.total_spent,
  firstSeen: c.first_seen,
  lastSeen: c.last_seen,
  source: c.source,
  notes: c.notes,
  hasAccount: !!c.has_account,
  accountCreatedAt: c.account_created_at,
  tags,
});

export function customers(ctx) {
  const { store } = ctx;
  return resource(ctx, {
    notFound: 'Customer not found',
    find: (id) => store.row('customers', 'id', id),

    async list() {
      // Orders ride along in a trimmed shape so the panel can show each
      // customer's history without a second request per row.
      const [rows, tags, subscribers, orders] = await Promise.all([
        store.all(`SELECT ${CUSTOMER_COLUMNS} FROM customers ORDER BY last_seen DESC`),
        store.all('SELECT customer_id, tag FROM customer_tags'),
        store.all('SELECT email, t, source FROM subscribers ORDER BY t DESC'),
        store.all('SELECT id, number, total, status, created_at, email FROM orders ORDER BY created_at DESC'),
      ]);

      return json(200, {
        customers: rows.map(c => customerRow(c, tags.filter(t => t.customer_id === c.id).map(t => t.tag))),
        subscribers,
        orders: orders.map(o => ({
          id: o.id, number: o.number, total: o.total,
          status: o.status, createdAt: o.created_at, email: o.email,
        })),
      });
    },

    async update({ body }, customer) {
      if (body.notes !== undefined) {
        await store.update('customers', 'id', customer.id, { notes: String(body.notes).slice(0, 2000) });
      }
      if (Array.isArray(body.tags)) {
        const tags = body.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 12);
        await store.batch([
          store.stmt('DELETE FROM customer_tags WHERE customer_id = ?', customer.id),
          ...tags.map(t => store.stmt('INSERT INTO customer_tags (customer_id, tag) VALUES (?, ?)', customer.id, t)),
        ]);
      }
      const fresh = await store.one(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ?`, customer.id);
      const tags = await store.all('SELECT tag FROM customer_tags WHERE customer_id = ?', customer.id);
      return json(200, { customer: customerRow(fresh, tags.map(t => t.tag)) });
    },
  });
}

/* ================= coupons ================= */

function sanitizeCoupon(body, existing) {
  const c = existing || {};
  const restrict = body.restrictTo || {};
  return {
    code: String(body.code ?? c.code ?? '').toUpperCase().trim().replaceAll(/[^A-Z0-9_-]/g, '').slice(0, 24),
    type: ['percent', 'flat'].includes(body.type) ? body.type : (c.type || 'percent'),
    value: Math.max(0, Number(body.value ?? c.value) || 0),
    min_order: Math.max(0, Number(body.minOrder ?? c.min_order) || 0),
    expires_at: body.expiresAt !== undefined
      ? (body.expiresAt ? new Date(body.expiresAt).toISOString() : null)
      : (c.expires_at || null),
    usage_limit: Math.max(0, Math.round(Number(body.usageLimit ?? c.usage_limit) || 0)),
    per_customer_limit: Math.max(0, Math.round(Number(body.perCustomerLimit ?? c.per_customer_limit) || 0)),
    active: (body.active != null ? !!body.active : c.active !== 0) ? 1 : 0,
    // Empty lists mean "anyone"; a filled list narrows the coupon to those
    // customers, matched on either channel at checkout.
    emails: (Array.isArray(restrict.emails) ? restrict.emails : [])
      .map(e => String(e).toLowerCase().trim()).filter(Boolean),
    phones: (Array.isArray(restrict.phones) ? restrict.phones : [])
      .map(p => normPhone(p)).filter(p => p.length === 10),
  };
}

async function couponRow(store, c) {
  const restrictions = await store.all('SELECT kind, value FROM coupon_restrictions WHERE coupon_id = ?', c.id);
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: c.value,
    minOrder: c.min_order,
    expiresAt: c.expires_at,
    usageLimit: c.usage_limit,
    perCustomerLimit: c.per_customer_limit,
    active: !!c.active,
    usedCount: c.used_count,
    createdAt: c.created_at,
    restrictTo: {
      emails: restrictions.filter(r => r.kind === 'email').map(r => r.value),
      phones: restrictions.filter(r => r.kind === 'phone').map(r => r.value),
    },
  };
}

/** Replace a coupon's restriction rows to match the submitted lists. */
const restrictionStatements = (store, couponId, data) => [
  store.stmt('DELETE FROM coupon_restrictions WHERE coupon_id = ?', couponId),
  ...data.emails.map(e => store.stmt(
    `INSERT INTO coupon_restrictions (coupon_id, kind, value) VALUES (?, 'email', ?)`, couponId, e)),
  ...data.phones.map(p => store.stmt(
    `INSERT INTO coupon_restrictions (coupon_id, kind, value) VALUES (?, 'phone', ?)`, couponId, p)),
];

export function coupons(ctx) {
  const { store } = ctx;

  const duplicateCode = (code, exceptId) => store.one(
    'SELECT id FROM coupons WHERE code = ? AND id IS NOT ?', code, exceptId ?? null,
  );

  return resource(ctx, {
    notFound: 'Coupon not found',
    find: (id) => store.row('coupons', 'id', id),

    async list() {
      const rows = await store.all('SELECT * FROM coupons ORDER BY created_at DESC');
      return json(200, { coupons: await Promise.all(rows.map(c => couponRow(store, c))) });
    },

    async create({ admin, body }) {
      const data = sanitizeCoupon(body);
      if (!data.code || !data.value) return badRequest('Code and value are required');
      if (await duplicateCode(data.code)) return json(409, { error: 'That code already exists' });

      const id = await store.nextId('cpn');
      await store.batch([
        store.stmt(
          `INSERT INTO coupons
            (id, code, type, value, min_order, expires_at, usage_limit, per_customer_limit,
             active, used_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          id, data.code, data.type, data.value, data.min_order, data.expires_at,
          data.usage_limit, data.per_customer_limit, data.active, now(),
        ),
        ...restrictionStatements(store, id, data),
      ]);
      await store.logActivity(admin.name, 'coupon.create', `Created coupon ${data.code}`);
      return json(201, { coupon: await couponRow(store, await store.row('coupons', 'id', id)) });
    },

    async update({ admin, body }, coupon) {
      const data = sanitizeCoupon(body, coupon);
      if (!data.code || !data.value) return badRequest('Code and value are required');
      if (await duplicateCode(data.code, coupon.id)) return json(409, { error: 'That code already exists' });

      const { emails, phones, ...columns } = data;
      await store.update('coupons', 'id', coupon.id, columns);
      await store.batch(restrictionStatements(store, coupon.id, data));
      await store.logActivity(admin.name, 'coupon.update', `Updated coupon ${data.code}`);
      return json(200, { coupon: await couponRow(store, await store.row('coupons', 'id', coupon.id)) });
    },

    async remove({ admin }, coupon) {
      await store.remove('coupons', 'id', coupon.id);
      await store.logActivity(admin.name, 'coupon.delete', `Deleted coupon ${coupon.code}`);
      return ok();
    },
  });
}

/* ================= review moderation ================= */

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

const reviewRow = (r) => ({
  id: r.id, productId: r.product_id, productName: r.product_name,
  name: r.name, email: r.email, rating: r.rating, text: r.text,
  status: r.status, t: r.t,
});

export function reviews(ctx) {
  const { store } = ctx;
  return resource(ctx, {
    notFound: 'Review not found',
    find: (id) => store.row('reviews', 'id', id),

    async list() {
      const rows = await store.all('SELECT * FROM reviews ORDER BY t DESC LIMIT 500');
      return json(200, { reviews: rows.map(reviewRow) });
    },

    async update({ admin, body }, review) {
      if (!REVIEW_STATUSES.includes(body.status)) return badRequest('Bad status');
      await store.update('reviews', 'id', review.id, { status: body.status });
      await store.logActivity(admin.name, 'review.' + body.status,
        `Review of "${review.product_name}" by ${review.name}`);
      return json(200, { review: reviewRow({ ...review, status: body.status }) });
    },

    async remove(_ctx, review) {
      await store.remove('reviews', 'id', review.id);
      return ok();
    },
  });
}
