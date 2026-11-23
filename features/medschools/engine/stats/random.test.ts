import { describe, expect, it } from 'vitest';
import { fnv1a, mulberry32, poisson, quantile } from './random';

describe('random', () => {
  it('fnv1a is the 32-bit FNV-1a and stable', () => {
    expect(fnv1a('a')).toBe(3826002220);
    expect(fnv1a('a')).toBe(fnv1a('a'));
    expect(fnv1a('')).toBe(0x811c9dc5);
  });
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const first = [a(), a(), a()];
    expect(first).toEqual([b(), b(), b()]);
    expect(first).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('poisson has the right mean in both regimes', () => {
    for (const [lambda, tol] of [
      [4, 0.05],
      [100, 0.5],
    ] as const) {
      const r = mulberry32(42);
      let sum = 0;
      for (let i = 0; i < 20000; i++) sum += poisson(lambda, r);
      expect(Math.abs(sum / 20000 - lambda)).toBeLessThan(tol);
    }
    expect(poisson(0, mulberry32(1))).toBe(0);
    expect(poisson(Number.NaN, mulberry32(1))).toBe(0);
  });
  it('quantile interpolates (type 7)', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([5], 0.9)).toBe(5);
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile([1, 2, 3], 1)).toBe(3);
    expect(quantile([1, 2, 3], 0)).toBe(1);
  });
});
