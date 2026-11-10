/** The seeded host RNG (rng.ts): determinism, ranges, shuffles, seeds, uniformity. */
import { describe, expect, it } from 'vitest';
import {
  Rng,
  cryptoSeed,
  cryptoSeedString,
  hashString,
  randomSeedString,
  rngNextState,
  rngSeed,
  rngState,
} from '../rng';
import { zSeed } from '../types';
import { chiSquare } from '../referee/__tests__/helpers';

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(7);
    const b = new Rng(7);
    const c = new Rng(8);
    const xs = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(xs);
  });
  it('state survives a round trip mid-sequence', () => {
    const a = new Rng(123);
    a.next();
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });
  it('remaps 0, NaN and negatives to a valid state', () => {
    expect(rngState(0)).not.toBe(0);
    expect(rngState(NaN)).not.toBe(0);
    expect(rngState(-1)).toBe(0xffffffff);
    expect(rngSeed(0)).not.toBe(0);
    expect(rngSeed(NaN)).toBe(rngSeed(0));
    expect(rngNextState(0)).not.toBe(0);
    expect(new Rng(0).next()).toBeGreaterThanOrEqual(0);
  });
  it('next ∈ [0,1), int ∈ [0,n), range inclusive, pick and shuffle', () => {
    const r = new Rng(99);
    for (let i = 0; i < 2000; i++) {
      const x = r.next();
      expect(x >= 0 && x < 1).toBe(true);
      const k = r.int(7);
      expect(Number.isInteger(k) && k >= 0 && k < 7).toBe(true);
      const g = r.range(1, 8);
      expect(g >= 1 && g <= 8).toBe(true);
    }
    expect(r.int(0)).toBe(0);
    expect(r.int(-3)).toBe(0);
    expect(r.pick([])).toBeUndefined();
    const list = [1, 2, 3, 4, 5];
    const sh = r.shuffle(list);
    expect([...sh].sort()).toEqual(list);
    expect(list).toEqual([1, 2, 3, 4, 5]);
  });
  it('raw seeds are mixed: sequential seeds give independent first draws (χ²)', () => {
    const counts = [0, 0];
    const tens = new Array(10).fill(0);
    for (let seed = 1; seed <= 4000; seed++) {
      counts[Rng.fromSeed(seed).int(2)]++;
      tens[Rng.fromSeed(seed).int(10)]++;
    }
    expect(chiSquare(counts)).toBeLessThan(10.83);
    expect(chiSquare(tens)).toBeLessThan(27.88);
    // ...while new Rng(state) continues a stream exactly.
    const a = Rng.fromSeed(5);
    a.next();
    expect(new Rng(a.state).next()).toBe(a.next());
  });
  it('int(n) is uniform (χ² sanity, fixed seed)', () => {
    const r = new Rng(2024);
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 50_000; i++) counts[r.int(10)]++;
    // df = 9: p = 0.001 critical value ≈ 27.88
    expect(chiSquare(counts)).toBeLessThan(27.88);
  });
  it('shuffle is uniform over permutations of 3 (χ²)', () => {
    const r = new Rng(5);
    const counts = new Map<string, number>();
    for (let i = 0; i < 30_000; i++) {
      const k = r.shuffle(['a', 'b', 'c']).join('');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    // df = 5: p = 0.001 ≈ 20.52
    expect(chiSquare([...counts.values()])).toBeLessThan(20.52);
  });
  it('seed strings are 8 chars of A–Z0–9', () => {
    const r = new Rng(1);
    for (let i = 0; i < 200; i++) {
      const s = randomSeedString(r);
      expect(s).toMatch(/^[A-Z0-9]{8}$/);
      expect(zSeed.safeParse(s).success).toBe(true);
    }
    expect(cryptoSeedString()).toMatch(/^[A-Z0-9]{8}$/);
    expect(cryptoSeed()).toBeGreaterThan(0);
  });
  it('hashString is stable FNV-1a', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('run1')).toBe(hashString('run1'));
    expect(hashString('run1')).not.toBe(hashString('run2'));
  });
});
