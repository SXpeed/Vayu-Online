// ============================================================
// Journal content
// ------------------------------------------------------------
// Shared by the listing (pages/journal.html) and the article
// page (pages/journal-post.html), so a story is described once
// and both stay in step.
//
// AUTHORING NOTES
//   id       url slug — appears in the address bar as
//            /pages/journal-post.html?id=<id>. Must be unique
//            and should not change once published.
//   body     array of paragraphs, rendered in order. This is
//            the only field the article page cannot fall back
//            on: where `body` is empty, the article page shows
//            the excerpt as a standing intro plus a clearly
//            marked "full story in preparation" note rather
//            than inventing copy. Fill these in to publish.
//   category must match a data-filter value on the filter
//            pills in journal.html (craft, interiors,
//            materials, press).
// ============================================================

// The live stories now come from the admin panel (/admin → Journal) via
// /api/catalogue; the list below is the offline fallback and the seed for
// the admin database on first run.
import { remote } from './store-data.js';

// The featured story is just a story flagged `featured: true`.
// Exactly one should carry the flag; the listing shows the first it finds.
const STATIC_STORIES = [
  {
    id: 'revival-of-indian-brass',
    featured: true,
    category: 'craft',
    categoryLabel: 'Craft & Heritage',
    title: 'The Revival of Indian Brass — A Living Tradition',
    excerpt: 'In the narrow lanes of Moradabad, fourth-generation artists keep alive a craft that stretches back centuries. We trace the journey of hand-beaten brass — from raw metal to objects of quiet beauty — and explore how contemporary designers are giving this ancient practice new meaning in modern homes.',
    date: 'July 28, 2026',
    image: '/assets/images/journal_craft_heritage.png',
    alt: 'The Revival of Indian Brass — A Living Tradition',
    readingTime: '6 min read',
    body: []
  },
  {
    id: 'curating-a-mindful-space',
    category: 'interiors',
    categoryLabel: 'Interiors',
    title: 'Curating a Mindful Space',
    excerpt: 'Tips on selecting pieces that carry meaning and creating harmony between contemporary design and antique objects. The wabi-sabi philosophy applied to everyday living.',
    date: 'July 14, 2026',
    image: '/assets/images/journal_mindful_spaces.png',
    alt: 'Curating a Mindful Space',
    readingTime: '4 min read',
    body: []
  },
  {
    id: 'cane-weaving-in-jaipur',
    category: 'craft',
    categoryLabel: 'Craft & Heritage',
    title: 'The Revival of Cane Weaving in Jaipur',
    excerpt: 'Discover how third-generation artists are keeping traditional weaving techniques alive while adapting their craft to modern aesthetics and contemporary furniture design.',
    date: 'June 22, 2026',
    image: '/assets/images/journal_weaving.png',
    alt: 'The Revival of Cane Weaving in Jaipur',
    readingTime: '5 min read',
    body: []
  },
  {
    id: 'art-of-indian-ceramics',
    category: 'materials',
    categoryLabel: 'Materials',
    title: 'Earth, Water, Fire — The Art of Indian Ceramics',
    excerpt: "From the potter's wheel in Khurja to the kilns of Andretta, ceramic traditions across India produce vessels of extraordinary character. An exploration of clay, glaze and the quiet patience of making.",
    date: 'June 5, 2026',
    image: '/assets/images/journal_ceramics.png',
    alt: 'Earth, Water, Fire — The Art of Indian Ceramics',
    readingTime: '7 min read',
    body: []
  },
  {
    id: 'language-of-natural-dyes',
    category: 'materials',
    categoryLabel: 'Materials',
    title: 'The Language of Natural Dyes',
    excerpt: 'Indigo, pomegranate, turmeric — the ancient palette of plant-based dyes tells a story older than civilisation. We visit the dyers of Rajasthan to witness colour being coaxed from the earth.',
    date: 'May 18, 2026',
    image: '/assets/images/cat_textiles.jpg',
    alt: 'The Language of Natural Dyes',
    readingTime: '5 min read',
    body: []
  },
  {
    id: 'designing-with-imperfection',
    category: 'interiors',
    categoryLabel: 'Interiors',
    title: 'Designing with Imperfection',
    excerpt: 'How the Japanese principle of wabi-sabi has found a home in Indian interiors — embracing asymmetry, raw texture and the beauty of objects shaped by time and use.',
    date: 'April 30, 2026',
    image: '/assets/images/gallery_tile2.png',
    alt: 'Designing with Imperfection',
    readingTime: '4 min read',
    body: []
  },
  {
    id: 'conversations-with-the-makers',
    category: 'craft',
    categoryLabel: 'Craft & Heritage',
    title: 'Conversations with the Makers',
    excerpt: 'A photographic series documenting the master artists behind the Vayu collection — their workshops, their rituals, and the quiet devotion that goes into every hand-finished object.',
    date: 'April 12, 2026',
    image: '/assets/images/makers.jpg',
    alt: 'Conversations with the Makers',
    readingTime: '3 min read',
    body: []
  }
];

/** Live stories from the admin panel, or the static fallback above. */
export const STORIES = (remote?.journal && remote.journal.length) ? remote.journal : STATIC_STORIES;

// ============================================================
// Press coverage
// ------------------------------------------------------------
// Shared by the journal listing's "In The Press" rail and the
// dedicated press page (pages/press.html).
//
// FIELD NOTES
//   source    the publication, as it should be credited.
//   headline  the article's own headline, exactly as published.
//   byline    the writer, without the "By".
//   date      as published.
//   quote     a short passage quoted verbatim from the article,
//             or a line spoken in it. Never paraphrase into this
//             field — it is presented to the reader in quotation
//             marks, so it has to be the publication's own words.
//   snippet   Vayu's own one-line description of the piece. Used
//             by the journal rail, which has room for one line.
//   featured  at most one, shown large at the top of the press
//             page. Should be the most recent.
//   verified  whether the article was read at source. An entry
//             with verified: false renders without a headline,
//             byline, date or quote — the press page shows what
//             is known and links out, rather than inventing the
//             rest. Set it to true once the piece is confirmed.
// ============================================================

export const PRESS = [
  {
    source: 'Outlook Luxe',
    headline: "Inside Vayu's New Lodhi Market Store Where India's Material Traditions Breathe In Collectables",
    byline: 'Priyamvada Rana',
    date: '19 December 2025',
    quote: 'Our chapter at Bikaner House came to a natural close with the end of the lease there. This transition allowed us to reimagine the next phase of Vayu.',
    quoteAttribution: 'Vivek Sahni',
    snippet: 'On the move to Lodhi Market — reverse glass paintings from the 1770s, Himachali shaman masks, Kashmiri papier-mâché chests, and a gallery space for exhibitions.',
    image: '/assets/images/hero.jpg',
    alt: "Outlook Luxe coverage of Vayu's Lodhi Market store",
    url: 'https://luxe.outlookindia.com/art-design/home/inside-vayus-new-lodhi-market-store-where-indias-material-traditions-breathe-in-collectables',
    featured: true,
    verified: true
  },
  {
    source: 'The New York Times',
    headline: 'A Delhi Store Fit for a Prince',
    byline: 'Guy Trebay',
    date: '30 October 2016',
    quote: "We wanted it to feel like you're entering a house — to be slightly intimate, but not so cluttered up that you can't react to the objects.",
    quoteAttribution: 'Vivek Sahni',
    snippet: 'On the whitewashed chambers of Bikaner House — brass devotional objects, tantric diagrams, amethyst bowls and refurbished midcentury furniture.',
    image: '/assets/images/journal_nyt_press.png',
    alt: 'New York Times coverage of Vayu',
    url: 'https://www.nytimes.com/2016/10/30/fashion/mens-style/vayu-new-delhi-retail-vivek-sahni-dave-chang.html',
    verified: true
  },
  {
    source: 'Khaleej Times',
    headline: 'Back to the Future',
    byline: 'Sujata Assomull',
    date: '4 August 2016',
    quote: "Vayu is our interpretation of contemporary living using India's rich cultural past. We partner with artisanal communities, designers, artists and the occasional maverick to showcase things we love.",
    quoteAttribution: 'Vivek Sahni',
    snippet: 'On opening in Lutyens’ Delhi — modern Indian aesthetics blended with traditional craftsmanship, from ikat backpacks to furniture designed in-house.',
    image: '/assets/images/gallery_hero.png',
    alt: 'Khaleej Times coverage of Vayu',
    url: 'https://www.khaleejtimes.com/back-to-the-future',
    verified: true
  },
  {
    // Left unverified on purpose: the article could not be read at source,
    // and the URL slug (Cloud-storeage.html) does not correspond to any
    // Vayu piece — it looks like the wrong link was filed. Confirm the
    // article, correct the URL, then fill in headline/byline/date/quote
    // and flip `verified` to true.
    source: 'Livemint',
    snippet: 'Vayu showcases the best of Indian crafts — sourced from the ateliers of skilled craftsmen and finished by contemporary designers.',
    image: '/assets/images/gallery_tile1.png',
    alt: 'Livemint coverage of Vayu',
    url: 'https://www.livemint.com/Industry/JsmNeMceh1HiUxmxJuqhhJ/Cloud-storeage.html',
    verified: false
  }
];

/** The press piece shown large at the top of pages/press.html. */
export const getFeaturedPress = () => PRESS.find(p => p.featured) || PRESS[0];

export const getStory = (id) => STORIES.find(s => s.id === id);
export const getFeatured = () => STORIES.find(s => s.featured);
export const postUrl = (story) => `/pages/journal-post.html?id=${story.id}`;
