/**
 * Vayu — auth service barrel.
 *
 * Two concerns live here, both sharing the sessions table and the role
 * model: Better Auth (customer password + Google sign-in) and the legacy
 * token sessions still used by the admin panel.
 *
 * Google OAuth is Better Auth's, at /api/auth/callback/google. There was a
 * second, hand-rolled flow beside it at /api/account/google/callback; it was
 * unreachable from the storefront and its only lasting effect was that the
 * setup docs named ITS callback, so every fresh Google client was registered
 * with a URI the app never sends and sign-in failed with
 * redirect_uri_mismatch. It is gone.
 */

export * from './better-auth.js';
export * from './sessions.js';

/** Vayu auth service — Better Auth and token sessions. */
export { getAuth, upgradeLegacyPassword, isLegacyHash, ROLES, googleEnabled } from './better-auth.js';
export {
  currentAdmin, currentCustomer,
  adminLogin, adminLogout, adminMe, adminChangePassword,
  customerSession, customerCookie, clearCustomerCookie,
  roleError, createThrottle,
} from './sessions.js';
