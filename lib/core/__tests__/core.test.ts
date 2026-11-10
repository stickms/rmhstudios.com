import { describe, expect, it } from 'vitest';
import { clamp, clamp01, invLerp, lerp, remap } from '../math';
import { mulberry32, shuffle } from '../rng';
import { formatClockSeconds, formatCompact, formatDurationMs } from '../format';

describe('math', () => {
  it('clamp is (value, lo, hi)', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('clamp with lo > hi does not swap: below lo -> lo, otherwise hi', () => {
    expect(clamp(0, 3, 1)).toBe(3);
    expect(clamp(5, 3, 1)).toBe(1);
  });
  it('clamp/clamp01 pass NaN through', () => {
    expect(clamp(NaN, 0, 1)).toBeNaN();
    expect(clamp01(NaN)).toBeNaN();
  });
  it('clamp01', () => {
    expect([clamp01(-2), clamp01(0.4), clamp01(9)]).toEqual([0, 0.4, 1]);
  });
  it('lerp / invLerp / remap', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 2)).toBe(30);
    expect(invLerp(0, 10, 5)).toBe(0.5);
    expect(invLerp(4, 4, 9)).toBe(0);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
  });
});

// Reference copy of the generator the daily doctrine puzzles were seeded with (features/doctrine/engine).
function doctrineMulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rng', () => {
  it('mulberry32 known sequences', () => {
    const take = (seed: number) => {
      const r = mulberry32(seed);
      return Array.from({ length: 5 }, () => r());
    };
    expect(take(0)).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111, 0.46732782293111086,
    ]);
    expect(take(42)).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423,
    ]);
  });
  it('mulberry32 matches the doctrine/Go-parity reference', () => {
    for (const seed of [0, 1, 42, -1, 2 ** 31, 2 ** 32 + 5, 20261109, 1.5]) {
      const a = mulberry32(seed);
      const b = doctrineMulberry32(seed);
      for (let i = 0; i < 50; i++) expect(a()).toBe(b());
    }
  });
  it('shuffle is Fisher-Yates, deterministic with a seed, and non-mutating', () => {
    const src = [1, 2, 3, 4, 5, 6];
    const a = shuffle(src, mulberry32(7));
    const b = shuffle(src, mulberry32(7));
    expect(a).toEqual(b);
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...a].sort()).toEqual(src);
    // rand() === 0 always picks index 0: [a,b,c] -> swap(2,0) -> [c,b,a] -> swap(1,0) -> [b,c,a]
    expect(shuffle(['a', 'b', 'c'], () => 0)).toEqual(['b', 'c', 'a']);
  });
});

describe('format', () => {
  it('formatClockSeconds', () => {
    expect(formatClockSeconds(65.9)).toBe('1:05');
    expect(formatClockSeconds(-4)).toBe('0:00');
    expect(formatClockSeconds(3725)).toBe('62:05');
    expect(formatClockSeconds(3725, { hours: true })).toBe('1:02:05');
    expect(formatClockSeconds(125, { hours: true })).toBe('2:05');
  });
  it('formatDurationMs', () => {
    expect(formatDurationMs(42_400)).toBe('42s');
    expect(formatDurationMs(187_000)).toBe('3m 7s');
  });
  it('formatCompact', () => {
    expect(formatCompact(1234, 'en-US')).toBe('1.2K');
  });
});
