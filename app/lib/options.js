/**
 * Vayu — product options, the one definition of the rules.
 *
 * Three places need to agree about what a selection means: the admin panel
 * that generates the combination grid, the server that writes the variant
 * rows, and the product page that resolves a shopper's picks back to one of
 * them. When that agreement lived in three copies it drifted — a variant
 * written as "Colour=Dusty pink|Size=L" could not be found by a page that
 * looked for "colour=dusty pink|size=l".
 *
 * So the key format, the display label and the cartesian expansion all live
 * here, imported by all three. This module is plain data in, plain data out:
 * no DOM, no database, nothing to stop the server importing it.
 */

/** A product carries options only if the panel gave it values to choose from. */
export const hasOptions = (product) =>
    Array.isArray(product?.options) && product.options.some(o => o.values?.length);

/**
 * The canonical key for one selection: "Colour=Dusty pink|Size=L".
 *
 * Option order is taken from the product, not from the caller's object, so
 * the same picks always produce the same string. Values are used verbatim —
 * lower-casing them here would make "XL" and "xl" collide, and the panel
 * already forbids two values with the same label inside one option.
 */
export function comboKey(options, chosen) {
    return options
        .map(o => `${o.name}=${chosen?.[o.name] ?? ''}`)
        .join('|');
}

/** What the shopper reads on the cart line: "Dusty pink / L". */
export function comboLabel(options, chosen) {
    return options
        .map(o => chosen?.[o.name])
        .filter(Boolean)
        .join(' / ');
}

/** Parse a stored key back into { Colour: 'Dusty pink', Size: 'L' }. */
export function parseCombo(key) {
    const out = {};
    for (const part of String(key || '').split('|')) {
        if (!part) continue;
        const eq = part.indexOf('=');
        if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
    }
    return out;
}

/**
 * Every combination of every option, in display order — the grid the panel
 * asks the shopkeeper to price and stock.
 *
 * Options with no values are skipped rather than collapsing the product to
 * zero combinations, which is what a plain cartesian product would do the
 * moment someone added an empty "Size" row.
 */
export function expandCombos(options) {
    const live = options.filter(o => o.values?.length);
    return live.reduce(
        (rows, o) => rows.flatMap(row => o.values.map(v => ({ ...row, [o.name]: v.label }))),
        [{}],
    );
}

/**
 * Resolve a shopper's picks to one variant row.
 *
 * Falls back to matching on the composed label, so a product whose options
 * were added after its variants (the flat "Small / Medium / Large" list this
 * model replaced) still resolves instead of silently going out of stock.
 */
export function findVariant(product, chosen) {
    const variants = product?.variants || [];
    const options = product?.options || [];
    if (!variants.length) return null;

    const key = comboKey(options, chosen);
    return variants.find(v => v.combo && v.combo === key)
        || variants.find(v => v.label === comboLabel(options, chosen))
        || null;
}

/**
 * Which values of `option` can still be reached, given the other picks.
 *
 * A pattern that exists in no in-stock size should look unavailable on the
 * rail rather than only failing once it is clicked. Options are treated
 * independently: for each candidate value we ask whether *any* variant
 * matching the other current picks has stock.
 */
export function availableValues(product, option, chosen) {
    const options = product?.options || [];
    const others = options.filter(o => o.name !== option.name);
    const out = new Set();

    for (const v of product?.variants || []) {
        if ((v.stock ?? 0) <= 0) continue;
        const combo = v.combo ? parseCombo(v.combo) : null;
        if (!combo) continue;
        // Only the other axes have to agree; this one is what we are testing.
        if (others.every(o => !chosen?.[o.name] || combo[o.name] === chosen[o.name])) {
            if (combo[option.name]) out.add(combo[option.name]);
        }
    }
    return out;
}

/**
 * The price and stock a product shows before anything is chosen.
 * With options, that is the cheapest combination that can actually be
 * bought — quoting a sold-out variant's price is how a listing ends up
 * advertising a number no one can pay.
 */
export function openingVariant(product) {
    const variants = product?.variants || [];
    if (!variants.length) return null;

    const sellable = variants.filter(v => (v.stock ?? 0) > 0);
    const pool = sellable.length ? sellable : variants;

    /**
     * A null price means "inherits the product's", not "unknown" — reading
     * it as unknown sorted every un-overridden variant behind every
     * overridden one, so a product whose only priced variant was its
     * dearest opened on the dearest.
     *
     * The two shapes differ: the storefront projection carries a numeric
     * `priceValue` beside the formatted string, while a product loaded
     * straight from the database has a plain number in `price`. Anything
     * still not a number after that falls back rather than poisoning the
     * comparison with NaN.
     */
    const numeric = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
    const base = numeric(product.priceValue) ?? numeric(product.price) ?? 0;
    const priceOf = (v) => numeric(v.priceValue) ?? numeric(v.price) ?? base;

    // Ties keep the earlier variant, so display order decides when prices
    // are equal — which for a garment sized S–XXL is every time.
    return pool.reduce((best, v) => (priceOf(v) < priceOf(best) ? v : best), pool[0]);
}
