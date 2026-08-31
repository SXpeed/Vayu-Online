/**
 * Vayu — the artist index page's own copy, as it ships.
 *
 * The people on that page are rows in the artists table; this is everything
 * around them — the title, the wide picture at the top, the line under it
 * and the statement. Written down once, here, for the same reason the
 * Inside Vayu block is: the page paints this markup, the page module
 * repaints it once the panel's copy arrives, and the panel shows the shop
 * what is on the page. Three copies would be three chances for the panel to
 * describe a page that no longer exists.
 */

/** The page exactly as app/routes/pages/artist.html paints it. */
export const ARTIST_PAGE_SHIPPED = {
    title: 'Hands That Make',
    meta: 'One studio · New Delhi',
    heroImg: '/assets/images/journal_hero.png',
    heroAlt: 'A weaver working at a handloom',
    heroLabel: 'At the loom · Chirala, Andhra Pradesh',
    statement: 'Every object here begins with a pair of hands — from the back-strap looms of '
        + 'Nagaland to the brass foundries of Moradabad. These are not anonymous hands.',
    sectionTitle: 'Meet the Artists',
};

/**
 * The page as it will show: what the shop saved, then what it ships with,
 * field by field. Empty is how "leave this one alone" is spelled.
 *
 * `sectionNote` is the exception — it counts the artists rather than being
 * typed, so it is not in the shipped copy at all. A shop that has to
 * remember to change "One studio" to "Two studios" will not.
 */
export function artistPageEffective(saved) {
    const s = saved || {};
    const d = ARTIST_PAGE_SHIPPED;
    return {
        title: s.title || d.title,
        meta: s.meta || d.meta,
        heroImg: s.heroImg || d.heroImg,
        heroAlt: s.heroAlt || d.heroAlt,
        heroLabel: s.heroLabel || d.heroLabel,
        statement: s.statement || d.statement,
        sectionTitle: s.sectionTitle || d.sectionTitle,
    };
}
