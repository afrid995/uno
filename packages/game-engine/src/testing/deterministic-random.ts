import { RandomNumberGenerator } from '../deck/deck.shuffle';

/**
 * Creates a deterministic, seeded pseudo-random number generator using Mulberry32.
 * Produces identical sequences of floats in [0, 1) for a given integer seed.
 */
export function createSeededRng(seed: number): RandomNumberGenerator {
  let s = Math.floor(seed) | 0;

  return function mulberry32(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a deterministic RNG that cycles through a predefined array of numbers in [0, 1).
 */
export function createSequenceRng(sequence: readonly number[]): RandomNumberGenerator {
  if (sequence.length === 0) {
    throw new Error('Sequence must contain at least one number.');
  }

  let index = 0;
  return function sequenceRng(): number {
    const val = sequence[index % sequence.length];
    index++;
    return val;
  };
}
