/**
 * Vayu — schemas for the endpoints anyone on the internet can POST to.
 *
 * These are the highest-value ones: everything here takes untrusted input.
 * The handlers already clamp what they store (cleanText, length caps), and
 * that stays — this is a gate in front of it, not a replacement for it, so a
 * malformed body is rejected before it reaches a D1 statement at all.
 */

import { z } from 'zod';

/** The site's own email rule, kept identical so behaviour does not shift. */
export const email = z
    .string()
    .trim()
    .min(3)
    .max(254)
    .regex(/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/, 'Enter a valid email address.');

const id = z.string().trim().min(1).max(64);
const shortText = (max) => z.string().trim().max(max);

/** A cart line as the storefront sends it. Prices are display strings. */
export const cartLine = z.object({
    id: id.optional(),
    cat: shortText(40).optional(),
    idx: z.number().int().min(0).max(9999).optional(),
    name: shortText(200).optional(),
    price: shortText(40).optional(),
    img: shortText(400).optional(),
    variant: shortText(120).nullable().optional(),
    qty: z.number().int().min(1).max(99).default(1),
});

export const newsletter = z.object({ email });

export const notifyMe = z.object({
    productId: id,
    email,
});

export const review = z.object({
    productId: id,
    name: shortText(120).min(1, 'Please add your name.'),
    rating: z.coerce.number().int().min(1).max(5),
    text: shortText(2000).min(1, 'Please write a few words.'),
});

export const couponValidate = z.object({
    code: shortText(40).min(1),
    items: z.array(cartLine).max(100).default([]),
});

export const checkout = z.object({
    items: z.array(cartLine).min(1, 'Your cart is empty.').max(100),
    coupon: shortText(40).optional(),
    details: z.object({
        name: shortText(120),
        email: email.optional().or(z.literal('')),
        phone: shortText(20),
        address: shortText(400),
        city: shortText(80),
        pin: shortText(12),
    }).partial().optional(),
    payment: z.enum(['cod', 'razorpay']).optional(),
}).passthrough();

export const checkoutConfirm = z.object({
    rzpPaymentId: shortText(120),
    rzpOrderId: shortText(120),
    rzpSignature: shortText(256),
}).passthrough();

/**
 * The analytics beacon. Deliberately permissive on shape but hard-capped on
 * size: it is fire-and-forget from every page, and a rejected beacon would
 * be a silent hole in the numbers rather than a visible error.
 */
export const track = z.object({
    type: shortText(40).optional(),
    path: shortText(400).optional(),
    ref: shortText(400).optional(),
    sid: shortText(64).optional(),
    q: shortText(200).optional(),
    results: z.number().int().min(0).max(10000).optional(),
    items: z.array(cartLine).max(100).optional(),
}).passthrough();
