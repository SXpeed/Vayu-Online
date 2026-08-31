/**
 * Vayu — users service barrel.
 *
 * Customer accounts, server-backed wishlists, and admin team/settings
 * management. Accounts and wishlist are siblings and import each other, so
 * this barrel exposes the combined surface without leaking the file layout.
 */

export * from './accounts.js';
export * from './wishlist.js';
export * from './admin.js';

/** Vayu users service — customer accounts, wishlist, admin site/team/settings. */
export * from './accounts.js';
export * from './wishlist.js';
export * from './admin.js';
