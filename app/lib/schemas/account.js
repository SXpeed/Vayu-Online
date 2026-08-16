/**
 * Vayu — schemas for /api/account/*.
 *
 * The address fields mirror the caps the handlers already applied by hand in
 * readAddress(); stating them once here means the two cannot drift.
 */

import { z } from 'zod';
import { email } from './public.js';

/**
 * Eight characters is the floor the site already enforced. It is stated here
 * rather than only in the handler so a caller gets a real message back
 * instead of a generic rejection.
 */
const password = z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(200, 'That password is too long.');

export const register = z.object({
    name: z.string().trim().max(120).optional(),
    email,
    password,
});

export const login = z.object({
    email,
    password: z.string().min(1, 'Enter your password.').max(200),
});

export const updateProfile = z.object({
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(20).optional(),
});

export const changePassword = z.object({
    current: z.string().min(1).max(200),
    next: password,
});

export const address = z.object({
    label: z.string().trim().max(40).optional(),
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    address: z.string().trim().min(1, 'Enter a street address.').max(400),
    city: z.string().trim().max(80).optional(),
    pin: z.string().trim().min(1, 'Enter a PIN code.').max(12),
    isDefault: z.boolean().optional(),
});
