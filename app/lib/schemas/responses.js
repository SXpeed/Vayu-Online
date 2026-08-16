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
}).nullish();

const story = z.looseObject({
    id: z.string(),
    title: z.string(),
    body: z.array(z.string()).nullish(),
});

export const navResponse = z.looseObject({
    categories: z.record(z.string(), category),
    content: content.nullish(),
});

export const catalogueResponse = z.looseObject({
    products: z.record(z.string(), z.array(product)),
    categories: z.record(z.string(), category),
    journal: z.array(story).nullish(),
    content: content.nullish(),
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
