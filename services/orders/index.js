/**
 * Vayu — orders service barrel.
 *
 * Checkout pipeline + admin order management + analytics insights. The
 * checkout module owns coupon, shipping, stock and Razorpay-order creation;
 * `confirm` delegates signature verification to the payments service so the
 * Razorpay secret stays confined there.
 */

export * from './checkout.js';
export * from './admin.js';
export * from './insights.js';

/** Vayu orders service — checkout pipeline + admin sales/insights. */
export * from './checkout.js';
export * from './admin.js';
export * from './insights.js';
