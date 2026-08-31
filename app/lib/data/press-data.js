/**
 * Vayu — press coverage.
 *
 * The static list the press page paints with until /api/press answers, and
 * what it keeps if the answer never comes. Live entries are edited under
 * Press in the admin panel.
 *
 * This was journal-data.js, and it carried the journal alongside the press:
 * six stories, a hydrateJournal() that read a store field that no longer
 * exists, and a postUrl() that built links to /pages/journal-post.html —
 * a page removed some time ago. All of that has gone with the journal; what
 * is left is the half the site still reads.
 */

// ============================================================
// Press coverage
// ------------------------------------------------------------
// Read by pages/press.html. It used to feed a second rail on the
// journal listing as well; that page is gone.
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
/**
 * The featured story, or the most recent one if nobody has flagged a story in
 * the admin panel. The fallback is not cosmetic: the journal page gives the
 * featured slot its own large block, and with no story to put in it the page
 * rendered a visible empty container. getFeaturedPress() below has always had
 * this fallback — the two disagreeing is what left the gap.
 */
export const getFeatured = () => STORIES.find(s => s.featured) || STORIES[0];
export const postUrl = (story) => `/pages/journal-post.html?id=${story.id}`;
