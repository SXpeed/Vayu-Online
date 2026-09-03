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
    // "Price on request". `price` stays required beside it — the shop keeps
    // a guide figure on the row whether or not the storefront shows one.
    inquiryOnly: z.boolean().optional(),
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
    // SEO. The lengths are the limits Google actually renders — a longer
    // title or description is not rejected upstream, it is simply truncated
    // in the result, so clamping here keeps the panel honest about it.
    slug: text(80).optional(),
    metaTitle: text(70).optional(),
    metaDescription: text(160).optional(),
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

/**
 * A press entry, as the Press editor posts it.
 *
 * Only the publication and the link are required: an entry that has not been
 * read at source is listed deliberately bare, with Vayu's own one-line
 * `snippet` and nothing the article itself is supposed to have said. The
 * handler enforces the other half of that rule — it drops the quote, byline
 * and date unless `verified` is set and a headline was actually given.
 */
/**
 * A show at one of the two houses, as the Events editor posts it.
 *
 * `images` are the plates in the order they hang; `curated` names products
 * rather than indexing them, because [cat, idx] points at a different piece
 * the moment a category is reordered.
 */
/**
 * An artist, as the Artists editor posts it.
 *
 * `story` is one block of text — paragraphs are blank lines in it, split
 * when the page reads it — and `curated` names the pieces of their capsule
 * rather than indexing them, for the reason written into the migration.
 */
export const artistProfile = z.object({
    id: text(120).optional(),
    name: text(120).min(1, 'An artist needs a name.'),
    tag: text(80).optional(),
    place: text(120).optional(),
    bio: text(600).optional(),
    portrait: text(400).optional(),
    hero: text(400).optional(),
    heroAlt: text(300).optional(),
    story: text(8000).optional(),
    curated: z.array(z.object({
        cat: text(40),
        name: text(200),
    })).max(24).optional(),
    listed: z.boolean().optional(),
    order: z.number().int().optional(),
}).passthrough();

export const showEvent = z.object({
    id: text(120).optional(),
    venue: text(40).optional(),
    title: text(200).min(1, 'A show needs a title.'),
    dates: text(120).optional(),
    note: text(400).optional(),
    statement: text(2000).optional(),
    image: text(400).optional(),
    imageMobile: text(400).optional(),
    alt: text(300).optional(),
    cta: text(80).optional(),
    secNote: text(80).optional(),
    closing: text(400).optional(),
    images: z.array(z.object({
        img: text(400),
        alt: text(300).optional(),
        name: text(120).optional(),
        tag: text(60).optional(),
    })).max(40).optional(),
    curated: z.array(z.object({
        cat: text(40),
        name: text(200),
    })).max(24).optional(),
    current: z.boolean().optional(),
}).passthrough();

export const pressEntry = z.object({
    id: text(120).optional(),
    source: text(120).min(1, 'A publication is required.'),
    url: text(600).min(1, 'A link to the article is required.'),
    headline: text(300).optional(),
    byline: text(160).optional(),
    date: text(40).optional(),
    quote: text(2000).optional(),
    quoteAttribution: text(160).optional(),
    snippet: text(2000).optional(),
    image: text(400).optional(),
    alt: text(300).optional(),
    featured: z.boolean().optional(),
    verified: z.boolean().optional(),
}).passthrough();

/**
 * A coupon, as the coupon editor posts it.
 *
 * The field names here are the panel's and the handler's — `type`, not
 * `kind`; `minOrder`, not `minSpend`; `usageLimit`, not `maxUses`. The
 * previous three names appear nowhere else in the codebase, so with
 * .passthrough() on the object every real field went through unchecked
 * while this looked like it was checking them, and `expiresAt: null` —
 * which is what an empty date field posts — was rejected outright.
 */
export const coupon = z.object({
    code: text(40).min(1, 'A coupon needs a code.'),
    type: z.enum(['percent', 'flat']).optional(),
    value: z.number().min(0).max(1_000_000).optional(),
    minOrder: z.number().min(0).max(10_000_000).optional(),
    usageLimit: z.number().int().min(0).max(1_000_000).optional(),
    perCustomerLimit: z.number().int().min(0).max(1_000_000).optional(),
    expiresAt: text(40).nullable().optional(),
    active: z.boolean().optional(),
    restrictTo: z.object({
        emails: z.array(text(254)).max(500).optional(),
        phones: z.array(text(20)).max(500).optional(),
    }).partial().optional(),
}).passthrough();

/** One label/value row in a product detail section. */
const specRow = z.object({
    label: text(60),
    value: text(200).optional(),
});

/** Announcement bar, the home hero carousel, and product-page fallbacks. */
export const siteContent = z.object({
    announcement: text(300).optional(),
    // Shown on any product that has not been given its own copy, so a page
    // is never bare while the catalogue is still being written up.
    productDefaults: z.object({
        description: text(2000).optional(),
        care: text(2000).optional(),
        dimensions: z.array(specRow).max(20).optional(),
        materials: z.array(specRow).max(20).optional(),
    }).partial().optional(),
    heroSlides: z.array(z.object({
        img: text(400),
        // The phone crop, optional. A landscape campaign shot cropped to a
        // portrait screen loses its subject; this lets the shop upload a
        // picture framed for the phone instead. Empty = use `img` everywhere.
        imgMobile: text(400).optional(),
        alt: text(300).optional(),
        title: text(200).optional(),
        ctaText: text(80).optional(),
        ctaHref: text(400).optional(),
    })).max(20).optional(),
    // The home page's "Inside Vayu" block. Everything optional: the page
    // merges what arrives over the markup it ships with, so a save that
    // fills in only the heading leaves the pictures where they were.
    insideVayu: z.object({
        title: text(80).optional(),
        ctaText: text(60).optional(),
        ctaHref: text(400).optional(),
        heroImg: text(400).optional(),
        heroAlt: text(300).optional(),
        heroHref: text(400).optional(),
        tiles: z.array(z.object({
            img: text(400),
            alt: text(300).optional(),
            href: text(400).optional(),
        })).max(4).optional(),
    }).partial().optional(),
    // The artist index page's own copy — everything on it that is not an
    // artist. The people are rows in the artists table.
    artistPage: z.object({
        title: text(120).optional(),
        meta: text(120).optional(),
        heroImg: text(400).optional(),
        heroAlt: text(300).optional(),
        heroLabel: text(200).optional(),
        statement: text(1000).optional(),
        sectionTitle: text(120).optional(),
    }).partial().optional(),
    // How many shows each house puts in the MENU panel. 1 is the one that
    // is on now; more adds its most recent closed shows after it.
    menuShows: z.number().int().min(1).max(6).optional(),
    // The artist band under Inside Vayu — one wide picture and where it
    // goes. Optional like the block above it: what is not sent keeps what
    // the page ships with, so correcting the description does not oblige
    // the shop to re-enter the picture beside it.
    artist: z.object({
        img: text(400).optional(),
        alt: text(300).optional(),
        href: text(400).optional(),
    }).partial().optional(),
    // How to reach the shop, printed in both footers and on the press page.
    // Everything optional and everything a plain string: the phone is stored
    // as the shop writes it for people to read ("+91 8595977845") and the
    // tel: href is derived from it, so this must not be narrowed to digits.
    //
    // The social URLs are NOT validated to a pattern here. The server maps
    // anything that is not http(s) to an empty string rather than rejecting
    // the whole save (see sanitizeContact in services/users/admin.js) —
    // refusing the form because one of four optional links has a typo would
    // lose the other three edits with it.
    contact: z.object({
        phone: text(40).optional(),
        email: text(254).optional(),
        instagram: text(400).optional(),
        facebook: text(400).optional(),
        pinterest: text(400).optional(),
        youtube: text(400).optional(),
    }).partial().optional(),
    // Shop-wide look of the product tiles. false strips the white plate and
    // its hairline so the photograph sits directly on the page.
    productTileBox: z.boolean().optional(),
    // The whole Curated Spaces page. `category` is the catalogue slug the
    // room is furnished from, which is also what builds the shopping rail
    // under it — so the plates and the pieces cannot describe different
    // rooms. Anything omitted falls back to what the page ships with.
    curatedSpaces: z.object({
        title: text(120).optional(),
        meta: text(120).optional(),
        heroImg: text(400).optional(),
        heroAlt: text(300).optional(),
        statement: text(600).optional(),
        sectionTitle: text(120).optional(),
        sectionNote: text(160).optional(),
        shopTitle: text(120).optional(),
        rooms: z.array(z.object({
            img: text(400),
            alt: text(300).optional(),
            name: text(120).optional(),
            tag: text(80).optional(),
            category: text(64).optional(),
        })).max(12).optional(),
    }).partial().optional(),
}).passthrough();

/**
 * Editing an order: the status, or where the parcel is going, or both.
 *
 * Every field optional because the two edits arrive separately — correcting
 * a postcode should not oblige the panel to restate the status.
 *
 * Note what is ABSENT, and that this object does not passthrough: subtotal,
 * discount, shipping, total, coupon and the payment ids are stripped here
 * before the handler ever sees them. Those record what the customer was
 * charged and what the processor confirmed. A panel that can quietly rewrite
 * them is a panel whose figures cannot be relied on afterwards, and the
 * handler whitelists the same six fields again on the other side of this.
 */
export const orderUpdate = z.object({
    status: z.enum(['new', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
    name: text(120).optional(),
    // Not .email(): an admin fixing a bad address should not be refused by
    // the panel for the shape of what is already stored. The handler trims
    // and caps it, and nothing here is used as an identity.
    email: text(254).optional(),
    phone: text(40).optional(),
    address: text(300).optional(),
    city: text(120).optional(),
    pin: text(20).optional(),
    note: text(300).optional(),
});

/**
 * Answering an enquiry left on a price-on-request piece.
 *
 * Only the two fields the panel owns. Everything else on the row — who
 * asked, what they asked about, their email and phone, when it arrived —
 * was written by the visitor and is evidence: the panel reads it and never
 * edits it, so there is nothing here to send it back with.
 */
export const inquiryUpdate = z.object({
    status: z.enum(['new', 'contacted', 'closed']).optional(),
    notes: text(2000).optional(),
});

export const teamMember = z.object({
    email: z.string().trim().email().max(254),
    name: text(120).optional(),
    role: z.enum(['staff', 'manager', 'owner']),
    // Approving a pending Google request. Only 'active' is accepted — the
    // handler will not move anyone the other way, and offering 'pending'
    // here would suggest it could.
    status: z.literal('active').optional(),
}).passthrough();

export const settings = z.object({
    // Provider only, and no passthrough on this object: the Razorpay key
    // and secret are Workers secrets now, and a key posted here is dropped
    // before the handler sees it rather than being quietly written to D1.
    payment: z.object({
        provider: z.enum(['cod', 'razorpay']).optional(),
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
