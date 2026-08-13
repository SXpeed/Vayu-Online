/**
 * Vayu admin — running the shop rather than stocking it: storefront copy,
 * store settings, team access, image uploads, CSV exports and backups.
 *
 * Two things could not survive the move as they were, because a Worker has
 * no filesystem:
 *
 *   uploads  went from writing into assets/images/uploads to putting the
 *            bytes in R2. They are served back by the Worker at /uploads/*,
 *            so the panel's returned URL is all that changed.
 *   backups  went from copying db.json aside to writing a JSON dump of
 *            every table into R2 under backups/. D1 also has Time Travel
 *            (30 days of point-in-time recovery) which is the real safety
 *            net; these dumps are the portable, downloadable kind.
 */

import { json, ok, csv, badRequest, notFound, methodNotAllowed, resource } from './http.js';
import { now, hashPassword } from './db.js';
import { loadProducts } from './catalogue.js';

const ROLES = ['owner', 'manager', 'staff'];
const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/* ================= storefront content ================= */

const TEXT_FIELDS = ['announcement', 'heroTitle', 'heroCtaText', 'heroCtaHref'];

/** A slide is kept only if it has an image; empty title = poster slide. */
const sanitizeSlides = (slides) => slides
  .filter(s => s && String(s.img || '').trim())
  .slice(0, 6)
  .map(s => ({
    img: String(s.img).trim().slice(0, 300),
    alt: String(s.alt || '').slice(0, 200),
    title: String(s.title || '').slice(0, 120),
    ctaText: String(s.ctaText || '').slice(0, 60),
    ctaHref: String(s.ctaHref || '').slice(0, 300),
  }));

export async function content({ store, method, admin, body }) {
  const current = await store.config('content');
  if (method === 'GET') return json(200, { content: current });
  if (method !== 'PUT') return methodNotAllowed();

  const writes = [];
  for (const k of TEXT_FIELDS) {
    if (body[k] !== undefined) writes.push(store.putConfig('content', k, String(body[k]).slice(0, 300)));
  }
  if (Array.isArray(body.heroSlides)) {
    writes.push(store.putConfig('content', 'heroSlides', sanitizeSlides(body.heroSlides)));
  }
  await Promise.all(writes);
  await store.logActivity(admin.name, 'content.update', 'Updated site content');

  return json(200, { content: await store.config('content') });
}

/* ================= store settings ================= */

const money = (v, fallback) => Math.max(0, Number(v ?? fallback) || 0);

export async function settings({ store, method, admin, body }) {
  const s = await store.settings();
  if (method === 'GET') return json(200, { settings: s });
  if (method !== 'PUT') return methodNotAllowed();

  const next = {
    storeName: String(body.storeName ?? s.storeName),
    currency: s.currency,
    freeShippingAbove: money(body.freeShippingAbove, s.freeShippingAbove),
    shippingFlat: money(body.shippingFlat, s.shippingFlat),
    lowStockThreshold: money(body.lowStockThreshold, s.lowStockThreshold),
    storeAddress: String(body.storeAddress ?? s.storeAddress),
    storeEmail: String(body.storeEmail ?? s.storeEmail),
    storePhone: String(body.storePhone ?? s.storePhone),
    zones: s.zones,
    payment: s.payment,
  };

  if (Array.isArray(body.zones)) {
    next.zones = body.zones
      .filter(z => z && String(z.name || '').trim())
      .map(z => ({
        name: String(z.name).slice(0, 60),
        pinPrefixes: String(z.pinPrefixes ?? '').split(',').map(x => x.trim()).filter(Boolean),
        rate: Math.max(0, Number(z.rate) || 0),
      }));
  }

  if (body.payment) {
    next.payment = {
      provider: body.payment.provider === 'razorpay' ? 'razorpay' : 'cod',
      razorpayKeyId: String(body.payment.razorpayKeyId ?? s.payment.razorpayKeyId ?? ''),
      razorpayKeySecret: String(body.payment.razorpayKeySecret ?? s.payment.razorpayKeySecret ?? ''),
    };
  }

  // One key per field, so two admins editing different sections do not
  // overwrite each other the way one settings blob would.
  await Promise.all(Object.entries(next).map(([k, v]) => store.putConfig('settings', k, v)));
  await store.logActivity(admin.name, 'settings.update', 'Updated store settings');

  return json(200, { settings: await store.settings() });
}

/* ================= team ================= */

const publicAdmin = (a) => ({
  id: a.id, name: a.name, email: a.email, role: a.role, createdAt: a.created_at,
});

export function team(ctx) {
  const { store } = ctx;
  return resource(ctx, {
    notFound: 'Member not found',
    find: (id) => store.row('admins', 'id', id),

    async list() {
      const rows = await store.all('SELECT * FROM admins ORDER BY created_at');
      return json(200, { team: rows.map(publicAdmin) });
    },

    async create({ admin, body }) {
      const email = String(body.email || '').toLowerCase().trim();
      if (!EMAIL_RE.test(email)) return badRequest('Valid email required');
      if (await store.one('SELECT id FROM admins WHERE email = ?', email)) {
        return json(409, { error: 'That email already has access' });
      }
      if (String(body.password || '').length < 8) {
        return badRequest('Password must be at least 8 characters');
      }

      const { salt, hash } = hashPassword(body.password);
      const id = await store.nextId('adm');
      const member = {
        id,
        email,
        name: String(body.name || email.split('@')[0]),
        salt, hash,
        role: ROLES.includes(body.role) ? body.role : 'staff',
        must_change_password: 1,
        created_at: now(),
      };
      await store.run(
        `INSERT INTO admins (id, email, name, salt, hash, role, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        member.id, member.email, member.name, salt, hash, member.role, 1, member.created_at,
      );
      await store.logActivity(admin.name, 'team.add', `Added ${member.name} as ${member.role}`);
      return json(201, { member: publicAdmin(member) });
    },

    async update({ admin, body }, member) {
      const patch = {};
      if (body.role && ROLES.includes(body.role)) patch.role = body.role;
      if (body.name) patch.name = String(body.name);
      await store.update('admins', 'id', member.id, patch);

      const fresh = await store.row('admins', 'id', member.id);
      await store.logActivity(admin.name, 'team.update', `Updated ${fresh.name} (${fresh.role})`);
      return json(200, { member: publicAdmin(fresh) });
    },

    async remove({ admin }, member) {
      if (member.id === admin.id) return badRequest("You can't remove yourself");
      if (member.role === 'owner') {
        const owners = await store.value(`SELECT COUNT(*) FROM admins WHERE role = 'owner'`);
        if (owners === 1) return badRequest('The last owner cannot be removed');
      }
      await store.batch([
        store.stmt('DELETE FROM admins WHERE id = ?', member.id),
        // Revoke their sessions too, or a removed member stays signed in.
        store.stmt(`DELETE FROM sessions WHERE kind = 'admin' AND subject_id = ?`, member.id),
      ]);
      await store.logActivity(admin.name, 'team.remove', `Removed ${member.name}`);
      return ok();
    },
  });
}

/* ================= image upload ================= */

const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
const MAX_UPLOAD = 8 * 1024 * 1024;

const extensionOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot > -1 ? name.slice(dot).toLowerCase() : '';
};

/**
 * Accepts a data: URL from the panel (which has already downscaled it) and
 * puts the bytes in R2. The returned URL is served by the Worker from
 * /uploads/*, which is why nothing else in the panel had to change.
 */
export async function upload({ store, method, body }) {
  if (method !== 'POST') return methodNotAllowed();

  const name = String(body.name || 'upload.png');
  const ext = extensionOf(name);
  const contentType = IMAGE_TYPES[ext];
  if (!contentType) return badRequest('Unsupported image type');

  const data = String(body.data || '');
  const base64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (!binary.length) return badRequest('Empty file');
  if (binary.length > MAX_UPLOAD) return badRequest('Image larger than 8 MB');

  const base = name.slice(0, name.length - ext.length).toLowerCase()
    .replaceAll(/[^a-z0-9_-]/g, '_').slice(0, 40);
  const key = `images/${base}_${Date.now()}${ext}`;

  await store.uploads.put(key, binary, { httpMetadata: { contentType } });
  return json(201, { url: `/uploads/${key}` });
}

/* ================= CSV exports ================= */

const EXPORTS = {
  async 'products.csv'(store) {
    const products = await loadProducts(store);
    return [
      ['id', 'name', 'price', 'stock', 'status', 'sku', 'categories', 'views', 'sold', 'createdAt'],
      ...products.map(p => [
        p.id, p.name, p.price, p.stock, p.status, p.sku,
        p.categories.map(c => c.cat + (c.sub ? ':' + c.sub : '')).join('|'),
        p.views || 0, p.sold || 0, p.createdAt,
      ]),
    ];
  },

  async 'orders.csv'(store) {
    const [orders, items] = await Promise.all([
      store.all('SELECT * FROM orders ORDER BY created_at DESC'),
      store.all('SELECT order_id, name, qty FROM order_items ORDER BY sort_order, id'),
    ]);
    return [
      ['number', 'date', 'customer', 'email', 'items', 'subtotal', 'shipping', 'total', 'status'],
      ...orders.map(o => [
        o.number, o.created_at, o.name, o.email,
        items.filter(i => i.order_id === o.id).map(i => `${i.name} x${i.qty}`).join('|'),
        o.subtotal, o.shipping, o.total, o.status,
      ]),
    ];
  },

  async 'subscribers.csv'(store) {
    const rows = await store.all('SELECT email, t FROM subscribers ORDER BY t DESC');
    return [['email', 'date'], ...rows.map(s => [s.email, s.t])];
  },
};

export async function exportCsv({ store, parts }) {
  const build = EXPORTS[parts[0]];
  if (!build) return notFound();
  return csv('vayu-' + parts[0], await build(store));
}

/* ================= backups ================= */

const BACKUP_PREFIX = 'backups/';
const KEEP_BACKUPS = 20;

/**
 * Every table as one JSON document in R2. D1's own Time Travel covers
 * accidental damage for 30 days; this is the copy you can download, read
 * and take elsewhere.
 */
const BACKUP_TABLES = [
  'meta', 'config', 'admins', 'customers', 'customer_tags', 'addresses',
  'categories', 'category_subs', 'products', 'product_categories', 'product_gallery',
  'product_variants', 'product_tags', 'orders', 'order_items', 'order_timeline',
  'coupons', 'coupon_restrictions', 'coupon_uses', 'reviews', 'journal',
  'subscribers', 'stock_alerts', 'outbox', 'inventory_log', 'carts', 'searches',
  'activity', 'analytics_days', 'analytics_paths', 'analytics_products',
  'analytics_visitors', 'analytics_recent',
];

async function makeBackup(store) {
  const dump = { takenAt: now(), tables: {} };
  for (const table of BACKUP_TABLES) {
    dump.tables[table] = await store.rows(table);
  }

  const file = `db-${now().replaceAll(/[:.]/g, '-')}.json`;
  await store.uploads.put(BACKUP_PREFIX + file, JSON.stringify(dump), {
    httpMetadata: { contentType: 'application/json' },
  });

  // Timestamped names sort chronologically, so "newest 20" is a slice.
  const listed = await store.uploads.list({ prefix: BACKUP_PREFIX });
  const stale = listed.objects.map(o => o.key).sort().reverse().slice(KEEP_BACKUPS);
  if (stale.length) await store.uploads.delete(stale);

  return file;
}

export async function backup({ store, method, admin, parts }) {
  if (method === 'POST') {
    const file = await makeBackup(store);
    await store.logActivity(admin.name, 'backup.create', `Backup ${file}`);
    return json(201, { ok: true, file });
  }
  if (method !== 'GET') return methodNotAllowed();

  if (!parts[0]) {
    const listed = await store.uploads.list({ prefix: BACKUP_PREFIX });
    return json(200, {
      backups: listed.objects
        .map(o => ({ file: o.key.slice(BACKUP_PREFIX.length), size: o.size }))
        .sort((a, b) => b.file.localeCompare(a.file)),
    });
  }

  // Strip any path of its own, so a crafted name cannot read another prefix.
  const file = parts[0].split('/').pop();
  const object = await store.uploads.get(BACKUP_PREFIX + file);
  if (!object) return notFound('Backup not found');

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${file}"`,
    },
  });
}
