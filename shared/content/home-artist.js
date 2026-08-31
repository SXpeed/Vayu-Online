/**
 * Vayu — the artist band on the home page, the wide picture under Inside
 * Vayu that opens the artist's own page.
 *
 * It shipped as one hardcoded <img> of Jenjum Gadi, so the shop could not
 * put a different artist there — or even correct the description of that
 * one — without a deploy. The picture is a poster with the artist's name
 * printed into it, which is exactly the kind of thing that changes with a
 * season and cannot wait for a release.
 *
 * Written down once, here, for the same reason the Inside Vayu block is:
 * the page paints this markup, the storefront repaints it once the panel's
 * copy arrives, and the panel shows the shop what is on the page. Three
 * copies of one image path is three chances for the panel to describe a
 * band the page no longer has.
 *
 * The class is still `.jenjum-section` — it is the CSS hook the home page
 * has always used, and renaming it would touch the stylesheet for nothing.
 * The band itself is no longer about one artist.
 */

/** The band exactly as app/routes/+page.svelte paints it before any fetch. */
export const ARTIST_BAND_SHIPPED = {
    img: '/assets/images/jenjum_gadi.png',
    alt: 'Jenjum Gadi Artist',
    href: '/pages/artist-profile.html?id=jenjum-gadi',
};

/**
 * The band as the home page will show it: what the shop saved, then what
 * the page ships with, field by field.
 *
 * Field by field rather than whole, so correcting the description does not
 * oblige the shop to re-enter the picture and the link beside it. Empty is
 * how "leave this one alone" is spelled.
 */
export function artistBandEffective(saved) {
    const s = saved || {};
    return {
        img: s.img || ARTIST_BAND_SHIPPED.img,
        alt: s.alt || ARTIST_BAND_SHIPPED.alt,
        href: s.href || ARTIST_BAND_SHIPPED.href,
    };
}
