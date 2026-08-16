/**
 * Vayu — what is on, and what each house has curated around it.
 *
 * Vayu runs two rooms at the same address: the store (Vayu — Design for
 * Living) and the gallery (Gallery Vayu). They keep separate programmes,
 * so the MENU panel shows them side by side, each with its current event
 * and the pieces gathered for it.
 *
 * This is the only place an event is written down. Adding one is an entry
 * in `events` below — the panel grows a card, no markup changes. Events
 * are listed newest first; the first one in a venue is the one that gets
 * the "Now on" mark.
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
                href: '/pages/design-for-living.html',
                cta: 'See the season',
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
                href: '/pages/gallery.html#exhibition',
                cta: 'Enter the exhibition',
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

/** A venue's events with their curated pieces already resolved. */
export const eventsOf = (venue) => (venue.events || []).map(ev => ({
    ...ev,
    curated: (ev.curated || []).map(curatedProduct).filter(Boolean)
}));
