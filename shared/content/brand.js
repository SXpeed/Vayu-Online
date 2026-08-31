/**
 * Vayu — who the site says it is.
 *
 * One place for the brand name, the search-result write-up and the live
 * origin, because these strings are the ones that must not drift: Google
 * builds the site name in a result from og:site_name and the WebSite
 * structured data, and if the page title, the Open Graph tag and the JSON-LD
 * disagree it picks for itself.
 *
 * Before this, the home page carried a <title> and nothing else — no
 * description at all — so the snippet under the domain was whatever sentence
 * the crawler happened to find in the markup first.
 */

import { CONTACT_SHIPPED } from './contact.js';

/** The full brand, as it should read as a headline. */
export const BRAND = 'Vayu — Design For Living';

/** Short form, for suffixing a page title that already names itself. */
export const BRAND_SHORT = 'Vayu';

/**
 * The search snippet for the site itself.
 *
 * Kept under 160 characters: past that Google truncates mid-sentence, and a
 * snippet that ends in an ellipsis reads as carelessness on a site selling
 * considered objects.
 */
export const SITE_DESCRIPTION =
    'Vayu is a concept boutique showcasing the best of Indian crafts and designs — '
    + 'a New Delhi space where heritage craft and contemporary living meet.';

/**
 * The canonical origin, no trailing slash.
 *
 * Absolute URLs are required by Open Graph and by structured data, and the
 * home page is prerendered — there is no request to read an origin from at
 * build time, so it is stated here rather than guessed per page.
 *
 * If the live site answers on www.vayuindia.com rather than the bare domain,
 * this is the one line to change: everything else derives from it.
 */
export const SITE_ORIGIN = 'https://vayuindia.com';

/** An absolute URL for a site-relative path. */
export const absolute = (path) => new URL(path, SITE_ORIGIN + '/').href;

/**
 * The shop itself, as a search engine needs to see it.
 *
 * These strings are the ones printed in the footer. Google cross-checks a
 * business's name, address and phone against its Business Profile and every
 * directory that lists it, so the marked-up copy and the visible copy must
 * be the same characters — not a tidied-up variant.
 *
 * `sameAs` carries the Maps place link the footer already offers as GET
 * DIRECTIONS: it is what ties this markup to the Business Profile.
 *
 * Deliberately absent, because inventing them would be worse than omitting
 * them: `geo` (latitude/longitude), `openingHoursSpecification` and
 * `priceRange`. All three improve a local result and all three have to come
 * from the shop rather than be guessed at.
 */
export const STORE = {
    legalName: 'Vayu — Design for Living',
    street: 'Shop No. 14, Main Market, Lodhi Road, Block 8, Lodi Colony',
    locality: 'New Delhi',
    region: 'Delhi',
    postalCode: '110003',
    country: 'IN',
    // Sourced, not repeated. The visible footer and this markup have to be
    // the same characters or Google reads them as two different businesses —
    // and the footer is editable from the panel now, so these are the
    // SHIPPED values and the home page overlays the saved ones at runtime.
    // See shared/content/contact.js and app/routes/+page.svelte.
    telephone: CONTACT_SHIPPED.phone,
    email: CONTACT_SHIPPED.email,
    maps: 'https://maps.app.goo.gl/GdmtApHnAYBem1Cr8',
};
