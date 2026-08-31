/**
 * Vayu — /pages/gallery.html.
 *
 * The gallery's venue page, and the sibling of design-for-living.html.
 * Everything it does is shared; see pages/venue.js.
 */

import { initVenuePage } from './venue.js';

export default () => initVenuePage({ venueId: 'gallery-vayu' });
