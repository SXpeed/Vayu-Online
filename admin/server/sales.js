/**
 * Vayu admin — everything downstream of a sale: orders and their invoices,
 * customers, coupons, and review moderation.
 */

const store = require('./db');
const { sendJson, sendHtml, escHtml, resource } = require('./http');

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
function restock(order, admin) {
  for (const l of order.items) {
    const p = store.productById(l.productId);
    if (!p) continue;
    const variant = l.variant ? (p.variants || []).find(x => x.label === l.variant) : null;
    const wasOut = store.totalStock(p) <= 0;

    if (variant) variant.stock += l.qty;
    else p.stock += l.qty;
    p.sold = Math.max(0, (p.sold || 0) - l.qty);

    store.logInventory(
      p.id, p.name + (l.variant ? ` — ${l.variant}` : ''), l.qty,
      `order ${order.number} cancelled`, admin.name,
    );
    if (wasOut) store.fireStockAlerts(p);
  }
}

function orders(ctx) {
  return resource(ctx, {
    notFound: 'Order not found',
    find: (id) => store.db.orders.find(o => o.id === id),

    list({ res }) {
      sendJson(res, 200, { orders: store.db.orders });
    },

    update({ res, admin, body }, order) {
      const status = String(body.status || '');
      if (!ORDER_STATUSES.includes(status)) return sendJson(res, 400, { error: 'Invalid status' });

      if (status === 'cancelled' && order.status !== 'cancelled') restock(order, admin);

      const previous = order.status;
      order.status = status;
      order.timeline.push({
        t: new Date().toISOString(), status,
        note: body.note || `Marked ${status} by ${admin.name}`,
      });

      if (status !== previous && STATUS_MAIL[status]) {
        store.queueEmail(
          order.customer.email,
          `Vayu — order ${order.number} ${status}`,
          `Namaste ${order.customer.name},\n\nYour order ${order.number} ${STATUS_MAIL[status]}.\n\n— Vayu`,
          'order.' + status,
        );
      }
      store.logActivity(admin.name, 'order.status', `Order ${order.number} → ${status}`);
      store.save();
      sendJson(res, 200, { order });
    },

    actions: {
      invoice({ res, method }, order) {
        if (method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
        sendHtml(res, invoiceHtml(order));
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

const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN');

function invoiceHtml(o) {
  const s = store.db.settings;

  const address = [
    escHtml(o.customer.address),
    o.customer.city ? ', ' + escHtml(o.customer.city) : '',
    o.customer.pin ? ' — ' + escHtml(o.customer.pin) : '',
  ].join('');

  const rows = o.items.map(l => `
    <tr><td>${escHtml(l.name)}${l.variant ? ` <span class="mut">(${escHtml(l.variant)})</span>` : ''}</td>
        <td class="num">${l.qty}</td><td class="num">${inr(l.price)}</td><td class="num">${inr(l.price * l.qty)}</td></tr>`).join('');

  const discountRow = o.discount
    ? `<div><span>Discount${o.coupon ? ` (${escHtml(o.coupon)})` : ''}</span><span>−${inr(o.discount)}</span></div>`
    : '';

  const footer = [
    escHtml(s.storeAddress || ''),
    s.storeEmail ? ' · ' + escHtml(s.storeEmail) : '',
    s.storePhone ? ' · ' + escHtml(s.storePhone) : '',
  ].join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${escHtml(o.number)}</title>
<style>${INVOICE_CSS}
</style></head><body>
<div class="noprint"><button onclick="print()">Print / Save as PDF</button></div>
<h1>${escHtml(s.storeName || 'VAYU')}</h1><div class="tag">Tax Invoice · ${escHtml(o.number)}</div>
<div class="row">
  <div><b>Billed to</b><br>${escHtml(o.customer.name)}<br>${address}<br>${escHtml(o.customer.email)}<br>${escHtml(o.customer.phone)}</div>
  <div style="text-align:right"><b>Invoice date</b><br>${new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}<br><b>Status</b> ${escHtml(o.status)}<br><b>Payment</b> ${escHtml(o.payment?.method || 'cod')}</div>
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
 * password (accounts.js), the credential fields have to be stripped here —
 * nothing outside the sign-in check ever needs them, and they must not
 * travel to a browser even an owner's one. `hasAccount` carries the one
 * bit of that which the panel genuinely wants to show.
 */
function publicCustomer({ salt, hash, ...rest }) {
  return { ...rest, hasAccount: !!hash };
}

function customers(ctx) {
  return resource(ctx, {
    notFound: 'Customer not found',
    find: (id) => store.db.customers.find(c => c.id === id),

    list({ res }) {
      // Orders ride along in a trimmed shape so the panel can show each
      // customer's history without a second request per row.
      sendJson(res, 200, {
        customers: store.db.customers.map(publicCustomer),
        subscribers: store.db.subscribers,
        orders: store.db.orders.map(o => ({
          id: o.id, number: o.number, total: o.total,
          status: o.status, createdAt: o.createdAt, email: o.customer.email,
        })),
      });
    },

    update({ res, body }, cust) {
      if (body.notes !== undefined) cust.notes = String(body.notes).slice(0, 2000);
      if (Array.isArray(body.tags)) {
        cust.tags = body.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 12);
      }
      store.save();
      sendJson(res, 200, { customer: publicCustomer(cust) });
    },
  });
}

/* ================= coupons ================= */

function sanitizeCoupon(body, existing) {
  const c = existing || {};
  const restrict = body.restrictTo || c.restrictTo || {};
  return {
    code: String(body.code ?? c.code ?? '').toUpperCase().trim().replaceAll(/[^A-Z0-9_-]/g, '').slice(0, 24),
    type: ['percent', 'flat'].includes(body.type) ? body.type : (c.type || 'percent'),
    value: Math.max(0, Number(body.value ?? c.value) || 0),
    minOrder: Math.max(0, Number(body.minOrder ?? c.minOrder) || 0),
    expiresAt: body.expiresAt !== undefined
      ? (body.expiresAt ? new Date(body.expiresAt).toISOString() : null)
      : (c.expiresAt || null),
    usageLimit: Math.max(0, Math.round(Number(body.usageLimit ?? c.usageLimit) || 0)),
    perCustomerLimit: Math.max(0, Math.round(Number(body.perCustomerLimit ?? c.perCustomerLimit) || 0)),
    active: body.active != null ? !!body.active : (c.active !== false),
    // Empty lists mean "anyone"; a filled list narrows the coupon to those
    // customers, matched on either channel at checkout.
    restrictTo: {
      emails: (Array.isArray(restrict.emails) ? restrict.emails : [])
        .map(e => String(e).toLowerCase().trim()).filter(Boolean),
      phones: (Array.isArray(restrict.phones) ? restrict.phones : [])
        .map(p => store.normPhone(p)).filter(p => p.length === 10),
    },
  };
}

function coupons(ctx) {
  const duplicateCode = (code, exceptId) =>
    store.db.coupons.some(c => c.code === code && c.id !== exceptId);

  return resource(ctx, {
    notFound: 'Coupon not found',
    find: (id) => store.db.coupons.find(c => c.id === id),

    list({ res }) {
      sendJson(res, 200, { coupons: store.db.coupons });
    },

    create({ res, admin, body }) {
      const data = sanitizeCoupon(body);
      if (!data.code || !data.value) return sendJson(res, 400, { error: 'Code and value are required' });
      if (duplicateCode(data.code)) return sendJson(res, 409, { error: 'That code already exists' });

      const coupon = {
        id: store.nextId('cpn'), ...data,
        usedCount: 0, uses: [], createdAt: new Date().toISOString(),
      };
      store.db.coupons.push(coupon);
      store.logActivity(admin.name, 'coupon.create', `Created coupon ${coupon.code}`);
      store.save();
      sendJson(res, 201, { coupon });
    },

    update({ res, admin, body }, coupon) {
      const data = sanitizeCoupon(body, coupon);
      if (!data.code || !data.value) return sendJson(res, 400, { error: 'Code and value are required' });
      if (duplicateCode(data.code, coupon.id)) return sendJson(res, 409, { error: 'That code already exists' });

      Object.assign(coupon, data);
      store.logActivity(admin.name, 'coupon.update', `Updated coupon ${coupon.code}`);
      store.save();
      sendJson(res, 200, { coupon });
    },

    remove({ res, admin }, coupon) {
      store.db.coupons = store.db.coupons.filter(c => c.id !== coupon.id);
      store.logActivity(admin.name, 'coupon.delete', `Deleted coupon ${coupon.code}`);
      store.save();
      sendJson(res, 200, { ok: true });
    },
  });
}

/* ================= review moderation ================= */

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

function reviews(ctx) {
  return resource(ctx, {
    notFound: 'Review not found',
    find: (id) => store.db.reviews.find(r => r.id === id),

    list({ res }) {
      sendJson(res, 200, { reviews: store.db.reviews });
    },

    update({ res, admin, body }, review) {
      if (!REVIEW_STATUSES.includes(body.status)) return sendJson(res, 400, { error: 'Bad status' });
      review.status = body.status;
      store.logActivity(admin.name, 'review.' + body.status, `Review of "${review.productName}" by ${review.name}`);
      store.save();
      sendJson(res, 200, { review });
    },

    remove({ res }, review) {
      store.db.reviews = store.db.reviews.filter(r => r.id !== review.id);
      store.save();
      sendJson(res, 200, { ok: true });
    },
  });
}

module.exports = { orders, customers, coupons, reviews };
