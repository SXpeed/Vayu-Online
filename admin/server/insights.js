/**
 * Vayu admin — read-only views over the data: the dashboard, analytics,
 * the activity log, stock movements, and the email outbox.
 *
 * Everything here derives from db.json on each request; nothing is
 * precomputed, which at this catalogue size is far cheaper than keeping
 * rollups correct.
 */

const store = require('./db');
const { sendJson, resource } = require('./http');

const DAY_MS = 86400000;

/** The last n calendar days as YYYY-MM-DD, oldest first. */
function lastNDays(n) {
  const today = Date.now();
  return Array.from({ length: n }, (_, i) =>
    new Date(today - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

const trafficOn = (day) => {
  const d = store.db.analytics.days[day];
  return { day, views: d ? d.views : 0, visitors: d ? Object.keys(d.sids || {}).length : 0 };
};

const isLive = (o) => o.status !== 'cancelled';

/* ================= dashboard ================= */

function overview({ res }) {
  const db = store.db;
  const days = lastNDays(14);
  const now = Date.now();

  const inWindow = (from, to) => db.orders.filter(o => {
    const t = new Date(o.createdAt).getTime();
    return t >= from && t < to && isLive(o);
  });
  const revenueOf = (orders) => orders.reduce((n, o) => n + o.total, 0);

  const thisWeek = inWindow(now - 7 * DAY_MS, now + DAY_MS);
  const lastWeek = inWindow(now - 14 * DAY_MS, now - 7 * DAY_MS);

  const salesSeries = days.map(day => {
    const onDay = db.orders.filter(o => o.createdAt.slice(0, 10) === day && isLive(o));
    return { day, revenue: revenueOf(onDay), orders: onDay.length };
  });
  const trafficSeries = days.map(trafficOn);

  const lowStockProducts = db.products
    .filter(p => p.status === 'active' && p.stock <= db.settings.lowStockThreshold);

  sendJson(res, 200, {
    kpis: {
      revenue7d: revenueOf(thisWeek),
      revenuePrev7d: revenueOf(lastWeek),
      orders7d: thisWeek.length,
      ordersPrev7d: lastWeek.length,
      openOrders: db.orders.filter(o => ['new', 'processing'].includes(o.status)).length,
      products: db.products.length,
      activeProducts: db.products.filter(p => p.status === 'active').length,
      customers: db.customers.length,
      subscribers: db.subscribers.length,
      views7d: trafficSeries.slice(-7).reduce((n, d) => n + d.views, 0),
      lowStockCount: lowStockProducts.length,
    },
    salesSeries,
    trafficSeries,
    lowStock: [...lowStockProducts]
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8)
      .map(p => ({ id: p.id, name: p.name, stock: p.stock, img: p.img })),
    topProducts: [...db.products]
      .sort((a, b) => (b.sold || 0) - (a.sold || 0) || (b.views || 0) - (a.views || 0))
      .slice(0, 6)
      .map(p => ({ id: p.id, name: p.name, img: p.img, sold: p.sold || 0, views: p.views || 0, price: p.price })),
    recentOrders: db.orders.slice(0, 6),
    recentActivity: db.activity.slice(0, 8),
  });
}

/* ================= analytics ================= */

const topN = (totals, n) => Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, n);

function analytics({ res }) {
  const db = store.db;
  const days = lastNDays(30);

  // One pass over the window collects every per-day rollup we need.
  const pathTotals = {};
  const productTotals = {};
  const funnel = { views: 0, atc: 0, checkoutStart: 0, orders: 0 };

  for (const day of days) {
    const d = db.analytics.days[day];
    if (!d) continue;
    for (const [p, n] of Object.entries(d.paths)) pathTotals[p] = (pathTotals[p] || 0) + n;
    for (const [id, n] of Object.entries(d.products)) productTotals[id] = (productTotals[id] || 0) + n;
    funnel.views += d.views || 0;
    funnel.atc += d.atc || 0;
    funnel.checkoutStart += d.checkoutStart || 0;
  }

  const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString();
  funnel.orders = db.orders.filter(o => o.createdAt >= cutoff && isLive(o)).length;

  // Searches that found nothing are the useful half of the log: they say
  // what shoppers expected to find and the catalogue did not have.
  const zero = {};
  for (const s of db.searches) {
    if (!s.results) {
      const q = s.q.toLowerCase();
      zero[q] = (zero[q] || 0) + 1;
    }
  }

  // A cart snapshot untouched for an hour is treated as abandoned;
  // checkout deletes the snapshot, so anything left here never converted.
  const hourAgo = new Date(Date.now() - 3600000).toISOString();

  sendJson(res, 200, {
    series: days.map(trafficOn),
    topPages: topN(pathTotals, 12).map(([path, views]) => ({ path, views })),
    topProducts: topN(productTotals, 12).map(([id, views]) => {
      const p = store.productById(id);
      return { id, name: p ? p.name : id, img: p ? p.img : '', views };
    }),
    recent: db.analytics.recent.slice(0, 60),
    funnel,
    searches: db.searches.slice(0, 40),
    zeroResults: topN(zero, 12).map(([q, count]) => ({ q, count })),
    abandoned: Object.entries(db.carts)
      .filter(([, c]) => c.t < hourAgo)
      .map(([sid, c]) => ({ sid, ...c }))
      .sort((a, b) => b.t.localeCompare(a.t))
      .slice(0, 30),
  });
}

/* ================= logs ================= */

function activity({ res }) {
  sendJson(res, 200, { activity: store.db.activity.slice(0, 200) });
}

function inventory({ res }) {
  sendJson(res, 200, {
    log: store.db.inventoryLog.slice(0, 300),
    alerts: store.db.stockAlerts.slice(-100).reverse(),
  });
}

/* ================= outbox ================= */

/**
 * Queued mail. Until an email provider is wired up, "sending" is the
 * operator opening the draft and marking it sent, so the only mutations
 * are a status flip and a delete.
 */
function outbox(ctx) {
  return resource(ctx, {
    notFound: 'Not found',
    find: (id) => store.db.outbox.find(m => m.id === id),

    list({ res }) {
      sendJson(res, 200, { outbox: store.db.outbox });
    },

    update({ res, body }, mail) {
      mail.status = body.status === 'sent' ? 'sent' : 'queued';
      store.save();
      sendJson(res, 200, { ok: true });
    },

    remove({ res }, mail) {
      store.db.outbox = store.db.outbox.filter(m => m.id !== mail.id);
      store.save();
      sendJson(res, 200, { ok: true });
    },
  });
}

module.exports = { overview, analytics, activity, inventory, outbox };
