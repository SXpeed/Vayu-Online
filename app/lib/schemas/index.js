/**
 * Vayu — the validation gate.
 *
 * One table from "METHOD /path" to a schema, mirroring the route tables in
 * server/routes.js, plus a prefix rule for the account and admin sections
 * whose paths carry an id. The dispatcher calls validate() once, before any
 * handler runs.
 *
 * Anything not listed passes through untouched: GETs carry no body, and an
 * endpoint without a schema is no worse off than it was before.
 */

import * as pub from './public.js';
import * as account from './account.js';
import * as admin from './admin.js';

/** Exact "METHOD /path" matches. */
const EXACT = {
    'POST /api/newsletter': pub.newsletter,
    'POST /api/notify-me': pub.notifyMe,
    'POST /api/reviews': pub.review,
    'POST /api/track': pub.track,
    'POST /api/coupon/validate': pub.couponValidate,
    'POST /api/checkout': pub.checkout,
    'POST /api/checkout/confirm': pub.checkoutConfirm,
    'POST /api/admin/login': admin.adminLogin,

    'POST /api/account/register': account.register,
    'POST /api/account/login': account.login,
    'PUT /api/account/profile': account.updateProfile,
    'POST /api/account/password': account.changePassword,
};

/**
 * Sections whose path carries a trailing id — /api/account/addresses/addr_7,
 * /api/admin/products/prod_3 — keyed by "METHOD <section>".
 */
const SECTION = {
    'POST /api/account/addresses': account.address,
    'PUT /api/account/addresses': account.address,

    'POST /api/admin/products': admin.product,
    'PUT /api/admin/products': admin.product,
    'POST /api/admin/categories': admin.category,
    'PUT /api/admin/categories': admin.category,
    'POST /api/admin/journal': admin.journalStory,
    'PUT /api/admin/journal': admin.journalStory,
    'POST /api/admin/shipping-presets': admin.shippingPreset,
    'PUT /api/admin/shipping-presets': admin.shippingPreset,
    'POST /api/admin/coupons': admin.coupon,
    'PUT /api/admin/coupons': admin.coupon,
    'PUT /api/admin/content': admin.siteContent,
    'POST /api/admin/content': admin.siteContent,
    'POST /api/admin/team': admin.teamMember,
    'PUT /api/admin/team': admin.teamMember,
    'PUT /api/admin/settings': admin.settings,
    'POST /api/admin/settings': admin.settings,
};

/** Longest section prefix wins, so /api/admin/products/3 finds `products`. */
function findSchema(method, path) {
    const exact = EXACT[`${method} ${path}`];
    if (exact) return exact;

    for (const key of Object.keys(SECTION)) {
        const [m, prefix] = key.split(' ');
        if (m !== method) continue;
        if (path === prefix || path.startsWith(prefix + '/')) return SECTION[key];
    }
    return null;
}

/**
 * Validate a request body.
 *
 * Returns `{ ok: true, value }` with the parsed body, or `{ ok: false }` with
 * a message the caller can show and the per-field issues underneath it. The
 * message is the first field error rather than Zod's raw dump, because it is
 * shown to a shopper at checkout.
 */
export function validate(method, path, body) {
    const schema = findSchema(method, path);
    if (!schema) return { ok: true, value: body };

    const result = schema.safeParse(body ?? {});
    if (result.success) return { ok: true, value: result.data };

    const issues = result.error.issues.map(i => ({
        field: i.path.join('.') || '(body)',
        message: i.message,
    }));

    return { ok: false, error: issues[0]?.message || 'That request was not valid.', issues };
}
