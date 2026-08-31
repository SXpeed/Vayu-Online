/**
 * Vayu — inventory service barrel.
 *
 * The single stock ledger: every stock write across the storefront, the
 * admin panel and the orders pipeline goes through `stockDownStatements`,
 * `restock` or `setStock` so `inventory_log` is written once and the
 * back-in-stock alerts fire from one place.
 */

export * from './inventory.js';

/** Vayu inventory service — stock writes, restock, adjustment, shortfall checks. */
export { stockDownStatements, restock, setStock, shortfalls } from './inventory.js';
