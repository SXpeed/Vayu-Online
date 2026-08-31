/**
 * Vayu — updating the head on the page whose subject is a query string.
 *
 * /pages/collection-detail.html?cat=furniture is a prerendered document: one
 * file serves every category. It cannot carry a title, a description or a
 * canonical of its own at build time, because at build time there is no
 * ?cat=. (The journal post page was the other one; it is gone with the
 * journal.)
 *
 * It already sets document.title once it knows its subject. These do the
 * other two tags the same way, so a category page stops sharing one
 * description with every other category and stops competing with them for a
 * canonical it never declared.
 *
 * The honest limit: this is client-side. Google renders JavaScript and will
 * see it; a crawler that does not will still read the generic tags in the
 * served HTML. Making these server-rendered means a real route
 * (/collections/<slug>) rather than a query string — worth doing, and a
 * larger change than this.
 */

/** Replace (or create) the meta description. */
export function setDescription(text) {
    if (!text) return;
    let el = document.querySelector('meta[name="description"]');
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', 'description');
        document.head.appendChild(el);
    }
    el.setAttribute('content', String(text).replace(/\s+/g, ' ').trim().slice(0, 160));
}

/**
 * Point the canonical at this exact URL, query string included.
 *
 * The origin is taken from the document rather than from a constant, so a
 * preview deployment declares itself rather than claiming to be production.
 */
export function setCanonical(path) {
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
    }
    el.setAttribute('href', new URL(path, location.origin).href);
}

/** Keep the Open Graph title/description in step with the page's own. */
export function setOpenGraph({ title, description }) {
    const set = (prop, value) => {
        if (!value) return;
        let el = document.querySelector(`meta[property="${prop}"]`);
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('property', prop);
            document.head.appendChild(el);
        }
        el.setAttribute('content', value);
    };
    set('og:title', title);
    set('og:description', description);
    set('og:url', location.href);
}
