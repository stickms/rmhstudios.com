import { describe, expect, it } from 'vitest';
import { INTERVALS, INTERVAL_NAMES, intervalOf, type IntervalName } from './intervals';

describe('intervalOf', () => {
  it('names the interval between two pitches', () => {
    expect(intervalOf(60, 67)).toBe('fifth');
    expect(intervalOf(60, 64)).toBe('third');
    expect(intervalOf(60, 63)).toBe('third'); // a minor third is a third too
    expect(intervalOf(60, 62)).toBe('second');
    expect(intervalOf(60, 65)).toBe('fourth');
    expect(intervalOf(60, 72)).toBe('octave');
    expect(intervalOf(60, 60)).toBe('unison');
    expect(intervalOf(60, 69)).toBe('sixth');
    expect(intervalOf(60, 71)).toBe('seventh');
  });
  it('does not name a minor second or a tritone in Phase 2', () => {
    expect(intervalOf(60, 61)).toBeNull();
    expect(intervalOf(60, 66)).toBeNull();
  });
  it('does not name anything wider than an octave, or a non-note', () => {
    expect(intervalOf(60, 74)).toBeNull();
    expect(intervalOf(60, Number.NaN)).toBeNull();
    expect(intervalOf(Infinity, 60)).toBeNull();
  });
  it('is the same whichever note is higher', () => {
    expect(intervalOf(67, 60)).toBe('fifth');
  });
});

describe('INTERVALS', () => {
  it('lists each size once, in no two intervals', () => {
    const seen = new Set<number>();
    for (const name of INTERVAL_NAMES) {
      for (const s of INTERVALS[name].semitones) {
        expect(seen.has(s), `${name} ${s}`).toBe(false);
        seen.add(s);
      }
    }
  });
  it('gives a third its minor and major sizes', () => {
    expect(INTERVALS.third.semitones).toEqual([3, 4]);
  });
  it('has a plain English label for every interval', () => {
    for (const name of INTERVAL_NAMES) {
      const label: string = INTERVALS[name as IntervalName].label;
      expect(label).toMatch(/^[a-z]+$/);
    }
  });
});
