import crypto from 'crypto';

export type RandomNumberGenerator = () => number;

/**
 * Cryptographically secure random number generator using Node.js crypto.
 * Returns a float in [0, 1).
 */
export const defaultCryptoRng: RandomNumberGenerator = (): number => {
  const buffer = crypto.randomBytes(4);
  return buffer.readUInt32LE(0) / 0x100000000;
};

/**
 * Performs a Fisher-Yates shuffle on an array of items.
 * Does not mutate the source array; returns a fresh shuffled copy.
 */
export function shuffleDeck<T>(items: readonly T[], rng: RandomNumberGenerator = defaultCryptoRng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}
