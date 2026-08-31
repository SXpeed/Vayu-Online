/**
 * Vayu — what is on, and what each house has curated around it.
 *
 * Vayu runs two rooms at the same address: the store (Vayu — Design for
 * Living) and the gallery (Gallery Vayu). They keep separate programmes,
 * so the MENU panel shows them side by side, each with its current event
 * and the pieces gathered for it.
 *
 * This is no longer where an event is written down — the programme lives in
 * the database and is edited under What's On in the admin panel. What is
 * left here is the fallback the site paints with before /api/events answers,
 * and if it never does. The two shows below are the two the site shipped
 * with; their ids match the rows migration 0016 seeded, so the hrefs point
 * at the same pages either way. Events are listed newest first; the first
 * one in a venue is the one that gets the "Now on" mark.
 *
 * `current` is written on each of them rather than inferred from that
 * position, because the header now labels a show from the flag: the rows
 * migration 0016 seeded carry it, and a fallback that left it off would
 * have the prerendered menu calling its own current show a past one.
 *
 * `curated` is a list of real products, named rather than indexed. The
 * catalogue addresses a product as [cat, idx] — its position in a category
 * array — and an index written down here would silently point at a
 * different piece the first time that array is reordered or the admin
 * catalogue loads in a different order. Naming the product means the
 * lookup either finds it or drops it; it never quietly shows the wrong
 * thing. Names must match js/catalogue.js exactly.
 *
 * The dates and venues here must match what the posters actually say —
 * assets/images/summer_cut.png and personal_heirlooms.jpg carry their own
 * printed dates, and gallery.html and design-for-living.html each print
 * their own date a second time.
 *
 * `image` is the event's main plate and is cropped to 16:9, so give it a
 * 16:9 source. Both of the ones below already are (summer_cut.png is
 * 1672x941, gallery_hero.jpg is 1024x576) and so lose nothing to the crop.
 * personal_heirlooms.jpg is deliberately not used here: it is a square
 * poster with its own printed type, and a 16:9 crop cuts the dates off.
 */

import { site } from '#lib/stores/site.svelte.js';

export const venues = [
    {
        id: 'design-for-living',
        name: 'Vayu — Design for Living',
        kind: 'The store',
        href: '/pages/design-for-living.html',
        events: [
            {
                title: 'Summer Cut',
                dates: 'From 21 May 2026',
                note: 'A season of lighter cloth — linen, cotton and khadi, cut for the heat.',
                image: '/assets/images/summer_cut.png',
                href: '/pages/event.html?id=summer-cut',
                cta: 'See the season',
                current: true,
                curated: [
                    { cat: 'fashion', name: 'Sanganer Silk Stole' },
                    { cat: 'fashion', name: 'Grey Patterned Linen Shirt' },
                    { cat: 'fashion', name: 'Heritage Linen Kurta' }
                ]
            }
        ]
    },
    {
        id: 'gallery-vayu',
        name: 'Gallery Vayu',
        kind: 'The gallery',
        href: '/pages/gallery.html',
        events: [
            {
                title: 'Personal Heirlooms',
                dates: 'On view till 23 August 2026',
                note: 'Sarees from the collection of Malvika Singh, shown across three rooms.',
                image: '/assets/images/gallery_hero.jpg',
                href: '/pages/event.html?id=personal-heirlooms',
                cta: 'Enter the exhibition',
                current: true,
                curated: [
                    { cat: 'materials', name: 'Block-Print Textile Panel' },
                    { cat: 'fashion', name: 'Handwoven Wool Shawl' },
                    { cat: 'decor', name: 'Framed Miniature Art' }
                ]
            }
        ]
    }
];

/**
 * Resolve one curated entry to a product, or null if the catalogue no
 * longer carries a piece by that name. The [cat, idx] pair comes back with
 * it so callers can hand it straight to product-card.js, which is what
 * builds the real tile on the venue pages.
 */
export function curatedProduct({ cat, name }) {
    const list = site.products[cat];
    if (!list) return null;
    const idx = list.findIndex(p => p.name === name);
    if (idx < 0) return null;
    const p = list[idx];
    return {
        cat,
        idx,
        name: p.name,
        price: p.price,
        img: p.img,
        href: p.id
            ? `/pages/product.html?id=${p.id}&cat=${cat}&idx=${idx}`
            : `/pages/product.html?cat=${cat}&idx=${idx}`
    };
}

/**
 * The programme to render: the admin panel's, once it has arrived, and the
 * two shows written below until then.
 *
 * Callers must read this rather than importing `venues` directly — the
 * static array is the fallback, not the source. It stays in the bundle
 * because a prerendered page paints before any fetch resolves, and a venue
 * page with no show on it is worse than one showing last week's.
 */
export const allVenues = () => site.venues ?? venues;

/** One venue by id, from whichever list is live. */
export const venueById = (id) => allVenues().find(v => v.id === id) || null;

/** Every show at every house, newest first within each. */
export const allEvents = () => allVenues().flatMap(v =>
    eventsOf(v).map(ev => ({ ...ev, venueId: v.id, venueName: v.name, venueHref: v.href })));

/** One show by its slug, wherever it is on the programme. */
export const eventById = (id) => allEvents().find(ev => ev.id === id) || null;

/** A venue's events with their curated pieces already resolved. */
export const eventsOf = (venue) => (venue.events || []).map(ev => ({
    ...ev,
    curated: (ev.curated || []).map(curatedProduct).filter(Boolean)
}));
