/**
 * Unbiased randomness for the Toolbox (passwords, dice, the picker, IDs).
 *
 * `Math.random()` is never used: a password or a raffle draw must not be
 * predictable. Integers come from `crypto.getRandomValues` with rejection
 * sampling, so `randomInt(6)` gives each face exactly 1/6 (a plain `% 6` on a
 * 32-bit value would favour the low faces very slightly).
 */

/** A source of 32-bit unsigned words; injectable so tests are deterministic. */
export type WordSource = () => number;

export const cryptoWords: WordSource = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 0;
};

const RANGE = 0x1_0000_0000;

/** A uniform integer in `[0, max)`. `max` must be a positive integer no larger than 2^32. */
export function randomInt(max: number, source: WordSource = cryptoWords): number {
  if (!Number.isInteger(max) || max <= 0 || max > RANGE) {
    throw new RangeError(`randomInt: max must be an integer in 1..2^32, got ${max}`);
  }
  // The largest multiple of `max` that fits, so every residue is equally likely.
  const limit = RANGE - (RANGE % max);
  for (;;) {
    const word = source();
    if (word < limit) return word % max;
  }
}

/** A new array with the items in a uniformly random order (Fisher-Yates). */
export function secureShuffle<T>(items: readonly T[], source: WordSource = cryptoWords): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, source);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/** `n` random bytes. */
export function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * A deterministic word source for tests: a small xorshift generator. Not for
 * anything a user relies on.
 */
export function seededWords(seed: number): WordSource {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}
