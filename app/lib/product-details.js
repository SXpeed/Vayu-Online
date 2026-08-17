/**
 * Vayu — which sections the product page's detail accordion shows.
 *
 * Pulled out of lib/pages/product.js so the rule can be exercised on its
 * own: that file opens with a top-level `await hydrateCatalogue()` and
 * reaches for the DOM as it loads, so nothing inside it can be called
 * without a browser and a live API behind it. The decision about what a
 * shopper reads deserves better than that.
 *
 * The rule, per section rather than all-or-nothing: this product's own copy
 * if it has any, otherwise the shop-wide default set under Content in the
 * admin panel, otherwise the section is dropped. Per section, because a
 * piece that has been measured but not yet described should show its real
 * dimensions beside the general blurb rather than lose one to have the
 * other.
 *
 * Shipping & Returns is the exception: it is never per-product prose, only
 * a pointer at a saved profile, defaulting to the first one the shop has.
 */

/** Rows worth rendering — a label with no value is an empty column. */
const usableRows = (rows) => (Array.isArray(rows) ? rows : [])
    .filter(r => r && String(r.label || '').trim() && String(r.value || '').trim());

/** Free text split on blank lines, so a multi-paragraph note stays one. */
export const splitParagraphs = (text) => String(text ?? '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

/**
 * The Shipping & Returns copy a product shows: the profile it was given, or
 * the shop's default when it has none — which is every product that predates
 * the feature. Mirrors shippingTextFor() on the server.
 */
export function shippingText(product, presets) {
    const list = Array.isArray(presets) ? presets : [];
    if (!list.length) return '';
    const chosen = product.shippingPreset && list.find(x => x.id === product.shippingPreset);
    return (chosen || list[0]).body || '';
}

/**
 * The sections to render, in order, already resolved against the defaults.
 *
 * @param product   the product, as /api/catalogue projects it
 * @param defaults  content.productDefaults, or {} when none is set
 * @param presets   the shop's shipping profiles
 * @returns {Array<{id, title, kind: 'text'|'rows', text?, rows?}>}
 */
export function detailSections(product = {}, defaults = {}, presets = []) {
    const text = (own, shared) => splitParagraphs(own || shared || '');
    const rows = (own, shared) => {
        const mine = usableRows(own);
        return mine.length ? mine : usableRows(shared);
    };

    return [
        { id: 'acc-desc', title: 'Description', kind: 'text', text: text(product.description, defaults.description) },
        { id: 'acc-dimensions', title: 'Dimensions', kind: 'rows', rows: rows(product.dimensions, defaults.dimensions) },
        { id: 'acc-materials', title: 'Materials & Origin', kind: 'rows', rows: rows(product.materials, defaults.materials) },
        { id: 'acc-care', title: 'Care Instructions', kind: 'text', text: text(product.care, defaults.care) },
        { id: 'acc-shipping', title: 'Shipping & Returns', kind: 'text', text: splitParagraphs(shippingText(product, presets)) },
    ].filter(s => (s.kind === 'rows' ? s.rows.length : s.text.length));
}
