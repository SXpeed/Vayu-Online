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

import { json, ok, csv, badRequest, notFound, methodNotAllowed, resource } from '#shared/utils/http.js';
import { now, hashPassword } from '#shared/database/store.js';
import { loadProducts, totalStock } from '#services/products/catalogue.js';
import {
  encodeList, encodeBool, encodeCategories, encodeSpecs, encodeOptions, encodeVariants,
} from '#shared/utils/product-csv.js';
import { sanitizeSpecs } from '#services/products/admin.js';
import { SOCIAL_KEYS } from '#shared/content/contact.js';

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
    // Optional: with none set, the phone gets the desktop image as before.
    imgMobile: String(s.imgMobile || '').trim().slice(0, 300),
    alt: String(s.alt || '').slice(0, 200),
    title: String(s.title || '').slice(0, 120),
    ctaText: String(s.ctaText || '').slice(0, 60),
    ctaHref: String(s.ctaHref || '').slice(0, 300),
  }));

/**
 * The Curated Spaces page.
 *
 * A room is kept only if it has an image, the same rule slides follow: a
 * row left behind by "+ Add room" would otherwise render as a plate-shaped
 * hole on the page. `category` is normalised to a slug because it is
 * looked up against the catalogue by that key.
 */
const sanitizeRooms = (rooms) => rooms
  .filter(r => r && String(r.img || '').trim())
  .slice(0, 12)
  .map(r => ({
    img: String(r.img).trim().slice(0, 300),
    alt: String(r.alt || '').slice(0, 200),
    name: String(r.name || '').slice(0, 120),
    tag: String(r.tag || '').slice(0, 60),
    category: String(r.category || '').trim().toLowerCase().slice(0, 64),
  }));

const CURATED_TEXT = ['title', 'meta', 'heroImg', 'heroAlt', 'statement', 'sectionTitle', 'sectionNote', 'shopTitle'];

/**
 * Only the keys the panel actually sent are written, so a future form that
 * edits one half of the page cannot blank the other half by omission.
 */
function sanitizeCurated(body) {
  const out = {};
  for (const k of CURATED_TEXT) {
    if (body[k] !== undefined) out[k] = String(body[k]).slice(0, 600);
  }
  if (Array.isArray(body.rooms)) out.rooms = sanitizeRooms(body.rooms);
  return out;
}

/**
 * The home page's "Inside Vayu" block: a heading, a link, one wide picture
 * and the thumbnails under it.
 *
 * Clamped the same way the hero slides are — a public shape written by an
 * admin still has to have bounds — and the tile list is capped at four,
 * which is what the row can hold before it wraps into something the design
 * has no rule for.
 */
function sanitizeInsideVayu(v) {
  const text = (x, n) => String(x ?? '').trim().slice(0, n);
  return {
    title: text(v.title, 80),
    ctaText: text(v.ctaText, 60),
    ctaHref: text(v.ctaHref, 400),
    heroImg: text(v.heroImg, 400),
    heroAlt: text(v.heroAlt, 300),
    heroHref: text(v.heroHref, 400),
    tiles: (Array.isArray(v.tiles) ? v.tiles : []).slice(0, 4).map(t => ({
      img: text(t?.img, 400),
      alt: text(t?.alt, 300),
      href: text(t?.href, 400),
    })).filter(t => t.img),
  };
}

/**
 * The artist band under Inside Vayu: a picture, what it shows, and where it
 * goes. Clamped like everything else a shop can type into a public page.
 */
function sanitizeArtist(v) {
  const text = (x, n) => String(x ?? '').trim().slice(0, n);
  return {
    img: text(v.img, 400),
    alt: text(v.alt, 300),
    href: text(v.href, 400),
  };
}

/** The artist index page's copy: everything on it that is not an artist. */
const ARTIST_PAGE_TEXT = [
  ['title', 120], ['meta', 120], ['heroImg', 400], ['heroAlt', 300],
  ['heroLabel', 200], ['statement', 1000], ['sectionTitle', 120],
];

function sanitizeArtistPage(v) {
  const out = {};
  for (const [k, n] of ARTIST_PAGE_TEXT) out[k] = String(v?.[k] ?? '').trim().slice(0, n);
  return out;
}

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
  // Boolean, so `!== undefined` rather than a truthiness test — otherwise
  // turning the box OFF would look like "not sent" and never be saved.
  if (body.productTileBox !== undefined) {
    writes.push(store.putConfig('content', 'productTileBox', !!body.productTileBox));
  }
  if (body.curatedSpaces && typeof body.curatedSpaces === 'object') {
    writes.push(store.putConfig('content', 'curatedSpaces', sanitizeCurated(body.curatedSpaces)));
  }
  if (body.insideVayu && typeof body.insideVayu === 'object') {
    writes.push(store.putConfig('content', 'insideVayu', sanitizeInsideVayu(body.insideVayu)));
  }
  // Clamped rather than refused: the header has to be left with something
  // to draw, and "all of them" is the behaviour this setting exists to end.
  if (body.menuShows !== undefined) {
    const n = Math.trunc(Number(body.menuShows)) || 1;
    writes.push(store.putConfig('content', 'menuShows', Math.min(6, Math.max(1, n))));
  }
  if (body.artistPage && typeof body.artistPage === 'object') {
    writes.push(store.putConfig('content', 'artistPage', sanitizeArtistPage(body.artistPage)));
  }
  if (body.contact && typeof body.contact === 'object') {
    writes.push(store.putConfig('content', 'contact', sanitizeContact(body.contact)));
  }
  if (body.artist && typeof body.artist === 'object') {
    writes.push(store.putConfig('content', 'artist', sanitizeArtist(body.artist)));
  }
  if (body.productDefaults && typeof body.productDefaults === 'object') {
    writes.push(store.putConfig('content', 'productDefaults', {
      description: String(body.productDefaults.description || '').slice(0, 2000),
      care: String(body.productDefaults.care || '').slice(0, 2000),
      dimensions: sanitizeSpecs(body.productDefaults.dimensions),
      materials: sanitizeSpecs(body.productDefaults.materials),
    }));
  }
  await Promise.all(writes);
  await store.logActivity(admin.name, 'content.update', 'Updated site content');

  return json(200, { content: await store.config('content') });
}

/**
 * Contact details: the phone number, the email address and the four social
 * profiles printed in both footers.
 *
 * Only the keys the panel actually sent are written, the same rule the
 * curated page follows — a future form that edits the phone alone must not
 * blank the email by omission.
 *
 * The social URLs go through `externalUrl`. They are the only values in the
 * whole content document that end up as an `href` pointing off-site, on
 * every page of the shop, and an admin account is not the same thing as a
 * trusted one: a stored `javascript:` URL in the footer would run on every
 * page anyone opened. http(s) only, and anything else is stored empty, which
 * the footer then draws as "this network is not shown" rather than as a mark
 * that goes somewhere unexpected.
 *
 * An empty social value is kept as an empty string rather than dropped,
 * because empty is meaningful here: it is how the shop says "we are not on
 * Pinterest" and takes the icon off the footer. See contactEffective().
 */
const externalUrl = (value) => {
  const raw = String(value || '').trim().slice(0, 400);
  if (!raw) return '';
  try {
    const { protocol } = new URL(raw);
    return protocol === 'http:' || protocol === 'https:' ? raw : '';
  } catch {
    // Not a URL at all — a bare "instagram.com/vayu" is the likely typo, and
    // guessing a scheme for it would be inventing a destination.
    return '';
  }
};

function sanitizeContact(body) {
  const out = {};
  if (body.phone !== undefined) out.phone = String(body.phone || '').trim().slice(0, 40);
  if (body.email !== undefined) out.email = String(body.email || '').trim().slice(0, 254);
  for (const key of SOCIAL_KEYS) {
    if (body[key] !== undefined) out[key] = externalUrl(body[key]);
  }
  return out;
}

/* ================= store settings ================= */

const money = (v, fallback) => Math.max(0, Number(v ?? fallback) || 0);

export async function settings({ store, env, method, admin, body }) {
  const s = await store.settings();

  /**
   * What the panel is allowed to see about payment.
   *
   * The keys are never returned. They used to be — the GET sent
   * razorpayKeySecret to the browser so the form could show it — which meant
   * a live payment secret travelled to every admin's machine on every visit
   * to Settings. What the panel actually needs is one boolean: is Razorpay
   * usable or not.
   */
  const view = (row) => ({
    ...row,
    payment: {
      provider: row.payment?.provider === 'razorpay' ? 'razorpay' : 'cod',
      razorpayConfigured: !!(env?.RAZORPAY_KEY_ID && env?.RAZORPAY_KEY_SECRET),
      razorpayKeyId: env?.RAZORPAY_KEY_ID || '',
    },
  });

  if (method === 'GET') return json(200, { settings: view(s) });
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
    // Provider only. The keys are Workers secrets and are deliberately not
    // writable from here: anything this handler persists lands in a D1 row
    // that backups copy and the panel can read back, which is exactly the
    // property a payment secret must not have.
    next.payment = {
      provider: body.payment.provider === 'razorpay' ? 'razorpay' : 'cod',
    };
  }

  // One key per field, so two admins editing different sections do not
  // overwrite each other the way one settings blob would.
  await Promise.all(Object.entries(next).map(([k, v]) => store.putConfig('settings', k, v)));
  await store.logActivity(admin.name, 'settings.update', 'Updated store settings');

  return json(200, { settings: view(await store.settings()) });
}

/* ================= team ================= */

const publicAdmin = (a) => ({
  id: a.id, name: a.name, email: a.email, role: a.role, createdAt: a.created_at,
  // 'pending' is somebody Google has identified and nobody has approved.
  // The panel needs to tell the two apart to offer Approve rather than the
  // role selector, so it is part of the public shape rather than inferred.
  status: a.status || 'active',
  provider: a.auth_provider || 'password',
  // '' for a password admin, and for anyone who has not signed in since this
  // landed. The panel falls back to initials rather than a broken image.
  avatar: a.avatar || '',
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
      // Approval, and deliberately one-way: a request can be turned into an
      // active member, but nothing here can push an active member back to
      // 'pending'. Withdrawing access is DELETE, which also revokes their
      // sessions — suspending someone by flipping a column would leave them
      // signed in with the cookie they already hold.
      if (body.status === 'active' && member.status === 'pending') {
        patch.status = 'active';
      }
      await store.update('admins', 'id', member.id, patch);

      const fresh = await store.row('admins', 'id', member.id);
      await store.logActivity(
        admin.name,
        patch.status === 'active' ? 'team.approve' : 'team.update',
        patch.status === 'active'
          ? `Approved ${fresh.email} as ${fresh.role}`
          : `Updated ${fresh.name} (${fresh.role})`,
      );
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
 * Measure the picture, so the markup can state its size.
 *
 * An <img> with no width and height is a box of unknown size: the browser
 * lays the page out without it and shoves everything down when the bytes
 * land. Every picture that ships with the site is measured at build time
 * (scripts/images.mjs) and every upload was not — nothing could measure a
 * file that would not exist until an admin chose it.
 *
 * So it is measured here, at the one moment the bytes are in hand, and the
 * numbers are written into the KEY: `chair_1724692000000_1600x1067.webp`.
 * That is deliberate and it is the whole trick. The key is the only thing
 * stored — it goes into a product row, a category banner, a hero slide — and
 * a URL that carries its own dimensions needs no schema change, no second
 * lookup, and no migration of the rows already written. Anything without the
 * suffix is an older upload and simply goes on being sizeless, which is
 * exactly what it is today.
 *
 * The metadata is written to R2 as well, since it costs nothing and is the
 * honest home for it if the key is ever not enough.
 *
 * Returns { key, width, height } — with the dimensions null whenever they
 * could not be had, which covers SVG (no intrinsic pixels), an account
 * without Images enabled, and a file the decoder refuses.
 */
async function measured(images, binary, base, ext) {
  const stamp = Date.now();
  let width = null;
  let height = null;

  try {
    const info = await images?.info(new Response(binary).body);
    if (Number.isFinite(info?.width) && Number.isFinite(info?.height)) {
      width = info.width;
      height = info.height;
    }
  } catch { /* unmeasurable: fall through to a key without the suffix */ }

  const size = width && height ? `_${width}x${height}` : '';
  return { key: `images/${base}_${stamp}${size}${ext}`, width, height };
}

/**
 * Accepts a data: URL from the panel (which has already downscaled it) and
 * puts the bytes in R2. The returned URL is served by the Worker from
 * /uploads/*, which is why nothing else in the panel had to change.
 *
 * The bytes stored are the originals as sent. Resizing and re-encoding
 * happen on the way out instead (services/media/uploads.js), which is what
 * lets one upload serve a 320px AVIF to a phone and a 1600px one to a
 * desktop without the panel having to guess in advance which the shop will
 * need.
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

  const { key, width, height } = await measured(store.images, binary, base, ext);

  await store.uploads.put(key, binary, {
    httpMetadata: { contentType },
    customMetadata: width && height
      ? { width: String(width), height: String(height) }
      : undefined,
  });

  return json(201, { url: `/uploads/${key}`, width, height });
}

/* ================= CSV exports ================= */

const EXPORTS = {
  /**
   * Every field the product editor writes, not the ten the export used to
   * carry. A backup you cannot restore from, or a spreadsheet that silently
   * drops the description, the SEO copy and every option, is worse than no
   * export at all — it looks complete.
   *
   * The nested parts are flattened with characters that do not occur in the
   * data they carry, so a cell survives a round trip through a spreadsheet:
   *
   *   categories   fashion:men|decor
   *   gallery      /a.jpg|/b.jpg
   *   tags         khadi|handwoven
   *   dimensions   Chest=42 in|Length=40 in
   *   options      Colour(swatch)=Indigo,Natural|Size(text)=S,M,L
   *   variants     Colour=Indigo|Size=S @8500 x12 ; Colour=Indigo|Size=M @8500 x12
   *
   * The importer matches columns by name and ignores the ones it does not
   * know, so the extra columns cost it nothing — an exported file still
   * re-imports.
   */
  async 'products.csv'(store) {
    const products = await loadProducts(store);
    return [
      [
        'id', 'name', 'slug', 'status', 'price', 'compareAt', 'sku',
        'stock', 'sellableStock', 'isNew', 'categories', 'tags',
        'description', 'care', 'dimensions', 'materials', 'shippingPreset',
        'img', 'gallery', 'options', 'variants',
        'metaTitle', 'metaDescription',
        'views', 'sold', 'sortOrder', 'publishAt', 'createdAt', 'updatedAt',
      ],
      ...products.map(p => [
        p.id, p.name, p.slug, p.status, p.price, p.compareAt ?? '', p.sku,
        // Both: `stock` is the column the product carries, `sellableStock`
        // is what the shop will actually sell — they differ for anything
        // with variants, and only the second one is the truth.
        p.stock, totalStock(p), encodeBool(p.isNew),
        encodeCategories(p.categories),
        encodeList(p.tags),
        p.description, p.care,
        encodeSpecs(p.dimensions), encodeSpecs(p.materials),
        p.shippingPreset,
        p.img, encodeList(p.gallery),
        encodeOptions(p.options),
        encodeVariants(p.variants, p.price),
        p.metaTitle, p.metaDescription,
        p.views || 0, p.sold || 0, p.sortOrder || 0,
        p.publishAt ?? '', p.createdAt, p.updatedAt,
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
  'coupons', 'coupon_restrictions', 'coupon_uses', 'journal',
  'subscribers', 'stock_alerts', 'outbox', 'inventory_log', 'carts', 'search_terms', 'events',
  // Added with the features that introduced them. A table missing from this
  // list is a table the download cannot restore, and nothing says so at the
  // time: the backup succeeds and is simply short. product_options and
  // product_option_values are still missing for that reason.
  'press', 'artists', 'product_specs', 'shipping_presets',
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
