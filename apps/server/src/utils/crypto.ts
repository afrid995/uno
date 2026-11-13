import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Generates a high-entropy cryptographically secure random session token.
 * 32 bytes = 256 bits of entropy, formatted as 64 hex characters.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes a secure SHA-256 HMAC digest of the raw session token.
 * Only this hash is stored in the database, ensuring raw tokens cannot be recovered if the DB is compromised.
 */
export function hashSessionToken(rawToken: string): string {
  return crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(rawToken)
    .digest('hex');
}

/**
 * Constant-time safe string comparison to prevent timing attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
