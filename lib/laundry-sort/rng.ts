/**
 * Deterministic seeded RNG for Laundry Sort.
 *
 * Multiplayer and the daily challenge rely on every client producing the
 * *same* sequence of spawned clothing from a shared integer seed — only the
 * scores travel over the wire, never the item stream. A tiny, fast,
 * dependency-free mulberry32 generator gives us that reproducibility.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Force to a 32-bit unsigned integer; guarantee a non-zero state.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Pick a random element of an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Random sign, -1 or +1. */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}

/** Produce a random 32-bit seed (host/single-player use). */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

/**
 * Stable seed derived from a YYYY-MM-DD date key, so the daily challenge is
 * identical for everyone on a given day without a server round-trip.
 */
export function seedFromDateKey(dateKey: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
}

/** Today's date key in UTC (matches the daily-puzzles convention). */
export function todayDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
