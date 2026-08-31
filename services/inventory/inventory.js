/**
 * Vayu — inventory service.
 *
 * Every place stock can change — a sale, an admin edit, a bulk set, a CSV
 * import, a cancelled order — goes through one of the functions here so the
 * `inventory_log` table is written once and the back-in-stock alerts fire
 * from a single spot. Extracted from services/products/catalogue.js and
 * services/orders/checkout.js; the SQL is unchanged.
 */

import { now } from '#shared/database/store.js';
import { totalStock, fireStockAlerts, productById } from '#services/products/catalogue.js';

/**
 * Decrement stock for one order's lines, inside the caller's batch.
 * Returns an array of D1 statements (stock down, sold up, log row) for each
 * line, so checkout.commitOrder can push them into its own batch and keep
 * the whole order atomic.
 */
export function stockDownStatements(store, lines, stamp = now(), actor = 'storefront') {
  const stmts = [];
  for (const l of lines) {
    const label = l.name + (l.variant ? ` — ${l.variant}` : '');
    if (l.variantId) {
      stmts.push(
        store.stmt(
          'UPDATE product_variants SET stock = MAX(0, stock - ?) WHERE id = ?',
          l.qty, l.variantId,
        ),
      );
    } else {
      stmts.push(
        store.stmt('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?', l.qty, l.productId),
      );
    }
    stmts.push(
      store.stmt('UPDATE products SET sold = sold + ? WHERE id = ?', l.qty, l.productId),
      store.stmt(
        'INSERT INTO inventory_log (t, product_id, name, delta, reason, by) VALUES (?, ?, ?, ?, ?, ?)',
        stamp, l.productId, label, -l.qty, 'sale', actor,
      ),
    );
  }
  return stmts;
}

/**
 * Restore stock when an order is cancelled. Each line's quantity goes back
 * onto the product (or variant) and is logged with reason 'cancel'.
 */
export async function restock(store, order) {
  const items = await store.all('SELECT * FROM order_items WHERE order_id = ?', order.id);
  const stamp = now();
  const stmts = [];
  for (const it of items) {
    if (it.variant_id) {
      stmts.push(store.stmt(
        'UPDATE product_variants SET stock = stock + ? WHERE id = ?',
        it.qty, it.variant_id,
      ));
    } else {
      stmts.push(store.stmt('UPDATE products SET stock = stock + ? WHERE id = ?', it.qty, it.product_id));
    }
    stmts.push(store.stmt(
      'INSERT INTO inventory_log (t, product_id, name, delta, reason, by) VALUES (?, ?, ?, ?, ?, ?)',
      stamp, it.product_id, it.name, it.qty, 'cancel', 'admin',
    ));
  }
  if (stmts.length) await store.batch(stmts);

  // Restocking may have brought something back above zero.
  for (const it of items) {
    const product = await productById(store, it.product_id);
    if (product) await fireStockAlerts(store, product);
  }
}

/**
 * Set the stock of a product (or one of its variants) directly, logging the
 * delta. Used by the admin panel's product editor and the bulk stock tool.
 */
export async function setStock(store, productId, qty, { variantId = null, actor = 'admin' } = {}) {
  const stamp = now();
  const product = await productById(store, productId);
  if (!product) return;

  const before = variantId
    ? (Number(product.variants?.find(v => v.id === variantId)?.stock) || 0)
    : totalStock(product);
  const delta = qty - before;

  if (variantId) {
    await store.run('UPDATE product_variants SET stock = ? WHERE id = ?', qty, variantId);
  } else {
    await store.run('UPDATE products SET stock = ? WHERE id = ?', qty, productId);
  }

  await store.run(
    'INSERT INTO inventory_log (t, product_id, name, delta, reason, by) VALUES (?, ?, ?, ?, ?, ?)',
    stamp, productId, product.name, delta, 'adjustment', actor,
  );

  if (qty > 0) await fireStockAlerts(store, product);
}

/**
 * Re-read stock for a set of priced lines at confirm time, returning only
 * the ones that can no longer be filled. Moved here from checkout.js so the
 * oversell check reads from the same service that owns the stock writes.
 */
export async function shortfalls(store, lines) {
  const short = [];
  for (const l of lines) {
    const product = await productById(store, l.productId);
    if (!product) {
      short.push({ label: l.name, wanted: l.qty, available: 0 });
      continue;
    }
    const available = l.variantId
      ? (Number(product.variants?.find(v => v.id === l.variantId)?.stock) || 0)
      : totalStock(product);
    if (available < l.qty) {
      short.push({
        label: l.name + (l.variant ? ` — ${l.variant}` : ''),
        wanted: l.qty,
        available,
      });
    }
  }
  return short;
}
