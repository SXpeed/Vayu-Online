/**
 * Vayu — a line mark for each shop category.
 *
 * The MENU panel's category rail carries an icon per category. They are
 * stored as bare path data rather than markup so the component can render
 * them with `<path d={…}>` inside its own `<svg>`: `{@html}` would be the
 * alternative, and that is both a sanitiser question and a second way for
 * the panel's icons to differ in size and stroke from the header's.
 *
 * Every mark is drawn on the same 24x24 grid at the stroke width the nav
 * icons already use (1.5, round caps and joins), so a category added here
 * sits at the weight of the search, wishlist and cart glyphs beside it.
 *
 * Keyed by category slug — the same key /api/nav returns and taxonomy.js
 * addresses a category by. A slug with no entry here falls back to
 * FALLBACK_ICON, so an admin adding a category never renders a blank row.
 */

/** Small circle-and-line mark, used when a category has no icon of its own. */
export const FALLBACK_ICON = ['M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z'];

export const CATEGORY_ICONS = {
    // a jacket, shoulders and lapel
    fashion: ['M9 3.2 12 5.4 15 3.2l4 2.4V10h-3v10.8H8V10H5V5.6l4-2.4Z'],

    // an armchair, seen head on
    furniture: [
        'M6.2 11V7.4a2.2 2.2 0 0 1 2.2-2.2h7.2a2.2 2.2 0 0 1 2.2 2.2V11',
        'M4.8 11.4h14.4v5.2H4.8z',
        'M7 16.6v3.6',
        'M17 16.6v3.6',
    ],

    // a roof over a room
    home: ['M3.8 11.2 12 4.2l8.2 7', 'M6.2 10.2v10h11.6v-10'],

    // a narrow-necked vessel
    decor: ['M9 3.4h6', 'M10 3.4c0 3.1-4 4-4 9.1a6 6 0 0 0 12 0c0-5.1-4-6-4-9.1'],

    // folded cloth, stacked
    materials: ['M12 3.8 3.4 8 12 12.2 20.6 8 12 3.8Z', 'M3.4 13.2 12 17.4l8.6-4.2'],

    // a shallow bowl
    accents: ['M3.2 11.6h17.6', 'M4.6 11.6a7.4 7.4 0 0 0 14.8 0'],

    // a wrapped box with a ribbon
    souvenir: [
        'M3.4 8.8h17.2v3.4H3.4z',
        'M5.2 12.2v8.4h13.6v-8.4',
        'M12 8.8v11.8',
        'M12 8.8C10 8.8 7.2 8.3 7.2 6.4A2.4 2.4 0 0 1 12 5.9a2.4 2.4 0 0 1 4.8.5c0 1.9-2.8 2.4-4.8 2.4Z',
    ],
};

/** Path data for a category slug; never empty. */
export const iconFor = (slug) => CATEGORY_ICONS[slug] || FALLBACK_ICON;
