/**
 * Balatro multiplayer — the seeded RNG for host decisions (PLAN §3.e, WS4).
 *
 * Everything the host decides at random (pairing shuffles, the reseed seed,
 * vote lotteries, the draft pool) draws from this generator so the referee
 * stays a pure function of its inputs: the state is one uint32 that travels
 * in the referee checkpoint (`rngState`), and a restored host continues the
 * exact same sequence. Only `cryptoSeed()` touches the platform, and it is
 * called by the host driver (WS5/WS12), never by a step function.
 *
 * Algorithm: xorshift32 (Marsaglia 2003, shifts 13/17/5). Not cryptographic
 * and not meant to be — D-30: no anti-cheat requirement.
 */

/** Any non-zero uint32; 0 is a fixed point of xorshift, so it is remapped. */
const ZERO_REPLACEMENT = 0x9e3779b9;

/** Normalise any integer into a valid (non-zero uint32) xorshift *state* (no mixing). */
export function rngState(state: number): number {
  const s = (Number.isFinite(state) ? Math.trunc(state) : 0) >>> 0;
  return s === 0 ? ZERO_REPLACEMENT : s;
}

/**
 * Turn a raw *seed* (any integer — small, sequential, from the host) into a
 * state. xorshift's first draws from small seeds are strongly correlated
 * (seeds 1…2000 all give the same first coin flip), so seeds go through the
 * murmur3 fmix32 finaliser first. Use this when starting a stream; use
 * `new Rng(state)` to continue one.
 */
export function rngSeed(seed: number): number {
  let h = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return rngState(h);
}

/** Advance the state once. */
export function rngNextState(state: number): number {
  let x = rngState(state);
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

/**
 * A small mutable wrapper for use *inside* one pure step: construct it from
 * the state in hand, draw, then read `.state` back into the new checkpoint.
 */
export class Rng {
  private s: number;

  /** Continue the stream from `state` (see `rngSeed` to start one from a raw seed). */
  constructor(state: number) {
    this.s = rngState(state);
  }

  /** Start a stream from a raw seed. */
  static fromSeed(seed: number): Rng {
    return new Rng(rngSeed(seed));
  }

  get state(): number {
    return this.s;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.s = rngNextState(this.s);
    return this.s / 0x1_0000_0000;
  }

  /** Uniform integer in [0, n). n ≤ 0 returns 0. */
  int(n: number): number {
    if (!(n > 0)) return 0;
    return Math.floor(this.next() * n);
  }

  /** Uniform integer in [lo, hi] (inclusive). */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  /** One element, or undefined for an empty list. */
  pick<T>(list: readonly T[]): T | undefined {
    return list.length === 0 ? undefined : list[this.int(list.length)];
  }

  /** A shuffled copy (Fisher–Yates). The input is not touched. */
  shuffle<T>(list: readonly T[]): T[] {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = out[i] as T;
      out[i] = out[j] as T;
      out[j] = t;
    }
    return out;
  }
}

const SEED_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** A match seed: 8 chars of `A–Z0–9` (D-30), drawn from `rng`. */
export function randomSeedString(rng: Rng, length = 8): string {
  let s = '';
  for (let i = 0; i < length; i++) s += SEED_ALPHABET[rng.int(SEED_ALPHABET.length)];
  return s;
}

/** FNV-1a 32-bit hash of a string — a stable salt (e.g. from a runId). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A fresh seed from the platform CSPRNG — host drivers only (WS5/WS12).
 * Falls back to Math.random only where `crypto` is missing (old test hosts).
 */
export function cryptoSeed(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } })
    .crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return rngState(a[0] ?? 0);
  }
  return rngState(Math.floor(Math.random() * 0x1_0000_0000));
}

/** A fresh 8-char match seed from the platform CSPRNG (FL-01; host only). */
export function cryptoSeedString(): string {
  return randomSeedString(new Rng(cryptoSeed()));
}
