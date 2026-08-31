/**
 * Vayu — schemas for /api/account/*.
 *
 * The address fields mirror the caps the handlers already applied by hand in
 * readAddress(); stating them once here means the two cannot drift.
 */

import { z } from 'zod';
import { email } from './public.js';

/**
 * Eight characters is the floor the site already enforced. It is stated here
 * rather than only in the handler so a caller gets a real message back
 * instead of a generic rejection.
 */
const password = z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(200, 'That password is too long.');

export const register = z.object({
    name: z.string().trim().max(120).optional(),
    email,
    password,
    // The browser's temp id, so a guest wishlist built before sign-up is
    // merged onto the new account. Optional — an old client or a blocked
    // localStorage has none, and that is fine.
    guestKey: z.string().max(64).optional(),
    phone: z.string().trim().max(20).optional(),
});

export const login = z.object({
    email,
    password: z.string().min(1, 'Enter your password.').max(200),
    // Same as register: promote a guest wishlist onto the account at login.
    guestKey: z.string().max(64).optional(),
});

export const updateProfile = z.object({
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(20).optional(),
});

export const changePassword = z.object({
    current: z.string().min(1).max(200),
    next: password,
});

export const address = z.object({
    label: z.string().trim().max(40).optional(),
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    address: z.string().trim().min(1, 'Enter a street address.').max(400),
    city: z.string().trim().max(80).optional(),
    pin: z.string().trim().min(1, 'Enter a PIN code.').max(12),
    isDefault: z.boolean().optional(),
});

/**
 * Adding a product to the wishlist. `productId` is the only required field;
 * `variantId` is the chosen option combo (or null for a flat product), and
 * `guestKey` is the browser's temp id when the shopper is not signed in —
 * the handler picks the owner from the session or this key.
 */
export const wishlistAdd = z.object({
    productId: z.string().trim().min(1, 'Which product?').max(40),
    variantId: z.string().max(60).nullish(),
    note: z.string().max(500).optional(),
    guestKey: z.string().max(64).optional(),
});

/** Merge a guest wishlist onto the now-signed-in account. */
export const wishlistMerge = z.object({
    guestKey: z.string().trim().min(1, 'A guest key is required.').max(64),
});

/** Clear the wishlist — no body fields, but the schema exists so an empty
 *  body is accepted explicitly rather than falling through. */
export const wishlistClear = z.object({}).optional();
