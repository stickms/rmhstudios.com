import { describe, it, expect } from 'vitest';
import { DAY_LENGTH_MS, advanceClock, dayFraction, phaseOfDay, sunDirection, isOpenAt } from '../timeOfDay';
import type { TimeWindow } from '../timeOfDay';

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
    expect(dayFraction(DAY_LENGTH_MS / 2)).toBe(0.5);
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

describe('sunDirection', () => {
  const at = (f: number) => sunDirection(f * DAY_LENGTH_MS);
  it('is a unit vector', () => {
    const [x, y, z] = at(0.5);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
  });
  it('is high at noon and below the horizon at midnight', () => {
    expect(at(0.5)[1]).toBeGreaterThan(0.8);   // noon: well above horizon
    expect(at(0.0)[1]).toBeLessThan(0);         // midnight: below horizon
  });
  it('swings east to west across the day', () => {
    expect(at(0.25)[0]).toBeGreaterThan(0.5);   // dawn: eastern sky (+x)
    expect(at(0.75)[0]).toBeLessThan(-0.5);     // dusk: western sky (-x)
    expect(Math.abs(at(0.25)[1])).toBeLessThan(0.2); // dawn near horizon
  });
});

describe('isOpenAt', () => {
  const DAY: TimeWindow = { from: 0.30, to: 0.75 };
  const NIGHT: TimeWindow = { from: 0.80, to: 0.20 }; // wraps midnight
  it('same-day window', () => {
    expect(isOpenAt(DAY, 0.5 * DAY_LENGTH_MS)).toBe(true);
    expect(isOpenAt(DAY, 0.9 * DAY_LENGTH_MS)).toBe(false);
    expect(isOpenAt(DAY, 0.30 * DAY_LENGTH_MS)).toBe(true);  // inclusive from
    expect(isOpenAt(DAY, 0.75 * DAY_LENGTH_MS)).toBe(false); // exclusive to
  });
  it('wrap-around (night) window', () => {
    expect(isOpenAt(NIGHT, 0.9 * DAY_LENGTH_MS)).toBe(true);  // late night
    expect(isOpenAt(NIGHT, 0.1 * DAY_LENGTH_MS)).toBe(true);  // early morning
    expect(isOpenAt(NIGHT, 0.5 * DAY_LENGTH_MS)).toBe(false); // midday closed
    expect(isOpenAt(NIGHT, 0.80 * DAY_LENGTH_MS)).toBe(true); // inclusive from
    expect(isOpenAt(NIGHT, 0.20 * DAY_LENGTH_MS)).toBe(false);// exclusive to
  });
});
