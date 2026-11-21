import { describe, expect, it } from 'vitest';
import { randomInt, secureShuffle, seededWords } from '@/lib/toolbox/random';

describe('randomInt', () => {
  it('stays in range and rejects bad bounds', () => {
    for (let i = 0; i < 1000; i++) {
      const n = randomInt(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
    }
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(1.5)).toThrow(RangeError);
  });

  it('rejects words above the largest multiple of max (no modulo bias)', () => {
    // 2^32 % 3 === 1, so the single top word 0xffffffff must be redrawn.
    const words = [0xffffffff, 4];
    let i = 0;
    expect(randomInt(3, () => words[i++] ?? 0)).toBe(1);
    expect(i).toBe(2);
  });

  it('is roughly uniform', () => {
    const counts = [0, 0, 0, 0];
    const source = seededWords(42);
    for (let i = 0; i < 40_000; i++) counts[randomInt(4, source)]!++;
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(600);
  });
});

describe('secureShuffle', () => {
  it('returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = secureShuffle(input, seededWords(7));
    expect(out).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
});
