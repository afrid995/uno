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

/**
 * Constant-time comparison for secrets (e.g. API keys or test helper secrets).
 * Hashes both inputs with SHA-256 before comparison to ensure fixed-length buffers
 * and eliminate string-length timing leaks.
 */
export function timingSafeSecretCompare(provided: string, expected: string): boolean {
  try {
    if (typeof provided !== 'string' || typeof expected !== 'string') {
      return false;
    }
    if (provided.length === 0 || expected.length === 0) {
      return false;
    }
    const hashProvided = crypto.createHash('sha256').update(provided, 'utf8').digest();
    const hashExpected = crypto.createHash('sha256').update(expected, 'utf8').digest();
    return crypto.timingSafeEqual(hashProvided, hashExpected);
  } catch {
    return false;
  }
}
