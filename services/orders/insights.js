/**
 * Vayu admin — read-only views over the data: the dashboard, analytics,
 * the activity log, stock movements, and the email outbox.
 *
 * Everything here still derives from the data on each request; nothing is
 * precomputed. What changed with D1 is *where* the aggregation happens —
 * SUM, COUNT and GROUP BY now run in SQLite instead of in a loop over a
 * parsed JSON file, so these views no longer read the whole store to
 * answer a question about fourteen days.
 */

import { json, ok, resource } from '#shared/utils/http.js';

const DAY_MS = 86400000;

/** The last n calendar days as YYYY-MM-DD, oldest first. */
function lastNDays(n) {
  const today = Date.now();
  return Array.from({ length: n }, (_, i) =>
    new Date(today - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

const dayKey = (offsetDays = 0) => new Date(Date.now() - offsetDays * DAY_MS).toISOString();

/** Views and unique visitors per day, filled in for days with no traffic. */
async function trafficSeries(store, days) {
  const rows = await store.all(
    `SELECT d.day, d.views, (SELECT COUNT(*) FROM analytics_visitors v WHERE v.day = d.day) AS visitors
       FROM analytics_days d WHERE d.day >= ?`,
    days[0],
  );
  const byDay = new Map(rows.map(r => [r.day, r]));
  return days.map(day => ({
    day,
    views: byDay.get(day)?.views || 0,
    visitors: byDay.get(day)?.visitors || 0,
  }));
}

/* ================= dashboard ================= */

export async function overview({ store }) {
  const days = lastNDays(14);
  const settings = await store.settings();

  const [
    revenue7d, revenuePrev7d, openOrders, productCounts, customers, subscribers,
    salesRows, traffic, lowStock, topProducts, recentOrders, recentActivity,
  ] = await Promise.all([
    store.one(
      `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders FROM orders
        WHERE status != 'cancelled' AND created_at >= ?`, dayKey(7)),
    store.one(
      `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders FROM orders
        WHERE status != 'cancelled' AND created_at >= ? AND created_at < ?`, dayKey(14), dayKey(7)),
    store.value(`SELECT COUNT(*) FROM orders WHERE status IN ('new', 'processing')`),
    store.one(`SELECT COUNT(*) AS total, SUM(status = 'active') AS active FROM products`),
    store.value('SELECT COUNT(*) FROM customers'),
    store.value('SELECT COUNT(*) FROM subscribers'),
    store.all(
      `SELECT substr(created_at, 1, 10) AS day, SUM(total) AS revenue, COUNT(*) AS orders
         FROM orders WHERE status != 'cancelled' AND created_at >= ?
        GROUP BY day`, days[0]),
    trafficSeries(store, days),
    store.all(
      `SELECT id, name, stock, img FROM products
        WHERE status = 'active' AND stock <= ? ORDER BY stock LIMIT 8`, settings.lowStockThreshold),
    store.all('SELECT id, name, img, sold, views, price FROM products ORDER BY sold DESC, views DESC LIMIT 6'),
    store.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 6'),
    store.all('SELECT * FROM activity ORDER BY t DESC LIMIT 8'),
  ]);

  const lowStockCount = await store.value(
    `SELECT COUNT(*) FROM products WHERE status = 'active' AND stock <= ?`, settings.lowStockThreshold);

  const bySalesDay = new Map(salesRows.map(r => [r.day, r]));

  return json(200, {
    kpis: {
      revenue7d: revenue7d.revenue,
      revenuePrev7d: revenuePrev7d.revenue,
      orders7d: revenue7d.orders,
      ordersPrev7d: revenuePrev7d.orders,
      openOrders,
      products: productCounts.total,
      activeProducts: productCounts.active || 0,
      customers,
      subscribers,
      views7d: traffic.slice(-7).reduce((n, d) => n + d.views, 0),
      lowStockCount,
    },
    salesSeries: days.map(day => ({
      day,
      revenue: bySalesDay.get(day)?.revenue || 0,
      orders: bySalesDay.get(day)?.orders || 0,
    })),
    trafficSeries: traffic,
    lowStock,
    topProducts,
    recentOrders: await withItems(store, recentOrders),
    recentActivity,
  });
}

/* ================= analytics ================= */

export async function analytics({ store }) {
  const days = lastNDays(30);
  const since = days[0];

  const [series, topPages, topProducts, recent, funnelRow, orders30d, searches, zeroResults, abandoned, pending] =
    await Promise.all([
      trafficSeries(store, days),
      store.all(
        `SELECT path, SUM(count) AS views FROM analytics_paths WHERE day >= ?
          GROUP BY path ORDER BY views DESC LIMIT 12`, since),
      store.all(
        `SELECT ap.product_id AS id, COALESCE(p.name, ap.product_id) AS name,
                COALESCE(p.img, '') AS img, SUM(ap.count) AS views
           FROM analytics_products ap LEFT JOIN products p ON p.id = ap.product_id
          WHERE ap.day >= ? GROUP BY ap.product_id ORDER BY views DESC LIMIT 12`, since),
      store.all('SELECT t, path, ref FROM analytics_recent ORDER BY t DESC LIMIT 60'),
      store.one(
        `SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(atc), 0) AS atc,
                COALESCE(SUM(checkout_start), 0) AS checkoutStart
           FROM analytics_days WHERE day >= ?`, since),
      store.value(
        `SELECT COUNT(*) FROM orders WHERE status != 'cancelled' AND created_at >= ?`, dayKey(30)),
      // The terms people actually repeat, most-searched first. Ranked by
      // count rather than listed by recency: one row is one term now, so a
      // recency list would just be the last forty distinct words typed,
      // which says less than what the shop is asked for most often.
      store.all(
        `SELECT q, searches AS count, results, zero_hits AS zeroHits, last_seen AS t
           FROM search_terms ORDER BY searches DESC, last_seen DESC LIMIT 40`),
      // Searches that found nothing are the useful half of the log: they say
      // what shoppers expected to find and the catalogue did not have. The
      // count is every time the term came up empty, back to the first — not
      // the tail of an event log.
      store.all(
        `SELECT q, zero_hits AS count FROM search_terms
          WHERE zero_hits > 0 ORDER BY zero_hits DESC, last_seen DESC LIMIT 12`),
      // A cart snapshot untouched for an hour is treated as abandoned;
      // checkout deletes the snapshot, so anything left never converted.
      //
      // Two kinds of row come back, and the difference is what you can do
      // about them. A plain sid row is a cart left on the site; it carries a
      // name only if the shopper was signed in (carts.customer_id, joined
      // here). A 'pending:' row is a checkout that reached the payment
      // window and never came back — those were excluded from this list
      // until now, which meant the one group whose name, email and phone are
      // already known was also the one group nobody could see.
      store.all(
        `SELECT c.sid, c.items, c.updated_at AS t, c.total,
                cu.id AS customerId, cu.name AS customerName,
                cu.email AS customerEmail, cu.phone AS customerPhone
           FROM carts c
           LEFT JOIN customers cu ON cu.id = c.customer_id
          WHERE c.updated_at < ? AND c.sid NOT LIKE 'pending:%'
          ORDER BY c.updated_at DESC LIMIT 30`,
        new Date(Date.now() - 3600000).toISOString()),
      store.all(
        `SELECT sid, items, updated_at AS t, total FROM carts
          WHERE updated_at < ? AND sid LIKE 'pending:%'
          ORDER BY updated_at DESC LIMIT 30`,
        new Date(Date.now() - 3600000).toISOString()),
    ]);

  return json(200, {
    series,
    topPages,
    topProducts,
    recent,
    funnel: { ...funnelRow, orders: orders30d },
    searches,
    zeroResults,
    abandoned: [...abandoned.map(cartRow), ...pending.map(pendingRow)]
      .filter(Boolean)
      .sort((a, b) => (a.t < b.t ? 1 : -1))
      .slice(0, 30),
  });
}

/** A cart left on the site. Named only if the shopper was signed in. */
const cartRow = (c) => ({
  sid: c.sid,
  t: c.t,
  stage: 'cart',
  items: safeJson(c.items),
  customer: c.customerId
    ? { id: c.customerId, name: c.customerName, email: c.customerEmail, phone: c.customerPhone }
    : null,
});

/**
 * A checkout that reached the payment window and stopped.
 *
 * `items` here is the whole prepared order, not a cart snapshot — see
 * putPending in services/payments/razorpay.js — so the shopper is always
 * known, guest or not, and the lines carry the product image the same way.
 * `accountId` is only set when they were signed in; the name and email are
 * what they typed either way.
 */
const pendingRow = (c) => {
  const prep = safeJson(c.items, null);
  if (!prep?.customer) return null;
  return {
    sid: c.sid,
    t: c.t,
    stage: 'payment',
    total: c.total,
    items: (prep.lines || []).map(l => ({
      name: l.variant ? `${l.name} — ${l.variant}` : l.name,
      qty: l.qty,
      price: l.price,
      img: l.img,
    })),
    customer: {
      id: prep.accountId || null,
      name: prep.customer.name || '',
      email: prep.customer.email || '',
      phone: prep.customer.phone || '',
    },
  };
};

const safeJson = (s, fallback = []) => { try { return JSON.parse(s); } catch { return fallback; } };

/* ================= logs ================= */

export async function activity({ store }) {
  return json(200, { activity: await store.all('SELECT * FROM activity ORDER BY t DESC LIMIT 200') });
}

/**
 * A back-in-stock request is only actionable if you can see what the piece
 * is, so the alert rows carry the product with them rather than an id: the
 * panel used to print the raw product_id and the operator had to go and
 * look it up in the catalogue.
 *
 * `stock` is the product row's own count, which is meaningless once the
 * product has variants — that is what the `stock` column's own comment in
 * 0001_init.sql says. The variant sum is therefore computed alongside it
 * and the view prefers it when there are any, so "back in stock?" — the one
 * question this screen exists to answer — is right for both kinds of
 * product. Categories come from the join table because a product can sit
 * in more than one.
 */
export async function inventory({ store }) {
  const [log, alerts] = await Promise.all([
    store.all('SELECT * FROM inventory_log ORDER BY t DESC LIMIT 300'),
    store.all(
      `SELECT s.*,
              p.name       AS product_name,
              p.img        AS product_img,
              p.price      AS product_price,
              p.compare_at AS product_compare_at,
              p.sku        AS product_sku,
              p.status     AS product_status,
              p.stock      AS product_stock,
              (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id)      AS variant_count,
              (SELECT COALESCE(SUM(v.stock), 0) FROM product_variants v WHERE v.product_id = p.id) AS variant_stock,
              (SELECT GROUP_CONCAT(c.category_slug, ', ') FROM product_categories c WHERE c.product_id = p.id) AS product_cats
         FROM stock_alerts s
         LEFT JOIN products p ON p.id = s.product_id
        ORDER BY s.t DESC LIMIT 100`),
  ]);
  return json(200, {
    log,
    alerts: alerts.map(a => {
      const variants = Number(a.variant_count || 0);
      return {
        productId: a.product_id,
        productName: a.product_name || '',
        email: a.email,
        notified: !!a.notified,
        t: a.t,
        // null when the product row has been deleted since the request
        product: a.product_name == null ? null : {
          img: a.product_img || '',
          price: a.product_price || 0,
          compareAt: a.product_compare_at || null,
          sku: a.product_sku || '',
          status: a.product_status || '',
          stock: variants ? Number(a.variant_stock || 0) : Number(a.product_stock || 0),
          variants,
          categories: a.product_cats ? String(a.product_cats).split(', ').filter(Boolean) : [],
        },
      };
    }),
  });
}

/* ================= outbox ================= */

/**
 * Queued mail. Until an email provider is wired up, "sending" is the
 * operator opening the draft and marking it sent, so the only mutations
 * are a status flip and a delete.
 */
export function outbox(ctx) {
  const { store } = ctx;
  return resource(ctx, {
    notFound: 'Not found',
    find: (id) => store.row('outbox', 'id', id),

    async list() {
      const rows = await store.all('SELECT * FROM outbox ORDER BY t DESC LIMIT 500');
      return json(200, {
        outbox: rows.map(m => ({
          id: m.id, to: m.to_addr, subject: m.subject, body: m.body,
          event: m.event, status: m.status, t: m.t,
        })),
      });
    },

    async update({ body }, mail) {
      await store.update('outbox', 'id', mail.id, { status: body.status === 'sent' ? 'sent' : 'queued' });
      return ok();
    },

    async remove(_ctx, mail) {
      await store.remove('outbox', 'id', mail.id);
      return ok();
    },
  });
}

/* ---------- shared with admin-sales.js ---------- */

/** Attach line items (and timeline) to a set of order rows. */
export async function withItems(store, orders, { timeline = false } = {}) {
  if (!orders.length) return [];
  const ids = orders.map(o => o.id);
  const holes = ids.map(() => '?').join(', ');

  const [items, timelineRows] = await Promise.all([
    store.all(`SELECT * FROM order_items WHERE order_id IN (${holes}) ORDER BY sort_order, id`, ...ids),
    timeline
      ? store.all(`SELECT * FROM order_timeline WHERE order_id IN (${holes}) ORDER BY t`, ...ids)
      : Promise.resolve([]),
  ]);

  return orders.map(o => ({
    id: o.id,
    number: o.number,
    items: items.filter(i => i.order_id === o.id).map(i => ({
      productId: i.product_id, name: i.name, price: i.price, qty: i.qty, img: i.img, variant: i.variant,
    })),
    customer: {
      id: o.customer_id, name: o.name, email: o.email, phone: o.phone,
      address: o.address, city: o.city, pin: o.pin,
    },
    subtotal: o.subtotal,
    discount: o.discount,
    coupon: o.coupon,
    shipping: o.shipping,
    total: o.total,
    payment: {
      method: o.payment_method,
      paymentId: o.payment_id,
      orderId: o.payment_order_id,
      // 'pending' rather than '' for a row written before 0012 backfilled
      // the column, so the panel never has to render an empty badge.
      status: o.payment_status || 'pending',
      paidAt: o.paid_at || null,
    },
    guest: !!o.guest,
    status: o.status,
    createdAt: o.created_at,
    ...(timeline ? { timeline: timelineRows.filter(t => t.order_id === o.id) } : {}),
  }));
}
