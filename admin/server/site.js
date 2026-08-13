/**
 * Vayu admin — running the shop rather than stocking it: storefront copy,
 * store settings, team access, image uploads, CSV exports and backups.
 */

const fs = require('node:fs');
const path = require('node:path');
const store = require('./db');
const { sendJson, sendCsv, resource } = require('./http');

const SITE_ROOT = path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.join(SITE_ROOT, 'assets', 'images', 'uploads');
const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const ROLES = ['owner', 'manager', 'staff'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

function content({ res, method, admin, body }) {
  const c = store.db.content;
  if (method === 'GET') return sendJson(res, 200, { content: c });
  if (method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed' });

  for (const k of TEXT_FIELDS) {
    if (body[k] !== undefined) c[k] = String(body[k]).slice(0, 300);
  }
  if (Array.isArray(body.heroSlides)) c.heroSlides = sanitizeSlides(body.heroSlides);

  store.logActivity(admin.name, 'content.update', 'Updated site content');
  store.save();
  sendJson(res, 200, { content: c });
}

/* ================= store settings ================= */

const money = (v, fallback) => Math.max(0, Number(v ?? fallback) || 0);

function settings({ res, method, admin, body }) {
  const s = store.db.settings;
  if (method === 'GET') return sendJson(res, 200, { settings: s });
  if (method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed' });

  s.storeName = String(body.storeName ?? s.storeName);
  s.freeShippingAbove = money(body.freeShippingAbove, s.freeShippingAbove);
  s.shippingFlat = money(body.shippingFlat, s.shippingFlat);
  s.lowStockThreshold = money(body.lowStockThreshold, s.lowStockThreshold);
  s.storeAddress = String(body.storeAddress ?? s.storeAddress);
  s.storeEmail = String(body.storeEmail ?? s.storeEmail);
  s.storePhone = String(body.storePhone ?? s.storePhone);

  if (Array.isArray(body.zones)) {
    s.zones = body.zones
      .filter(z => z && String(z.name || '').trim())
      .map(z => ({
        name: String(z.name).slice(0, 60),
        pinPrefixes: String(z.pinPrefixes ?? '').split(',').map(x => x.trim()).filter(Boolean),
        rate: Math.max(0, Number(z.rate) || 0),
      }));
  }

  if (body.payment) {
    s.payment = {
      provider: body.payment.provider === 'razorpay' ? 'razorpay' : 'cod',
      razorpayKeyId: String(body.payment.razorpayKeyId ?? s.payment.razorpayKeyId ?? ''),
      razorpayKeySecret: String(body.payment.razorpayKeySecret ?? s.payment.razorpayKeySecret ?? ''),
    };
  }

  store.logActivity(admin.name, 'settings.update', 'Updated store settings');
  store.save();
  sendJson(res, 200, { settings: s });
}

/* ================= team ================= */

const publicAdmin = (a) => ({ id: a.id, name: a.name, email: a.email, role: a.role, createdAt: a.createdAt });

function team(ctx) {
  return resource(ctx, {
    notFound: 'Member not found',
    find: (id) => store.db.admins.find(a => a.id === id),

    list({ res }) {
      sendJson(res, 200, { team: store.db.admins.map(publicAdmin) });
    },

    create({ res, admin, body }) {
      const email = String(body.email || '').toLowerCase().trim();
      if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: 'Valid email required' });
      if (store.db.admins.some(a => a.email === email)) {
        return sendJson(res, 409, { error: 'That email already has access' });
      }
      if (String(body.password || '').length < 8) {
        return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
      }

      const member = {
        id: store.nextId('adm'),
        email,
        name: String(body.name || email.split('@')[0]),
        ...store.hashPassword(body.password),
        role: ROLES.includes(body.role) ? body.role : 'staff',
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      };
      store.db.admins.push(member);
      store.logActivity(admin.name, 'team.add', `Added ${member.name} as ${member.role}`);
      store.save();
      sendJson(res, 201, { member: publicAdmin(member) });
    },

    update({ res, admin, body }, member) {
      if (body.role && ROLES.includes(body.role)) member.role = body.role;
      if (body.name) member.name = String(body.name);
      store.logActivity(admin.name, 'team.update', `Updated ${member.name} (${member.role})`);
      store.save();
      sendJson(res, 200, { member: publicAdmin(member) });
    },

    remove({ res, admin }, member) {
      if (member.id === admin.id) return sendJson(res, 400, { error: "You can't remove yourself" });
      if (member.role === 'owner' && store.db.admins.filter(a => a.role === 'owner').length === 1) {
        return sendJson(res, 400, { error: 'The last owner cannot be removed' });
      }
      store.db.admins = store.db.admins.filter(a => a.id !== member.id);
      // Revoke their sessions too, or a removed member stays signed in.
      for (const [tok, sess] of Object.entries(store.db.sessions)) {
        if (sess.adminId === member.id) delete store.db.sessions[tok];
      }
      store.logActivity(admin.name, 'team.remove', `Removed ${member.name}`);
      store.save();
      sendJson(res, 200, { ok: true });
    },
  });
}

/* ================= image upload ================= */

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
const MAX_UPLOAD = 8 * 1024 * 1024;

/** Accepts a data: URL from the panel (which has already downscaled it). */
function upload({ res, method, body }) {
  if (method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const name = String(body.name || 'upload.png');
  const ext = path.extname(name).toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) return sendJson(res, 400, { error: 'Unsupported image type' });

  const data = String(body.data || '');
  const buf = Buffer.from(data.includes(',') ? data.slice(data.indexOf(',') + 1) : data, 'base64');
  if (!buf.length) return sendJson(res, 400, { error: 'Empty file' });
  if (buf.length > MAX_UPLOAD) return sendJson(res, 400, { error: 'Image larger than 8 MB' });

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const base = path.basename(name, ext).toLowerCase().replaceAll(/[^a-z0-9_-]/g, '_').slice(0, 40);
  const file = `${base}_${Date.now()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  sendJson(res, 201, { url: `/assets/images/uploads/${file}` });
}

/* ================= CSV exports ================= */

const EXPORTS = {
  'products.csv': () => [
    ['id', 'name', 'price', 'stock', 'status', 'sku', 'categories', 'views', 'sold', 'createdAt'],
    ...store.db.products.map(p => [
      p.id, p.name, p.price, p.stock, p.status, p.sku,
      p.categories.map(c => c.cat + (c.sub ? ':' + c.sub : '')).join('|'),
      p.views || 0, p.sold || 0, p.createdAt,
    ]),
  ],
  'orders.csv': () => [
    ['number', 'date', 'customer', 'email', 'items', 'subtotal', 'shipping', 'total', 'status'],
    ...store.db.orders.map(o => [
      o.number, o.createdAt, o.customer.name, o.customer.email,
      o.items.map(i => `${i.name} x${i.qty}`).join('|'),
      o.subtotal, o.shipping, o.total, o.status,
    ]),
  ],
  'subscribers.csv': () => [
    ['email', 'date'],
    ...store.db.subscribers.map(s => [s.email, s.t]),
  ],
};

function exportCsv({ res, parts }) {
  const build = EXPORTS[parts[0]];
  if (!build) return sendJson(res, 404, { error: 'Not found' });
  sendCsv(res, 'vayu-' + parts[0], build());
}

/* ================= backups ================= */

const KEEP_BACKUPS = 20;

/** Copy db.json aside, newest 20 kept. Returns the filename, or null. */
function makeBackup() {
  const src = path.join(DATA_DIR, 'db.json');
  if (!fs.existsSync(src)) return null;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `db-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`;
  fs.copyFileSync(src, path.join(BACKUP_DIR, name));

  // Timestamped names sort chronologically, so "newest 20" is a slice.
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse();
  for (const f of files.slice(KEEP_BACKUPS)) fs.unlinkSync(path.join(BACKUP_DIR, f));
  return name;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .sort().reverse()
    .map(f => ({ file: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size }));
}

function backup({ res, method, admin, parts }) {
  if (method === 'POST') {
    const file = makeBackup();
    store.logActivity(admin.name, 'backup.create', `Backup ${file}`);
    return sendJson(res, 201, { ok: true, file });
  }
  if (method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!parts[0]) return sendJson(res, 200, { backups: listBackups() });

  // basename() keeps a crafted id from walking out of the backup folder.
  const file = path.basename(parts[0]);
  const full = path.join(BACKUP_DIR, file);
  if (!fs.existsSync(full)) return sendJson(res, 404, { error: 'Backup not found' });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${file}"`,
  });
  res.end(fs.readFileSync(full));
}

module.exports = { content, settings, team, upload, exportCsv, backup, makeBackup };
