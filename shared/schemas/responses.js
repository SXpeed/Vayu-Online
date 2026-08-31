/**
 * Vayu — shapes for what /api/nav and /api/catalogue hand back.
 *
 * These are parsed on the *client*, which is unusual and deliberate. The
 * storefront renders straight from this data: a category object missing its
 * `subs`, or a product missing `price`, used to surface as an empty menu
 * column or a tile with a blank price — a blank region on the page with
 * nothing in the console to explain it.
 *
 * Parsing here turns that into one clear failure at the boundary, and the
 * caller falls back to the static data the site ships with, which is the
 * behaviour the site already had when the API was unreachable.
 *
 * `catchall`/`loose` is used throughout on purpose: the admin panel adds
 * fields faster than this file will be updated, and an unknown field is not
 * a reason to throw the catalogue away.
 *
 * Every optional field is `.nullish()`, not `.optional()`. D1 returns NULL
 * for an unset column and JSON renders that as `null`, which `.optional()`
 * rejects — the first version of this file threw the entire live catalogue
 * away over a product with no compare-at price.
 */

import { z } from 'zod';

const sub = z.looseObject({
    label: z.string(),
    thumb: z.string().nullish(),
});

const category = z.looseObject({
    title: z.string(),
    curated: z.string().nullish(),
    banner: z.string().nullish(),
    subs: z.array(sub).nullish(),
});

const product = z.looseObject({
    id: z.string().nullish(),
    name: z.string(),
    price: z.string(),
    img: z.string().nullish(),
    sub: z.string().nullish(),
    isNew: z.boolean().nullish(),
    compareAt: z.string().nullish(),
    gallery: z.array(z.string()).nullish(),
    variants: z.array(z.looseObject({ label: z.string() })).nullish(),
});

const content = z.looseObject({
    announcement: z.string().nullish(),
    heroSlides: z.array(z.looseObject({ img: z.string() })).nullish(),
    // Declared loosely on purpose: the page merges whatever arrives over
    // the document it ships with, so a half-filled save still renders.
    curatedSpaces: z.looseObject({
        rooms: z.array(z.looseObject({ img: z.string() })).nullish(),
    }).nullish(),
}).nullish();

/**
 * One piece of press coverage, as /api/press returns it.
 *
 * Loose, and everything past the publication optional, because an entry the
 * article was not read at source carries almost nothing: the press page
 * renders it from `source`, `snippet` and `url` alone.
 */
const pressItem = z.looseObject({
    id: z.string(),
    source: z.string(),
    url: z.string().nullish(),
});

export const navResponse = z.looseObject({
    categories: z.record(z.string(), category),
    content: content.nullish(),
});

/** A saved Shipping & Returns profile, shared across products. */
const shippingPreset = z.looseObject({
    id: z.string(),
    name: z.string().nullish(),
    body: z.string().nullish(),
});

export const catalogueResponse = z.looseObject({
    products: z.record(z.string(), z.array(product)),
    categories: z.record(z.string(), category),
    content: content.nullish(),
    shippingPresets: z.array(shippingPreset).nullish(),
});

/**
 * One show, as /api/events returns it. Loose past the identity: a season
 * with no plates yet is still a show worth listing.
 */
const showEvent = z.looseObject({
    id: z.string(),
    title: z.string(),
    venue: z.string().nullish(),
});

/**
 * One artist, as /api/artists returns it. Loose past the identity: an
 * artist the shop has only a photograph and a line about is still worth a
 * card on the index.
 */
const artistProfile = z.looseObject({
    id: z.string(),
    name: z.string(),
    href: z.string().nullish(),
});

/** /api/artists — everyone the shop names, in index order. */
export const artistsResponse = z.looseObject({
    artists: z.array(artistProfile),
});

/** /api/events — both houses, each with its programme, current first. */
export const eventsResponse = z.looseObject({
    venues: z.array(z.looseObject({
        id: z.string(),
        name: z.string().nullish(),
        events: z.array(showEvent).nullish(),
    })).nullish(),
});

/** /api/press — the coverage the press page lists, newest first. */
export const pressResponse = z.looseObject({
    press: z.array(pressItem).nullish(),
});

/**
 * Parse, or log once and hand back null so the caller falls back to the
 * static data. Never throws into a render.
 */
export function parseOrNull(schema, data, label) {
    const result = schema.safeParse(data);
    if (result.success) return result.data;

    console.error(
        `[vayu] ${label} did not match its expected shape — falling back to the ` +
        'catalogue this build shipped with.',
        result.error.issues.slice(0, 5),
    );
    return null;
}
