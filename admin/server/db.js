/**
 * Vayu — JSON-file data layer for the admin panel and store API.
 *
 * The whole store lives in data/db.json. On first run it is seeded from
 * js/catalogue.js and js/taxonomy.js (the old hardcoded catalogue), after
 * which db.json is the single source of truth: the storefront reads the
 * catalogue from /api/catalogue and the old files only remain as an
 * offline fallback.
 *
 * Products are stored flat with real ids and can belong to several
 * categories at once ({ cat, sub } pairs). toLegacyCatalogue() projects
 * them back into the productData[cat][idx] shape the storefront was
 * written against, so ?cat=&idx= links keep working unchanged.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SITE_ROOT = path.join(__dirname, '..', '..', 'public');
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = null;

/* ---------- persistence ---------- */

function save() {
  if (!db) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  const data = JSON.stringify(db, null, 2);
  fs.writeFileSync(tmp, data);
  // On Windows, renameSync can fail with EPERM when another process (antivirus,
  // editor, file watcher) briefly locks the target. Retry once after a short
  // pause; if that also fails, fall back to a direct overwrite.
  try {
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      try {
        // brief pause then retry
        const waitUntil = Date.now() + 100;
        while (Date.now() < waitUntil) { /* spin */ }
        fs.renameSync(tmp, DB_FILE);
      } catch {
        // last resort: direct write (not atomic, but keeps server alive)
        console.error('[admin-api] rename retry failed, falling back to direct write');
        fs.writeFileSync(DB_FILE, data);
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      }
    } else {
      throw err;
    }
  }
}

function nextId(prefix) {
  db.meta.seq += 1;
  return `${prefix}_${db.meta.seq}`;
}

/* ---------- password hashing ---------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- seeding ---------- */

const parsePrice = (str) => Number(String(str).replace(/[^\d.]/g, '')) || 0;

async function seed() {
  // catalogue.js / taxonomy.js are ES modules; dynamic import works from CJS.
  const { pathToFileURL } = require('node:url');
  const { productData } = await import(pathToFileURL(path.join(SITE_ROOT, 'js', 'catalogue.js')).href);
  const { categories } = await import(pathToFileURL(path.join(SITE_ROOT, 'js', 'taxonomy.js')).href);

  const now = new Date().toISOString();
  db = {
    meta: { version: 1, seq: 0, seededAt: now },
    settings: {
      storeName: 'Vayu',
      currency: 'INR',
      freeShippingAbove: 5000,
      shippingFlat: 150,
      lowStockThreshold: 5,
    },
    admins: [],
    sessions: {},
    categories: {},
    products: [],
    orders: [],
    customers: [],
    subscribers: [],
    analytics: { days: {}, recent: [] },
    activity: [],
  };

  let order = 0;
  for (const [slug, cat] of Object.entries(categories)) {
    db.categories[slug] = {
      title: cat.title,
      curated: cat.curated,
      banner: cat.banner,
      subs: cat.subs.map(s => ({ label: s.label, thumb: s.thumb })),
      order: order++,
    };
  }

  for (const [cat, items] of Object.entries(productData)) {
    for (const p of items) {
      db.products.push({
        id: nextId('prod'),
        name: p.name,
        description: '',
        price: parsePrice(p.price),
        compareAt: null,
        sku: '',
        stock: 10,
        status: 'active',
        isNew: !!p.isNew,
        img: p.img,
        gallery: p.gallery || [p.img],
        categories: [{ cat, sub: p.sub || '' }],
        tags: [],
        views: 0,
        sold: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Default admin — password must be changed from Settings.
  const { salt, hash } = hashPassword('vayu-admin');
  db.admins.push({
    id: nextId('adm'),
    email: 'admin@vayu.com',
    name: 'Vayu Admin',
    salt, hash,
    role: 'owner',
    mustChangePassword: true,
    createdAt: now,
  });

  db.activity.push({ t: now, admin: 'system', action: 'seed', detail: `Seeded ${db.products.length} products and ${Object.keys(db.categories).length} categories from the static catalogue` });
  save();
  console.log(`[db] Seeded data/db.json with ${db.products.length} products (admin login: admin@vayu.com / vayu-admin)`);
}

/**
 * Additive migration: every release may add collections/fields; existing
 * db.json files get them with defaults, never losing data. Runs on every
 * init so an old data file keeps working after an update.
 */
async function migrate() {
  let changed = false;
  const ensure = (obj, key, val) => {
    if (obj[key] === undefined) { obj[key] = val; changed = true; }
  };

  ensure(db, 'coupons', []);
  ensure(db, 'reviews', []);
  ensure(db, 'stockAlerts', []);
  ensure(db, 'outbox', []);
  ensure(db, 'inventoryLog', []);
  ensure(db, 'carts', {});          // live cart snapshots by visitor sid
  ensure(db, 'searches', []);       // header search queries
  ensure(db, 'journal', null);      // seeded below
  ensure(db, 'content', { announcement: '', heroTitle: '', heroCtaText: '', heroCtaHref: '' });

  // Home hero carousel. Seeded from the slides index.html ships with, so the
  // panel opens showing exactly what is live. A slide with no title renders
  // as a poster (the whole image is one link) — that is how the second slide
  // has always behaved.
  ensure(db.content, 'heroSlides', [
    {
      img: '/assets/images/hero.jpg',
      alt: 'Vayu Autumn / Winter Campaign 2026',
      title: 'ECHOES OF VAYU',
      ctaText: 'DISCOVER THE CAMPAIGN',
      ctaHref: '/pages/collection.html',
    },
    {
      img: '/assets/images/personal_heirlooms.jpg',
      alt: 'Personal Heirlooms — Sarees from the Collection of Malvika Singh, on view till 23 August 2026, Gallery Vayu',
      title: '',
      ctaText: '',
      ctaHref: '/pages/gallery.html',
    },
    {
      img: '/assets/images/banner_fashion_32_9.png',
      alt: 'Vayu — the new season',
      title: 'THE NEW SEASON',
      ctaText: 'EXPLORE COLLECTIONS',
      ctaHref: '/pages/collection.html',
    },
  ]);

  const s = db.settings;
  ensure(s, 'zones', []);           // [{ name, pinPrefixes: ['11','40'], rate }]
  ensure(s, 'payment', { provider: 'cod', razorpayKeyId: '', razorpayKeySecret: '' });
  ensure(s, 'storeAddress', '');
  ensure(s, 'storeEmail', '');
  ensure(s, 'storePhone', '');

  for (const p of db.products) {
    ensure(p, 'variants', []);      // [{ label, price|null, stock }]
    ensure(p, 'publishAt', null);
  }
  // Customer accounts. Every customer record starts as a guest one written
  // by checkout; `hash` stays null until that person claims the email by
  // registering, which is what turns the record into a sign-in-able account.
  ensure(db, 'customerSessions', {});
  for (const c of db.customers) {
    ensure(c, 'notes', '');
    ensure(c, 'tags', []);
    ensure(c, 'salt', null);
    ensure(c, 'hash', null);
    ensure(c, 'addresses', []);     // [{ id, label, name, phone, address, city, pin, isDefault }]
  }
  for (const a of db.admins) {
    ensure(a, 'role', 'owner');
  }
  for (const d of Object.values(db.analytics.days)) {
    ensure(d, 'atc', 0);            // add-to-cart events
    ensure(d, 'checkoutStart', 0);
  }

  // Seed journal stories from the static file once.
  if (db.journal === null) {
    try {
      const { pathToFileURL } = require('node:url');
      const { STORIES } = await import(pathToFileURL(path.join(SITE_ROOT, 'js', 'journal-data.js')).href);
      db.journal = STORIES.map(st => ({ ...st }));
    } catch {
      db.journal = [];
    }
    changed = true;
  }

  if (changed) save();
}

/** Activate scheduled products whose publish time has arrived. */
function sweepScheduled() {
  const now = Date.now();
  let changed = false;
  for (const p of db.products) {
    if (p.status === 'draft' && p.publishAt && new Date(p.publishAt).getTime() <= now) {
      p.status = 'active';
      p.publishAt = null;
      p.updatedAt = new Date().toISOString();
      logActivity('system', 'product.publish', `Scheduled publish of "${p.name}"`);
      changed = true;
    }
  }
  if (changed) save();
}

async function init() {
  if (db) return db;
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    await seed();
  }
  await migrate();
  return db;
}

/* ---------- projections ---------- */

const formatPrice = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN');

/**
 * Project flat products back into the legacy storefront shape:
 * { fashion: [ { name, price: '₹ 3,200', img, sub, isNew, gallery, id } ] }
 * A product listed in several categories appears in each of them.
 * Only active products are included. Array order per category follows
 * db.products order, so idx stays stable unless something is deleted.
 */
function toLegacyCatalogue() {
  const out = {};
  for (const slug of Object.keys(db.categories)) out[slug] = [];
  for (const p of db.products) {
    if (p.status !== 'active') continue;
    for (const c of p.categories) {
      if (!out[c.cat]) out[c.cat] = [];
      out[c.cat].push({
        id: p.id,
        name: p.name,
        price: formatPrice(p.price),
        priceValue: p.price,
        compareAt: p.compareAt ? formatPrice(p.compareAt) : null,
        img: p.img,
        sub: c.sub || '',
        isNew: !!p.isNew,
        gallery: p.gallery && p.gallery.length ? p.gallery : [p.img],
        stock: totalStock(p),
        description: p.description || '',
        tags: p.tags || [],
        variants: (p.variants || []).map(v => ({
          label: v.label,
          price: v.price != null ? formatPrice(v.price) : null,
          priceValue: v.price != null ? v.price : p.price,
          stock: v.stock,
        })),
      });
    }
  }
  return out;
}

/** Taxonomy in the shape js/taxonomy.js exports, in saved order. */
function toLegacyTaxonomy() {
  const entries = Object.entries(db.categories)
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
  const out = {};
  for (const [slug, c] of entries) {
    out[slug] = { title: c.title, curated: c.curated, banner: c.banner, subs: c.subs };
  }
  return out;
}

/** Find a product by its position in the legacy projection (cat + idx). */
function productByCatIdx(cat, idx) {
  const legacy = toLegacyCatalogue();
  const item = legacy[cat] && legacy[cat][idx];
  if (!item) return null;
  return db.products.find(p => p.id === item.id) || null;
}

/** Sellable stock: sum of variant stock when variants exist. */
function totalStock(p) {
  return (p.variants && p.variants.length)
    ? p.variants.reduce((n, v) => n + (Number(v.stock) || 0), 0)
    : p.stock;
}

function productById(id) {
  return db.products.find(p => p.id === id) || null;
}

/** Customers are keyed by lowercased email everywhere they are looked up. */
function customerByEmail(email) {
  const mail = String(email || '').toLowerCase().trim();
  return mail ? db.customers.find(c => c.email === mail) || null : null;
}

function customerById(id) {
  return db.customers.find(c => c.id === id) || null;
}

/** Record a stock movement so Inventory history can explain every change. */
function logInventory(productId, name, delta, reason, by) {
  if (!delta) return;
  db.inventoryLog.unshift({ t: new Date().toISOString(), productId, name, delta, reason, by });
  if (db.inventoryLog.length > 1000) db.inventoryLog.length = 1000;
}

/** Queue an email in the outbox (sent later / manually until SMTP exists). */
function queueEmail(to, subject, body, event) {
  if (!to) return;
  db.outbox.unshift({
    id: nextId('mail'), to, subject, body, event,
    status: 'queued', t: new Date().toISOString(),
  });
  if (db.outbox.length > 500) db.outbox.length = 500;
}

/**
 * Queue back-in-stock mail for everyone waiting on this product. Called
 * wherever stock can rise — a product edit, a bulk set, a CSV import, a
 * cancelled order — so it lives here rather than in one of them.
 */
function fireStockAlerts(prod) {
  if (totalStock(prod) <= 0) return;
  for (const a of db.stockAlerts) {
    if (a.productId === prod.id && !a.notified) {
      a.notified = true;
      queueEmail(a.email, `Vayu — "${prod.name}" is back in stock`,
        `Good news — "${prod.name}" is available again.\n\nSee it: /pages/product.html?id=${prod.id}\n\n— Vayu`,
        'stock.alert');
    }
  }
}

/** Last 10 digits, so "+91 98123 45678" and "9812345678" compare equal. */
const normPhone = (p) => String(p || '').replaceAll(/[^\d]/g, '').slice(-10);

/* ---------- helpers ---------- */

function logActivity(admin, action, detail) {
  db.activity.unshift({ t: new Date().toISOString(), admin, action, detail });
  if (db.activity.length > 500) db.activity.length = 500;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  init,
  save,
  get db() { return db; },
  nextId,
  hashPassword,
  verifyPassword,
  toLegacyCatalogue,
  toLegacyTaxonomy,
  productByCatIdx,
  productById,
  customerByEmail,
  customerById,
  totalStock,
  sweepScheduled,
  logInventory,
  queueEmail,
  fireStockAlerts,
  normPhone,
  logActivity,
  formatPrice,
  parsePrice,
  today,
};
