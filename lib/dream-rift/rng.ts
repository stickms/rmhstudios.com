/**
 * Deterministic pseudo-random number generators for Dream Rift.
 *
 * The whole point of the netcode is that every client reproduces an identical
 * danmaku field from a shared seed + frame counter, so bullets never have to be
 * streamed over the wire. That requires a fast, fully deterministic RNG with no
 * reliance on `Math.random`. `Rng` is a small stateful xorshift wrapper used by
 * the simulation; `mulberry32` is a stateless seeder for one-off layouts.
 */

/** Stateless 32-bit seeded generator — good for fixed layouts (star fields). */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Hash two integers into a 32-bit seed (frame + salt → deterministic stream). */
export function hash2(a: number, b: number): number {
    let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
}

/** Stateful deterministic RNG (xorshift32). */
export class Rng {
    private s: number;

    constructor(seed: number) {
        this.s = (seed >>> 0) || 0x1a2b3c4d;
    }

    /** Reseed in place (used to re-derive a stream from a known frame). */
    reseed(seed: number): void {
        this.s = (seed >>> 0) || 0x1a2b3c4d;
    }

    /** Next 32-bit unsigned integer. */
    nextU32(): number {
        let x = this.s;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.s = x >>> 0;
        return this.s;
    }

    /** Float in [0, 1). */
    next(): number {
        return this.nextU32() / 4294967296;
    }

    /** Float in [min, max). */
    range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    /** Integer in [min, max]. */
    int(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1));
    }

    /** ±spread around 0. */
    spread(spread: number): number {
        return (this.next() * 2 - 1) * spread;
    }

    pick<T>(arr: readonly T[]): T {
        return arr[Math.floor(this.next() * arr.length) % arr.length];
    }
}
