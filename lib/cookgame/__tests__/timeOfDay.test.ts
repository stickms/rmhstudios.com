import { describe, it, expect } from 'vitest';
import { DAY_LENGTH_MS, advanceClock, dayFraction, phaseOfDay } from '../timeOfDay';

describe('advanceClock', () => {
  it('advances within the day', () => {
    expect(advanceClock(0, 1000)).toBe(1000);
  });
  it('wraps at day length', () => {
    expect(advanceClock(DAY_LENGTH_MS - 500, 1000)).toBe(500);
  });
  it('wraps multiple days in one big step', () => {
    expect(advanceClock(0, DAY_LENGTH_MS * 2 + 250)).toBe(250);
  });
  it('keeps result in [0, DAY_LENGTH_MS) for negative drift', () => {
    const r = advanceClock(100, -300);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(DAY_LENGTH_MS);
  });
});

describe('dayFraction', () => {
  it('is 0 at midnight and 0.5 at noon', () => {
    expect(dayFraction(0)).toBe(0);
    expect(dayFraction(DAY_LENGTH_MS / 2)).toBeCloseTo(0.5, 6);
  });
});

describe('phaseOfDay', () => {
  const at = (f: number) => phaseOfDay(f * DAY_LENGTH_MS);
  it('maps fractions to phases', () => {
    expect(at(0.0)).toBe('night');
    expect(at(0.1)).toBe('night');
    expect(at(0.25)).toBe('dawn');
    expect(at(0.5)).toBe('day');
    expect(at(0.75)).toBe('dusk');
    expect(at(0.85)).toBe('night');
  });
  it('uses half-open boundaries', () => {
    expect(at(0.20)).toBe('dawn');
    expect(at(0.30)).toBe('day');
    expect(at(0.70)).toBe('dusk');
    expect(at(0.80)).toBe('night');
  });
});
