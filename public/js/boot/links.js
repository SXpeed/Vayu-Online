/**
 * Vayu — "is this click going to load another page of ours?"
 *
 * Both the prefetch warmer and the soft page switch need the same answer,
 * and they used to ask it with two copies of the same ladder of checks.
 */

const IGNORED_SCHEMES = ['#', 'javascript', 'tel', 'mailto'];

/**
 * The URL a link would navigate to, or null when the browser should be
 * left to handle it: new tabs, downloads, in-page anchors, tel:/mailto:
 * and anything off-origin.
 */
export function documentLinkFrom(target) {
    const link = target?.closest?.('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return null;

    const href = link.getAttribute('href');
    if (!href || IGNORED_SCHEMES.some(scheme => href.startsWith(scheme))) return null;

    const url = new URL(href, location.href);
    return url.origin === location.origin ? url : null;
}
