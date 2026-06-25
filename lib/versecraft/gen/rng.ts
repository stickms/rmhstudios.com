// ─── Seeded RNG ───────────────────────────────────────────────────────────────
// Deterministic pseudo-random number generation for VerseCraft. The same seed
// always produces the same world, cast, and procedural choices — this is what
// makes a "version" shareable and replayable. Pure, no globals, SSR-safe.

/** Hash an arbitrary string into a 32-bit integer seed (xmur3). */
export function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Mulberry32 PRNG: fast, decent quality, fully deterministic from a 32-bit seed. */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A small deterministic RNG with ergonomic helpers. Construct from any string
 * seed; derive independent sub-streams with `fork(label)` so that, e.g., cast
 * generation and chapter generation don't perturb each other's sequences.
 */
export class Rng {
  private next01: () => number;
  readonly seedStr: string;

  constructor(seed: string) {
    this.seedStr = seed;
    this.next01 = mulberry32(xmur3(seed));
  }

  /** A new independent RNG seeded from this one + a label. */
  fork(label: string): Rng {
    return new Rng(`${this.seedStr}::${label}`);
  }

  /** Float in [0, 1). */
  next(): number {
    return this.next01();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p (default 0.5). */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Uniformly pick one element. Throws on empty input. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[this.int(0, arr.length - 1)];
  }

  /** Pick `n` distinct elements (no repeats). Clamps n to arr length. */
  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)));
  }

  /** A new shuffled copy (Fisher–Yates). */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Weighted pick: each entry is [value, weight]. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
    if (total <= 0) return this.pick(entries.map(([v]) => v));
    let r = this.next() * total;
    for (const [v, w] of entries) {
      r -= Math.max(0, w);
      if (r < 0) return v;
    }
    return entries[entries.length - 1][0];
  }
}

// ─── Shareable seed codes ───────────────────────────────────────────────────
// Human-friendly "verse codes" like "ember-tide-hush-417". They're memorable,
// pronounceable, and map 1:1 to a deterministic world. Players can share them.

const CODE_WORDS = [
  'ember', 'tide', 'hush', 'lumen', 'ash', 'vesper', 'mira', 'cobalt', 'fern',
  'dusk', 'halo', 'onyx', 'sable', 'wren', 'echo', 'frost', 'gild', 'ivy',
  'lark', 'moth', 'nova', 'opal', 'quill', 'rune', 'sage', 'thorn', 'umbra',
  'veil', 'willow', 'zephyr', 'cinder', 'drift', 'glow', 'haze', 'kindle',
  'marrow', 'plume', 'reverie', 'solace', 'tremor',
];

/** Build a fresh, human-friendly seed code from an entropy string. */
export function makeSeedCode(entropy: string): string {
  const rng = new Rng(entropy);
  const words = [rng.pick(CODE_WORDS), rng.pick(CODE_WORDS), rng.pick(CODE_WORDS)];
  return `${words.join('-')}-${rng.int(100, 999)}`;
}

/** Normalize a user-entered seed code (trim, lowercase, collapse spaces). */
export function normalizeSeed(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
