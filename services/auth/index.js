/**
 * Vayu — auth service barrel.
 *
 * Three concerns live here, all sharing the sessions table and the role
 * model: Better Auth (customer password + Google), the legacy token
 * sessions still used by the admin panel, and the Google OAuth flow.
 */

export * from './better-auth.js';
export * from './sessions.js';
export * from './google.js';

/** Vayu auth service — Better Auth, token sessions, Google OAuth. */
export { getAuth, upgradeLegacyPassword, isLegacyHash, ROLES } from './better-auth.js';
export {
  currentAdmin, currentCustomer,
  adminLogin, adminLogout, adminMe, adminChangePassword,
  customerSession, customerCookie, clearCustomerCookie,
  roleError, createThrottle,
} from './sessions.js';
export { googleEnabled, start, callback, status } from './google.js';
