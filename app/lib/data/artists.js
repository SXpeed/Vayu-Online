/**
 * Vayu — the people the shop names, and the pieces they made.
 *
 * This is no longer where an artist is written down — they live in the
 * database and are edited under Artists in the admin panel. What is left
 * here is the fallback the site paints with before /api/artists answers,
 * and if it never does: one artist, matching the row migration 0019
 * seeded, so the index card and the page link to the same place either way.
 *
 * `curated` names products rather than indexing them. The capsule on this
 * page used to be four [category, index] pairs, and an index points at
 * whatever happens to sit in that position today — reorder the catalogue
 * and an artist's own collection quietly becomes somebody else's work.
 * Names must match the catalogue exactly; a piece that cannot be found is
 * dropped rather than guessed at.
 */

import { site } from '#lib/stores/site.svelte.js';
import { curatedProduct } from '#lib/data/events.js';

export const artists = [
    {
        id: 'jenjum-gadi',
        name: 'Jenjum Gadi',
        tag: 'Artist in Residence',
        place: 'Tirbin, Arunachal Pradesh',
        bio: 'Working in brass from his New Delhi studio, Jenjum Gadi turns everyday forms into vessels for storytelling.',
        portrait: '/assets/images/jenjum_gadi.png',
        hero: '/assets/images/jenjum_gadi.png',
        heroAlt: 'Jenjum Gadi — Artist & Designer',
        story: [
            'Born in Tirbin, a remote village in Arunachal Pradesh, Jenjum Gadi is an artist whose practice is rooted in memory, craft, and materiality. Drawing from personal histories, cultural traditions, and the natural world, he transforms everyday forms into vessels for storytelling.',
            'Working primarily in brass, a material deeply embedded in India’s ritual and domestic traditions, he creates sculptural works that reflect on his memories and cultural inheritance.',
            'Following his debut at Bikaner House with his solo exhibition, Gadi’s works have also been presented at Jodhpur Art Week and Art Mumbai.',
        ],
        curated: [
            { cat: 'fashion', name: 'Sanganer Silk Stole' },
            { cat: 'fashion', name: 'Heritage Linen Kurta' },
            { cat: 'furniture', name: 'Sheesham Wood Console' },
            { cat: 'decor', name: 'Framed Miniature Art' },
        ],
        listed: true,
        href: '/pages/artist-profile.html?id=jenjum-gadi',
    },
];

/**
 * The artists to render: the panel's, once they have arrived, and the one
 * written above until then.
 *
 * Read this rather than importing `artists` directly — the static array is
 * the fallback, not the source. It stays in the bundle because a
 * prerendered page paints before any fetch resolves, and an artist page
 * with no artist on it is worse than one showing what shipped.
 */
export const allArtists = () => site.artists ?? artists;

/** One artist by slug, from whichever list is live. */
export const artistById = (id) => allArtists().find(a => a.id === id) || null;

/** An artist's capsule, with the pieces the catalogue still carries. */
export const capsuleOf = (artist) => (artist?.curated || [])
    .map(curatedProduct)
    .filter(Boolean);

/** Their story as paragraphs, however it arrived — a list, or one block. */
export const storyOf = (artist) => {
    const s = artist?.story;
    if (Array.isArray(s)) return s;
    return String(s || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
};
