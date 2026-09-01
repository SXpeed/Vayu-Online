/**
 * Vayu — the D1 data layer.
 *
 * Replaces admin/server/db.js, which held the whole store in one JSON file
 * and rewrote it on every change. Two rules follow from moving to D1 and
 * they shape everything here:
 *
 *   1. Every read is a query. There is no `store.db.products` to reach
 *      into, so hot paths ask for exactly the rows they need and cold
 *      admin paths use the small table helpers at the bottom.
 *   2. Counters are UPDATEs, not read-modify-writes. A page view used to
 *      rewrite the entire analytics document; here it is one UPSERT of one
 *      row, which is also what makes it safe under concurrency.
 *
 * `nextId` keeps the prefixed id format ("prod_12") the JSON store minted,
 * so links, orders and ?id= URLs survive the migration untouched.
 */

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { SHIPPING_DEFAULTS } from '#shared/constants/index.js';

/* ---------- per-request handle ---------- */

/**
 * A thin wrapper around the D1 binding. One instance per request: it
 * carries the bindings and the few helpers every route needs, so route
 * modules take `ctx.store` and never touch `env` directly.
 */
export class Store {
  constructor(env) {
    this.db = env.DB;
    this.uploads = env.UPLOADS;
    // Optional, and every caller treats it as optional: an account without
    // Images enabled, or a `wrangler dev` without the binding, gets an
    // undefined here and falls back to storing and serving the original
    // bytes. See services/media/uploads.js.
    this.images = env.IMAGES;
    this.env = env;
  }

  /* --- query helpers --- */

  /** All rows for a query. */
  all(sql, ...binds) {
    return this.db.prepare(sql).bind(...binds).all().then(r => r.results ?? []);
  }

  /** First row, or null. */
  one(sql, ...binds) {
    return this.db.prepare(sql).bind(...binds).first();
  }

  /** A single scalar from the first row, or null. */
  async value(sql, ...binds) {
    const row = await this.one(sql, ...binds);
    return row ? Object.values(row)[0] : null;
  }

  /** Write, returning D1's meta (changes, last_row_id). */
  run(sql, ...binds) {
    return this.db.prepare(sql).bind(...binds).run();
  }

  /**
   * Several statements in one round trip. D1 wraps a batch in a
   * transaction, so this is also how a multi-table write stays atomic —
   * order commits, for instance, must not half-apply.
   */
  batch(statements) {
    return this.db.batch(statements);
  }

  /** A bound statement for use inside batch(). */
  stmt(sql, ...binds) {
    return this.db.prepare(sql).bind(...binds);
  }

  /* --- ids --- */

  /**
   * The next prefixed id. One UPDATE ... RETURNING keeps the counter
   * correct even when two requests mint ids at the same moment, which the
   * old `db.meta.seq += 1` could not promise.
   */
  async nextId(prefix) {
    const row = await this.one('UPDATE meta SET seq = seq + 1 WHERE id = 1 RETURNING seq');
    return `${prefix}_${row.seq}`;
  }

  /* --- config documents --- */

  /** One config document ('settings' | 'content'), parsed. */
  async config(scope) {
    const rows = await this.all('SELECT key, value FROM config WHERE scope = ?', scope);
    const out = {};
    for (const r of rows) {
      try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
    }
    return out;
  }

  /** Replace one key of a config document. */
  putConfig(scope, key, value) {
    return this.run(
      `INSERT INTO config (scope, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      scope, key, JSON.stringify(value), now(),
    );
  }

  /** The store settings, with the defaults the app expects. */
  async settings() {
    const c = await this.config('settings');
    return {
      storeName: 'Vayu',
      currency: 'INR',
      freeShippingAbove: SHIPPING_DEFAULTS.freeAbove,
      shippingFlat: SHIPPING_DEFAULTS.flat,
      lowStockThreshold: 5,
      zones: [],
      // Provider only. The Razorpay key and secret are Workers secrets
      // (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) and are deliberately absent
      // from this shape — leaving the fields here would keep suggesting the
      // database is somewhere credentials may be put.
      payment: { provider: 'cod' },
      storeAddress: '',
      storeEmail: '',
      storePhone: '',
      ...c,
    };
  }

  /* --- append-only logs --- */

  /** Record a stock movement so Inventory history can explain every change. */
  logInventory(productId, name, delta, reason, by) {
    if (!delta) return Promise.resolve();
    return this.run(
      'INSERT INTO inventory_log (t, product_id, name, delta, reason, by) VALUES (?, ?, ?, ?, ?, ?)',
      now(), productId, name, delta, reason, by,
    );
  }

  logActivity(admin, action, detail) {
    return this.run(
      'INSERT INTO activity (t, admin, action, detail) VALUES (?, ?, ?, ?)',
      now(), admin, action, detail,
    );
  }

  /** Queue an email in the outbox (sent by hand until SMTP exists). */
  async queueEmail(to, subject, body, event) {
    if (!to) return;
    await this.run(
      'INSERT INTO outbox (id, to_addr, subject, body, event, status, t) VALUES (?, ?, ?, ?, ?, ?, ?)',
      await this.nextId('mail'), to, subject, body, event || '', 'queued', now(),
    );
  }

  /* --- cold-path table helpers ---
     The admin panel edits one record at a time and is used by one operator,
     so these read and write whole rows by id rather than hand-rolling SQL
     in every route. */

  /** Every row of a table, oldest-first unless ordered otherwise. */
  rows(table, { order = 'rowid', limit = 0 } = {}) {
    const sql = `SELECT * FROM ${ident(table)} ORDER BY ${order}${limit ? ` LIMIT ${Number(limit)}` : ''}`;
    return this.all(sql);
  }

  row(table, idColumn, id) {
    return this.one(`SELECT * FROM ${ident(table)} WHERE ${ident(idColumn)} = ?`, id);
  }

  /** Insert or replace a whole row from a plain object. */
  upsert(table, data, conflictColumns) {
    const keys = Object.keys(data);
    const cols = keys.map(ident).join(', ');
    const holes = keys.map(() => '?').join(', ');
    const updates = keys
      .filter(k => !conflictColumns.includes(k))
      .map(k => `${ident(k)} = excluded.${ident(k)}`)
      .join(', ');
    const sql = `INSERT INTO ${ident(table)} (${cols}) VALUES (${holes})
      ON CONFLICT (${conflictColumns.map(ident).join(', ')})
      DO UPDATE SET ${updates || `${ident(conflictColumns[0])} = excluded.${ident(conflictColumns[0])}`}`;
    return this.run(sql, ...keys.map(v => sqlValue(data[v])));
  }

  /** Patch named columns of one row. */
  update(table, idColumn, id, patch) {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve();
    const sets = keys.map(k => `${ident(k)} = ?`).join(', ');
    return this.run(
      `UPDATE ${ident(table)} SET ${sets} WHERE ${ident(idColumn)} = ?`,
      ...keys.map(k => sqlValue(patch[k])), id,
    );
  }

  remove(table, idColumn, id) {
    return this.run(`DELETE FROM ${ident(table)} WHERE ${ident(idColumn)} = ?`, id);
  }
}

/* ---------- values ---------- */

/** Quote an identifier. Table and column names here are ours, never input. */
function ident(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

/** D1 binds only null, number, string and ArrayBuffer — map the rest. */
export function sqlValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

export const bool = (v) => (v ? 1 : 0);

export const now = () => new Date().toISOString();

export const today = () => new Date().toISOString().slice(0, 10);

export const formatPrice = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN');

export const parsePrice = (str) => Number(String(str).replace(/[^\d.]/g, '')) || 0;

/** Last 10 digits, so "+91 98123 45678" and "9812345678" compare equal. */
export const normPhone = (p) => String(p || '').replaceAll(/[^\d]/g, '').slice(-10);

/* ---------- passwords ---------- */

/**
 * scrypt, the same parameters the Node server used — verified to work
 * under the Workers runtime with nodejs_compat, which is what lets every
 * existing admin and customer password keep working after the migration.
 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const randomToken = () => randomBytes(32).toString('hex');
