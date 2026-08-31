/**
 * Vayu — server-side wishlists, with guest merge.
 *
 * A logged-in customer's wishlist lives in the `wishlists` table, not in
 * localStorage. A guest's wishlist lives there too, keyed by an opaque
 * `guest_key` the browser keeps in localStorage under `vayu_sid` (the same
 * id the analytics beacon already mints on first visit, so no new key is
 * needed). The moment that guest signs in, `mergeGuestWishlist` runs one
 * batch that promotes their `guest_key` rows onto their `customer_id` and
 * de-dupes against what they already had — which is the "Browser → temp id
 * → login → merge" flow the platform spec calls for.
 *
 * Ownership is enforced by the CHECK on the table (exactly one of
 * customer_id / guest_key is set) and by the `idx_wishlists_owner_product`
 * unique index, which makes re-saving a piece an upsert rather than a
 * duplicate. Snapshot columns (name/price/img/cat/idx) are written at save
 * time so a wishlist row still shows something when its product is later
 * deleted — the same self-sufficiency the localStorage wishlist had.
 */

import { now } from '#shared/database/store.js';
import { json, methodNotAllowed } from '#shared/utils/http.js';
import { productById } from '#services/products/catalogue.js';

/** Cap a guest key so a stolen/corrupted value cannot index-scan the table. */
const cleanKey = (v) => String(v || '').slice(0, 64);

/**
 * Resolve the owner clause + binds for a wishlist query. `owner` is
 * { customerId } for a signed-in shopper or { guestKey } for a guest —
 * never both, matching the CHECK constraint.
 */
function ownerClause({ customerId, guestKey }) {
  if (customerId) return { sql: 'customer_id = ?', binds: [customerId] };
  return { sql: 'guest_key = ?', binds: [cleanKey(guestKey)] };
}

/**
 * Find a live variant on a product by id or combo key, or null when there
 * is none (no product, no variant id, or no match). Shared by `hydrate`
 * and `addLine`, which previously each spelled this lookup out.
 */
function findVariant(product, variantId) {
  if (!product || !variantId) return null;
  return (product.variants || []).find(v => v.id === variantId || v.combo === variantId) || null;
}

/**
 * Is a wishlist line buyable? A deleted product (no live record) is out of
 * stock; a variant line follows the variant's stock; a plain product is in
 * stock unless the panel tracks stock and has run it down. Split out of
 * `hydrate` as plain branches — no nested ternary to read.
 */
function resolveStock(product, variant) {
  if (!product) return false;
  if (variant) return variant.stock > 0;
  return product.stock === undefined || product.stock > 0;
}

/**
 * Hydrate one wishlist row into the shape the storefront card wants. The
 * product is read live so a name/price/image change in the panel is
 * reflected; a deleted product falls back to the snapshot captured at save
 * time, so the row is still legible.
 */
async function hydrate(store, row) {
  let product = null;
  try {
    product = row.product_id ? await productById(store, row.product_id) : null;
  } catch { /* a deleted product is not a wishlist error */ }

  const variant = findVariant(product, row.variant_id);

  /**
   * Stock, with `!product` load-bearing: a deleted product is the case this
   * whole function is built around — it falls back to the snapshot saved
   * with the row — and reading .stock off that null is a 500 on every
   * wishlist holding a piece the shop has since removed.
   */
  const inStock = resolveStock(product, variant);

  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id || null,
    note: row.note || '',
    createdAt: row.created_at,
    // Live fields, falling back to the row's snapshot for a deleted product.
    name: product?.name || row.name || 'Saved item',
    price: product ? product.price : (row.price || ''),
    img: product ? (variant?.image || product.img) : (row.img || ''),
    cat: product?.categories?.[0]?.slug || row.cat || '',
    idx: product ? product.idx ?? row.idx : row.idx,
    inStock,
    available: !!product,
  };
}

/**
 * The wishlist for one owner, newest first, with each row hydrated.
 * `product_id` is the stable key we save; the snapshot's `cat`/`idx` are
 * kept so legacy /pages/product.html?cat=&idx= links keep working for rows
 * saved before the migration.
 */
export async function listWishlist(store, owner) {
  const { sql, binds } = ownerClause(owner);
  const rows = await store.all(
    `SELECT * FROM wishlists WHERE ${sql} ORDER BY created_at DESC, id DESC`,
    ...binds,
  );
  return Promise.all(rows.map(r => hydrate(store, r)));
}

/** Count, for the header badge. */
export async function wishlistCount(store, owner) {
  const { sql, binds } = ownerClause(owner);
  return store.value(`SELECT COUNT(*) FROM wishlists WHERE ${sql}`, ...binds);
}

/**
 * Add a product to a wishlist, upserting on (owner, product, variant) so a
 * re-save updates the note rather than spawning a duplicate.
 *
 * `cat`/`idx` and a display snapshot (`name`, `price`, `img`) are captured
 * so a row still renders after its product is deleted.
 */
export async function addWishlist(store, owner, line) {
  const cols = [];
  const vals = [];
  const push = (k, v) => { cols.push(k); vals.push(v); };

  if (owner.customerId) push('customer_id', owner.customerId);
  else push('guest_key', cleanKey(owner.guestKey));
  push('product_id', line.productId);
  push('variant_id', line.variantId || null);
  push('note', line.note || '');
  push('cat', line.cat || '');
  push('idx', line.idx ?? 0);
  push('name', line.name || '');
  push('price', line.price || '');
  push('img', line.img || '');
  push('created_at', now());

  await store.run(
    `INSERT INTO wishlists (${cols.join(', ')})
       VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT (COALESCE(customer_id, guest_key), product_id, COALESCE(variant_id, ''))
     DO UPDATE SET note = excluded.note, name = excluded.name, price = excluded.price,
       img = excluded.img, variant_id = excluded.variant_id`,
    ...vals,
  );
  return wishlistCount(store, owner);
}

/** Remove one row. Ownership is checked so a guest cannot touch another's. */
export async function removeWishlist(store, owner, id) {
  const { sql, binds } = ownerClause(owner);
  await store.run(`DELETE FROM wishlists WHERE id = ? AND ${sql}`, id, ...binds);
  return wishlistCount(store, owner);
}

/** Clear the whole wishlist for one owner. */
export async function clearWishlist(store, owner) {
  const { sql, binds } = ownerClause(owner);
  await store.run(`DELETE FROM wishlists WHERE ${sql}`, ...binds);
  return 0;
}

/**
 * Merge a guest's wishlist onto a customer account at sign-in.
 *
 * For each guest row: if the account already has the same (product, variant),
 * drop the guest duplicate; otherwise re-parent the row onto the
 * customer_id. One batch keeps it atomic, and the guest_key is cleared on
 * every row it touched so a second sign-in cannot re-merge.
 *
 * This is the "Browser → temporary ID → login → merge" path: the guest's
 * wishlist never lived only in localStorage, and the merge is server-side
 * and idempotent.
 */
export async function mergeGuestWishlist(store, customerId, guestKey) {
  const key = cleanKey(guestKey);
  if (!key) return 0;

  const guestRows = await store.all(
    'SELECT * FROM wishlists WHERE guest_key = ?', key,
  );
  if (!guestRows.length) return 0;

  const owned = await store.all(
    'SELECT product_id, variant_id FROM wishlists WHERE customer_id = ?', customerId,
  );
  const has = new Set(owned.map(r => `${r.product_id}|${r.variant_id || ''}`));

  const toReparent = [];
  const toDrop = [];
  for (const g of guestRows) {
    if (has.has(`${g.product_id}|${g.variant_id || ''}`)) toDrop.push(g.id);
    else toReparent.push(g.id);
  }

  const stmts = [];
  if (toReparent.length) {
    const holes = toReparent.map(() => '?').join(', ');
    stmts.push(store.stmt(
      `UPDATE wishlists SET customer_id = ?, guest_key = NULL WHERE id IN (${holes})`,
      customerId, ...toReparent,
    ));
  }
  if (toDrop.length) {
    const holes = toDrop.map(() => '?').join(', ');
    stmts.push(store.stmt(`DELETE FROM wishlists WHERE id IN (${holes})`, ...toDrop));
  }
  if (stmts.length) await store.batch(stmts);
  return toReparent.length;
}

/**
 * Resolve the wishlist owner for a plain (non-merge, non-clear) request.
 * A signed-in customer always wins over a posted guestKey; a guest needs a
 * guestKey to own anything, so without one there is no owner and the caller
 * must reject.
 */
function resolveOwner(customer, guestKey) {
  if (customer) return { customerId: customer.id };
  return guestKey ? { guestKey } : null;
}

/** The merge action: promote a guest wishlist onto the signed-in account. */
async function mergeIntoAccount(store, customer, guestKey) {
  if (!customer) return json(401, { error: 'Please sign in to merge a wishlist' });
  const merged = await mergeGuestWishlist(store, customer.id, guestKey);
  return json(200, {
    ok: true, merged,
    wishlist: await listWishlist(store, { customerId: customer.id }),
  });
}

/**
 * A POST to /clear lets a browser that cannot send a real DELETE still
 * wipe the wishlist (some older clients and beacon-based calls).
 */
async function clearAll(store, customer, guestKey) {
  if (!customer && !guestKey) return json(400, { error: 'Sign in or allow storage to save a wishlist' });
  const owner = customer ? { customerId: customer.id } : { guestKey };
  await clearWishlist(store, owner);
  return json(200, { ok: true, count: 0, wishlist: [] });
}

/** The full wishlist for one owner, for GET. */
async function listOwnerWishlist(store, owner) {
  return json(200, {
    wishlist: await listWishlist(store, owner),
    count: await wishlistCount(store, owner),
  });
}

/** Add one line to the wishlist, for POST. */
async function addLine(store, owner, body) {
  if (!body?.productId) return json(400, { error: 'Which product do you want to save?' });
  const product = await productById(store, body.productId);
  if (!product) return json(404, { error: 'That product is no longer available' });
  const line = {
    productId: product.id,
    variantId: body.variantId || null,
    note: body.note || '',
    cat: product.categories?.[0]?.slug || '',
    idx: null,
    name: product.name,
    price: product.price,
    img: findVariant(product, body.variantId)?.image || product.img,
  };
  const count = await addWishlist(store, owner, line);
  return json(201, { ok: true, count, wishlist: await listWishlist(store, owner) });
}

/** Remove one row, or the whole wishlist when no id is given, for DELETE. */
async function removeRows(store, owner, id) {
  if (id) {
    const count = await removeWishlist(store, owner, id);
    return json(200, { ok: true, count, wishlist: await listWishlist(store, owner) });
  }
  await clearWishlist(store, owner);
  return json(200, { ok: true, count: 0, wishlist: [] });
}

/**
 * The /api/account/wishlist route handler.
 *
 *   GET    /api/account/wishlist          → list for the current owner
 *   POST   /api/account/wishlist          → add { productId, variantId?, note?, guestKey? }
 *   DELETE /api/account/wishlist           → clear all (guest or customer)
 *   DELETE /api/account/wishlist/<id>      → remove one row
 *   POST   /api/account/wishlist/merge     → merge a guest wishlist onto the
 *                                            signed-in account { guestKey }
 *
 * Owner resolution: a signed-in customer owns by customer_id; a guest owns
 * by guestKey (the `vayu_sid` the browser already mints for analytics). A
 * guest POST without a guestKey is rejected — there is no owner to attach
 * the row to. A signed-in shopper's guestKey is ignored, so a row saved
 * pre-login is never orphaned.
 */
export async function handleWishlist(ctx) {
  const { store, method, body, customer, parts, query } = ctx;
  const [sub, id] = parts;

  // GET and DELETE carry no body (the dispatcher only parses one for
  // POST/PUT/PATCH), so a guest's key arrives as ?guestKey= on those
  // methods and in the body on POST. Normalise both into one value.
  const guestKey = body?.guestKey || query?.get('guestKey') || '';

  // The merge and clear actions are routed before the owner guard: merge
  // needs the customer rather than a guest key, and clear is its own shape.
  if (sub === 'merge' && method === 'POST') return mergeIntoAccount(store, customer, guestKey);
  if (sub === 'clear' && method === 'POST') return clearAll(store, customer, guestKey);

  const owner = resolveOwner(customer, guestKey);
  if (!owner) return json(400, { error: 'Sign in or allow storage to save a wishlist' });

  if (method === 'GET') return listOwnerWishlist(store, owner);
  if (method === 'POST') return addLine(store, owner, body);
  if (method === 'DELETE') return removeRows(store, owner, id);
  return methodNotAllowed(['GET', 'POST', 'DELETE']);
}
