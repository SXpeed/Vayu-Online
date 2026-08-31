/**
 * Vayu — shared JSDoc type definitions.
 *
 * No runtime code: these exist so service functions carry a typed signature
 * and the data shapes the storefront was written against are documented in
 * one place. JSDoc `@typedef` is the lightest form — no build step, no .d.ts
 * to keep in sync, and VS Code picks it up across the workspace.
 */

/**
 * The bound Cloudflare environment. Services only read the bindings they
 * need; Razorpay secrets live on the env the payments service receives and
 * are never exposed to storefront/admin code.
 *
 * @typedef {Object} Env
 * @property {D1Database} DB
 * @property {R2Bucket}   UPLOADS
 * @property {string}     BETTER_AUTH_SECRET
 * @property {string}     [PUBLIC_ORIGIN]    https://vayuindia.com
 * @property {string}     [ADMIN_ORIGIN]     https://admin.vayuindia.com
 * @property {string}     [API_ORIGIN]       https://api.vayuindia.com
 * @property {string}     [GOOGLE_CLIENT_ID]
 * @property {string}     [GOOGLE_CLIENT_SECRET]
 * @property {string}     [RAZORPAY_KEY_ID]
 * @property {string}     [RAZORPAY_KEY_SECRET]
 * @property {string}     [RAZORPAY_WEBHOOK_SECRET]
 */

/** @typedef {{ id: string, name: string, email: string, role: "staff"|"manager"|"owner", must_change_password: number }} Admin */

/** @typedef {{ id: string, email: string, name: string, phone: string, orders_count: number, google_sub: ?string }} Customer */

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {number} price
 * @property {number} [stock]
 * @property {number} sold
 * @property {string} status
 * @property {string} slug
 * @property {{ id: string, name: string, stock: number, image: string, combo: string }[]} [variants]
 * @property {{ slug: string, title: string }[]} [categories]
 * @property {number} [idx]
 */

/**
 * @typedef {Object} OrderLine
 * @property {string} productId
 * @property {?string} variantId
 * @property {string} name
 * @property {?string} variant
 * @property {number} qty
 * @property {number} price
 * @property {string} img
 */

/**
 * @typedef {Object} Order
 * @property {string} id
 * @property {string} number
 * @property {string} status
 * @property {number} subtotal
 * @property {number} discount
 * @property {number} shipping
 * @property {number} total
 * @property {string} payment_method
 * @property {OrderLine[]} [lines]
 */

/**
 * The context object every service handler receives. Built by the API app's
 * dispatcher and passed straight through; services never touch `env` or
 * `request` directly except through this.
 *
 * @typedef {Object} Ctx
 * @property {Request} request
 * @property {Object} env        Cloudflare bindings (DB, UPLOADS, secrets)
 * @property {Object} [ctx]      Workers execution context (waitUntil, etc.)
 * @property {import("#shared/database/store.js").Store} store
 * @property {Object} body       Parsed JSON body
 * @property {string} method
 * @property {URLSearchParams} query
 * @property {URL} url
 * @property {string[]} parts    Path segments after the resource root
 * @property {Admin} [admin]
 * @property {Customer} [customer]
 */

/** @typedef {(ctx: Ctx, item?: Object) => Promise<Response>} Handler */
