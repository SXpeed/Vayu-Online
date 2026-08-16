/**
 * Vayu — the API route tables.
 *
 * Lifted out of the old src/worker.js unchanged, so the surface and the role
 * ranks are exactly what they were before the SvelteKit migration. The
 * dispatcher in app/routes/api/[...path]/+server.js is the only consumer.
 */

import * as storefront from './storefront.js';
import * as checkoutRoutes from './checkout.js';
import * as catalog from './admin-catalog.js';
import * as sales from './admin-sales.js';
import * as insights from './admin-insights.js';
import * as site from './admin-site.js';
import {
  adminLogin, adminLogout, adminMe, adminChangePassword,
} from './sessions.js';

/** Open endpoints the storefront calls, keyed by "METHOD /path". */
export const PUBLIC_ROUTES = {
  'GET /api/catalogue': storefront.catalogue,
  'GET /api/nav': storefront.nav,
  'POST /api/track': storefront.track,
  'GET /api/reviews': storefront.listReviews,
  'POST /api/reviews': storefront.postReview,
  'POST /api/notify-me': storefront.notifyMe,
  'POST /api/newsletter': storefront.newsletter,
  'POST /api/checkout': checkoutRoutes.checkout,
  'POST /api/checkout/confirm': checkoutRoutes.confirm,
  'POST /api/coupon/validate': checkoutRoutes.validateCoupon,
  'POST /api/admin/login': adminLogin,
};

/**
 * Signed-in endpoints, keyed by the first path segment after /api/admin/.
 * `role` is the minimum rank required — absent means any signed-in admin.
 */
export const ADMIN_ROUTES = {
  logout: { handler: adminLogout },
  me: { handler: adminMe },
  password: { handler: adminChangePassword },

  overview: { handler: insights.overview },
  analytics: { handler: insights.analytics },
  activity: { handler: insights.activity },
  outbox: { handler: insights.outbox },
  orders: { handler: sales.orders },
  customers: { handler: sales.customers },

  products: { handler: catalog.products, role: 'manager' },
  categories: { handler: catalog.categories, role: 'manager' },
  journal: { handler: catalog.journal, role: 'manager' },
  coupons: { handler: sales.coupons, role: 'manager' },
  reviews: { handler: sales.reviews, role: 'manager' },
  inventory: { handler: insights.inventory, role: 'manager' },
  content: { handler: site.content, role: 'manager' },
  upload: { handler: site.upload, role: 'manager' },
  export: { handler: site.exportCsv, role: 'manager' },

  team: { handler: site.team, role: 'owner' },
  settings: { handler: site.settings, role: 'owner' },
  backup: { handler: site.backup, role: 'owner' },
};
