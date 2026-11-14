import { describe, it, expect } from 'vitest';
import {
  generateSessionToken,
  hashSessionToken,
  timingSafeCompare,
  timingSafeSecretCompare,
} from '../../src/utils/crypto';

describe('Crypto Utilities', () => {
  it('generates a 64-character hexadecimal session token with 256 bits of entropy', () => {
    const token = generateSessionToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it('generates distinct random tokens on subsequent calls', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();
    expect(token1).not.toBe(token2);
  });

  it('generates a deterministic SHA-256 HMAC hash for the same raw token', () => {
    const token = generateSessionToken();
    const hash1 = hashSessionToken(token);
    const hash2 = hashSessionToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('generates different hashes for different tokens', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();
    expect(hashSessionToken(token1)).not.toBe(hashSessionToken(token2));
  });

  it('safely compares matching strings in constant time', () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(timingSafeCompare(hash, hash)).toBe(true);
  });

  it('returns false for mismatched strings', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();
    expect(timingSafeCompare(token1, token2)).toBe(false);
  });

  it('returns false when string lengths differ without throwing', () => {
    expect(timingSafeCompare('short', 'much_longer_string')).toBe(false);
  });

  describe('timingSafeSecretCompare', () => {
    it('returns true for matching secrets', () => {
      const secret = 'strong_test_helper_secret_1234567890';
      expect(timingSafeSecretCompare(secret, secret)).toBe(true);
    });

    it('returns false for mismatched secrets of identical length', () => {
      const secretA = 'strong_test_helper_secret_1234567890';
      const secretB = 'strong_test_helper_secret_1234567891';
      expect(timingSafeSecretCompare(secretA, secretB)).toBe(false);
    });

    it('returns false for secrets of differing lengths without throwing', () => {
      expect(timingSafeSecretCompare('short', 'much_longer_secret_for_tests')).toBe(false);
      expect(timingSafeSecretCompare('much_longer_secret_for_tests', 'short')).toBe(false);
    });

    it('returns false safely for empty or non-string inputs', () => {
      expect(timingSafeSecretCompare('', 'some_secret')).toBe(false);
      expect(timingSafeSecretCompare('some_secret', '')).toBe(false);
      expect(timingSafeSecretCompare('', '')).toBe(false);
      expect(timingSafeSecretCompare(null as any, 'some_secret')).toBe(false);
      expect(timingSafeSecretCompare('some_secret', undefined as any)).toBe(false);
    });
  });
});
