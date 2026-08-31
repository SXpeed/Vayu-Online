/**
 * Vayu — the "Inside Vayu" block on the home page, and how it is filled.
 *
 * Three places have to agree about this block: the home page renders it, the
 * storefront repaints it once the programme and any saved overrides arrive,
 * and the admin panel shows the shop what is on the page right now. Written
 * down three times, the first edit to any one of them makes the other two
 * describe a page that no longer exists — and the panel lying about what is
 * live is worse than the panel being empty.
 *
 * So the block as it ships is written once, here, and the precedence is a
 * function rather than a rule repeated on each side: what the shop saved,
 * then the gallery's current show, then these.
 *
 * The shipped values are the last resort — they only reach the page at a
 * shop with no exhibition on the programme at all. In the ordinary case the
 * wide photograph is the current show's hero and the thumbnails are its own
 * first plates, so the home page follows the programme without anyone
 * entering it twice.
 */

/** The block exactly as app/routes/+page.svelte paints it before any fetch. */
export const INSIDE_VAYU_SHIPPED = {
    title: 'INSIDE VAYU',
    ctaText: 'VISIT THE GALLERY',
    ctaHref: '/pages/gallery.html',
    heroImg: '/assets/images/gallery_hero.jpg',
    heroAlt: 'Inside Vayu — New Delhi Atelier',
    heroHref: '/pages/gallery.html',
    tiles: [
        {
            img: '/assets/images/gallery_tile1.jpg',
            alt: 'Summer Ceramics Poster',
            href: '/pages/gallery.html',
        },
        {
            img: '/assets/images/summer_cut.png',
            alt: 'Summer Cut — 21 May 2026, Vayu Design for Living, 14 Main Market',
            href: '/pages/gallery.html',
        },
    ],
};

/**
 * The show a house is currently showing.
 *
 * Falls back to the newest rather than nothing: a house between exhibitions
 * still has a room worth showing on the home page, and an empty block there
 * reads as a broken page rather than as a gap in the programme.
 */
export const currentShow = (shows = []) => shows.find(e => e.current) || shows[0] || null;

/**
 * The block as the home page will show it: saved over show over shipped,
 * field by field.
 *
 * Field by field, not whole, because the two halves are wanted separately —
 * a shop that renames the heading has not asked for the photographs to stop
 * following the exhibition. Empty is how "keep following" is spelled, which
 * is why every fallback here tests falsiness rather than presence.
 */
export function insideVayuEffective(saved, show) {
    const s = saved || {};
    const d = INSIDE_VAYU_SHIPPED;

    // Capped at two: the row is designed for two, and a show hanging thirty
    // plates would otherwise put all thirty on the home page.
    const showTiles = (show?.images || []).slice(0, 2)
        .map(im => ({ img: im.img, alt: im.alt || im.name || '', href: show.href || '' }))
        .filter(t => t.img);

    return {
        title: s.title || d.title,
        ctaText: s.ctaText || d.ctaText,
        ctaHref: s.ctaHref || d.ctaHref,
        heroImg: s.heroImg || show?.image || d.heroImg,
        heroAlt: s.heroAlt || show?.alt || show?.title || d.heroAlt,
        heroHref: s.heroHref || show?.href || d.heroHref,
        tiles: s.tiles?.length ? s.tiles : (showTiles.length ? showTiles : d.tiles),
    };
}

/** Whether two thumbnail rows say the same thing, in the same order. */
export const sameTiles = (a = [], b = []) => a.length === b.length
    && a.every((t, i) => t.img === b[i].img
        && (t.href || '') === (b[i].href || '')
        && (t.alt || '') === (b[i].alt || ''));
