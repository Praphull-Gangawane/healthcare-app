import bcrypt from 'bcryptjs';
import { z } from 'zod';

const COST = 12;

/** Password policy: 10+ chars with upper, lower, digit. (Configure stricter rules per org policy.) */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(128, 'Password is too long.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/\d/, 'Password must include a number.');

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * Unknown-user path: compare against a dummy hash of the SAME cost as real hashes so the response
 * time does not reveal whether an account exists. Computed once, lazily.
 */
let dummyHash: Promise<string> | null = null;
export const burnVerify = async (plain: string) => {
  dummyHash ??= bcrypt.hash('dummy-password-for-timing', COST);
  return bcrypt.compare(plain, await dummyHash);
};
