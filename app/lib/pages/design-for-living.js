/**
 * Vayu — /pages/design-for-living.html.
 *
 * The store's venue page. Everything it does is shared with Gallery Vayu;
 * see pages/venue.js. All that differs is which show it is showing.
 */

import { initVenuePage } from './venue.js';

export default () => initVenuePage({ venueId: 'design-for-living' });
