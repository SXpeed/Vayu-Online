/**
 * Vayu — schemas for the admin panel's writes.
 *
 * Everything here is behind a session and a role rank, so this is not about
 * hostile input so much as about the panel and the database agreeing on
 * shape. The catalogue in particular is deeply nested — a product carries
 * categories, a gallery, variants and tags — and a typo in the panel used to
 * surface as a broken storefront rather than a rejected save.
 */

import { z } from 'zod';

const text = (max) => z.string().trim().max(max);
const slug = z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and hyphens only.');

/**
 * Money, as the panel sends it: a number from a `type="number"` input, and
 * '' from an empty optional one.
 *
 * This used to be declared as a display string ("₹ 3,200"), which is how the
 * *storefront* carries a price — but nothing ever posted one of those here.
 * The panel has always sent numbers, so the gate rejected every single
 * product save with "expected string, received number" before the handler
 * ran. Four more fields had drifted the same way (`status` listed a set of
 * words the server does not use, `categories` was declared as bare slugs
 * where the panel sends {cat, sub} pairs, and neither `publishAt` nor a
 * variant's `price` admitted the null they are cleared with). The rule the
 * whole file now follows: this describes what the panel sends and what
 * sanitizeProduct accepts — nothing aspirational.
 */
const money = z.number().min(0).max(10_000_000);
const optionalMoney = money.nullable().optional().or(z.literal(''));

export const product = z.object({
    id: text(64).optional(),
    name: text(200).min(1, 'A product needs a name.'),
    price: money,
    compareAt: optionalMoney,
    description: text(4000).optional(),
    img: text(400).optional(),
    sub: text(64).optional(),
    isNew: z.boolean().optional(),
    status: z.enum(['active', 'draft', 'archived']).optional(),
    stock: z.number().int().min(0).max(1_000_000).optional(),
    publishAt: text(40).nullable().optional(),
    categories: z.array(z.object({
        cat: slug,
        sub: text(64).optional(),
    })).max(20).optional(),
    gallery: z.array(text(400)).max(20).optional(),
    tags: z.array(text(40)).max(40).optional(),
    // The product page's detail accordion. Dimensions and Materials & Origin
    // are label/value rows; care is free text; shipping points at a saved
    // profile ('' meaning the shop default).
    care: text(2000).optional(),
    shippingPreset: text(64).optional(),
    dimensions: z.array(z.object({
        label: text(60),
        value: text(200).optional(),
    })).max(20).optional(),
    materials: z.array(z.object({
        label: text(60),
        value: text(200).optional(),
    })).max(20).optional(),
    // The pickers a shopper sees: "Colour" as a rail of swatches, "Size" as
    // a rail of labels. A product with none of these shows no pickers at all.
    options: z.array(z.object({
        name: text(40).min(1, 'An option needs a name.'),
        kind: z.enum(['swatch', 'text']).optional(),
        values: z.array(z.object({
            label: text(60).min(1, 'An option value needs a label.'),
            swatch: text(400).optional(),   // CSS colour or image URL
            heading: text(40).optional(),   // groups a rail into bands
        })).min(1).max(60),
    })).max(4).optional(),
    // One row per combination of those options — this is what carries price
    // and stock, and what a cart line ends up pointing at.
    variants: z.array(z.object({
        label: text(120),
        // null is how the editor says "use the base price".
        price: optionalMoney,
        stock: z.number().int().min(0).max(1_000_000).optional(),
        combo: text(400).optional(),
        image: text(400).optional(),
    })).max(400).optional(),
}).passthrough();

/** One saved Shipping & Returns profile. */
export const shippingPreset = z.object({
    name: text(60).min(1, 'A profile needs a name.'),
    body: text(2000).min(1, 'A profile needs some text.'),
}).passthrough();

export const category = z.object({
    slug: slug.optional(),
    title: text(80).min(1, 'A category needs a title.'),
    curated: text(400).optional(),
    banner: text(400).optional(),
    subs: z.array(z.object({
        label: text(80).min(1),
        thumb: text(400).optional(),
    })).max(40).optional(),
}).passthrough();

export const journalStory = z.object({
    id: text(120).optional(),
    title: text(300).min(1, 'A story needs a title.'),
    category: text(40).optional(),
    categoryLabel: text(80).optional(),
    excerpt: text(2000).optional(),
    date: text(40).optional(),
    image: text(400).optional(),
    alt: text(300).optional(),
    readingTime: text(40).optional(),
    featured: z.boolean().optional(),
    body: z.array(text(8000)).max(200).optional(),
}).passthrough();

export const coupon = z.object({
    code: text(40).min(1, 'A coupon needs a code.'),
    kind: z.enum(['percent', 'flat']).optional(),
    value: z.number().min(0).max(1_000_000).optional(),
    minSpend: z.number().min(0).max(10_000_000).optional(),
    maxUses: z.number().int().min(0).max(1_000_000).optional(),
    expiresAt: text(40).optional(),
    active: z.boolean().optional(),
}).passthrough();

/** Announcement bar and the home hero carousel. */
export const siteContent = z.object({
    announcement: text(300).optional(),
    heroSlides: z.array(z.object({
        img: text(400),
        alt: text(300).optional(),
        title: text(200).optional(),
        ctaText: text(80).optional(),
        ctaHref: text(400).optional(),
    })).max(20).optional(),
}).passthrough();

export const teamMember = z.object({
    email: z.string().trim().email().max(254),
    name: text(120).optional(),
    role: z.enum(['staff', 'manager', 'owner']),
}).passthrough();

export const settings = z.object({
    payment: z.object({
        provider: z.enum(['cod', 'razorpay']).optional(),
        razorpayKeyId: text(120).optional(),
        razorpayKeySecret: text(200).optional(),
    }).partial().optional(),
    shipping: z.object({
        flatRate: z.number().min(0).max(1_000_000).optional(),
        freeAbove: z.number().min(0).max(10_000_000).optional(),
    }).partial().optional(),
}).passthrough();

export const adminLogin = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(200),
});
