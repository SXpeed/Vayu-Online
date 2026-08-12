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

// The featured story is just a story flagged `featured: true`.
// Exactly one should carry the flag; the listing shows the first it finds.
export const STORIES = [
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

export const PRESS = [
  {
    source: 'New York Times',
    snippet: 'A concept store in New Delhi that bridges Indian craft traditions with contemporary living — "a space where heritage and modernity meet with ease."',
    image: '/assets/images/journal_nyt_press.png',
    alt: 'New York Times coverage of Vayu',
    url: 'https://www.nytimes.com/2016/10/30/fashion/mens-style/vayu-new-delhi-retail-vivek-sahni-dave-chang.html'
  },
  {
    source: 'Khaleej Times',
    snippet: "Back to the Future — exploring how Vayu's curation philosophy brings centuries-old Indian craftsmanship into contemporary design conversations.",
    image: '/assets/images/gallery_hero.png',
    alt: 'Khaleej Times coverage of Vayu',
    url: 'https://www.khaleejtimes.com/back-to-the-future'
  },
  {
    source: 'Livemint',
    snippet: 'Vayu showcases the best of Indian crafts — sourced from the ateliers of skilled craftsmen and finished by contemporary designers.',
    image: '/assets/images/gallery_tile1.png',
    alt: 'Livemint coverage of Vayu',
    url: 'https://www.livemint.com/Industry/JsmNeMceh1HiUxmxJuqhhJ/Cloud-storeage.html'
  }
];

export const getStory = (id) => STORIES.find(s => s.id === id);
export const getFeatured = () => STORIES.find(s => s.featured);
export const postUrl = (story) => `/pages/journal-post.html?id=${story.id}`;
