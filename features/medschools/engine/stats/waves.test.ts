import { describe, expect, it } from 'vitest';
import { detectWaves, trailingMedian } from './waves';
import type { DayCount } from './shares';

const flat = (n: number, v: number, from = 0): DayCount[] =>
  Array.from({ length: n }, (_, i) => ({ day: from + i, count: v }));

describe('detectWaves', () => {
  it('flags a spike over a flat baseline', () => {
    expect(detectWaves([...flat(20, 2), { day: 20, count: 12 }])).toEqual([{ day: 20, count: 12, baseline: 2 }]);
  });
  it('is strict: exactly 3x the median is not a wave', () => {
    expect(detectWaves([...flat(20, 2), { day: 20, count: 6 }])).toEqual([]);
  });
  it('needs at least 5 invites: 4 on a median of 0 is not, 5 is', () => {
    const quiet = [{ day: 0, count: 1 }, ...flat(10, 0, 1)];
    expect(detectWaves([...quiet, { day: 11, count: 4 }])).toEqual([]);
    expect(detectWaves([...quiet, { day: 11, count: 5 }])).toEqual([{ day: 11, count: 5, baseline: 0 }]);
  });
  it('excludes the day itself from its baseline', () => {
    expect(trailingMedian([...flat(14, 2), { day: 14, count: 100 }], 14)).toBe(2);
  });
  it('counts missing days as zeros', () => {
    const days = [{ day: 7, count: 9 }, ...flat(6, 9, 8)];
    expect(trailingMedian(days, 14)).toBe(4.5);
  });
  it('needs 7 previous days of data', () => {
    expect(detectWaves([...flat(6, 1), { day: 6, count: 50 }])).toEqual([]);
    expect(detectWaves([...flat(7, 1), { day: 7, count: 50 }]).map((w) => w.day)).toEqual([7]);
  });
  it('range limits what is returned but the baseline looks back past from', () => {
    const days = [...flat(20, 2), { day: 20, count: 12 }];
    expect(detectWaves(days, { from: 21, to: 30 })).toEqual([]);
    expect(detectWaves(days, { from: 20, to: 20 })).toEqual([{ day: 20, count: 12, baseline: 2 }]);
  });
  it('two big days in a row are both waves: the median resists the first', () => {
    const days = [...flat(20, 2), { day: 20, count: 12 }, { day: 21, count: 12 }];
    expect(detectWaves(days).map((w) => w.day)).toEqual([20, 21]);
  });
  it('empty input has no waves', () => expect(detectWaves([])).toEqual([]));
});
