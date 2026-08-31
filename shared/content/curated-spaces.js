/**
 * Vayu — the Curated Spaces page, as it ships.
 *
 * One document, three consumers, so the page cannot say three different
 * things depending on where you read it from:
 *
 *   the page      routes/pages/curated-spaces.html renders this at build
 *                 time, so the prerendered HTML is the default content.
 *   the panel     Site → Curated Spaces seeds its form from this until an
 *                 owner saves their own, so the editor opens showing what
 *                 is actually live rather than a set of blank fields.
 *   the runtime   lib/pages/curated-spaces.js falls back to it when the
 *                 API is down, which is the same thing the prerendered
 *                 markup already says — so an outage changes nothing.
 *
 * Before this, all of it was literal markup in the .svelte file and a
 * `const SPACES` in the page script, and the two could drift: the pictures
 * named one set of rooms and the shopping rail was built from another.
 */

/**
 * A room. `category` is the catalogue slug it is furnished from — it ties
 * the plate above to the tiles in the rail below, so a piece added to
 * Furniture in the panel turns up under The Living Room without anyone
 * remembering to add it twice.
 */
export const BLANK_ROOM = { img: '', alt: '', name: '', tag: '', category: '' };

export const CURATED_SPACES_DEFAULT = {
    title: 'Curated Spaces',
    meta: 'Three settings',
    // A photographed room, not the category banner: banner_home_21_9.png is
    // a row of cut-out objects on a pale ground, which at 16:9 reads as an
    // empty page rather than as a space.
    heroImg: '/assets/images/cat_furniture.jpg',
    heroAlt: 'A room set with cane and teak',
    statement: 'Rooms rather than shelves — each one set from a single part of the '
        + 'collection, so a piece can be seen where it is meant to live.',
    sectionTitle: 'The Spaces',
    sectionNote: 'Furniture · Home · Decor',
    shopTitle: 'Shop the Spaces',
    // Rooms, not cut-outs. The obvious picks (cat_tableware.png,
    // cat_objects.png) are catalogue shots of objects on white, and a plate
    // of one reads as a blank tile beside a photographed room.
    rooms: [
        {
            img: '/assets/images/journal_mindful_spaces.png',
            alt: 'A chair, a throw and a vase in a quiet corner',
            name: 'The Living Room',
            tag: 'Furniture',
            category: 'furniture',
        },
        {
            img: '/assets/images/journal_craft_heritage.png',
            alt: 'A brass urli set on a marble table',
            name: 'The Long Table',
            tag: 'Home',
            category: 'home',
        },
        {
            img: '/assets/images/cat_art.jpg',
            alt: 'Vessels and stone gathered on a plinth',
            name: 'The Quiet Corner',
            tag: 'Decor',
            category: 'decor',
        },
    ],
};

/**
 * The saved document merged over the shipped one, field by field.
 *
 * Shallow on purpose apart from `rooms`: a save that omits a key should
 * leave that part of the page as it shipped, but a save that supplies
 * `rooms` replaces them outright — otherwise a removed room would come
 * back from the defaults.
 */
export function withCuratedDefaults(saved) {
    if (!saved || typeof saved !== 'object') return CURATED_SPACES_DEFAULT;
    const merged = { ...CURATED_SPACES_DEFAULT };
    for (const [k, v] of Object.entries(saved)) {
        if (k === 'rooms') continue;
        if (v !== undefined && v !== null && v !== '') merged[k] = v;
    }
    merged.rooms = Array.isArray(saved.rooms) ? saved.rooms : CURATED_SPACES_DEFAULT.rooms;
    return merged;
}
