/**
 * Vayu — products service barrel.
 *
 * Catalogue reads and admin writes. Both modules are siblings and import
 * each other, so this file re-exports the surface each app needs without
 * coupling the apps to the internal file layout.
 */

export * from './catalogue.js';
export * from './storefront.js';
export * from './admin.js';

/** Vayu products service — catalogue reads + admin product management. */
export * from './catalogue.js';
export * from './storefront.js';
export * from './admin.js';
