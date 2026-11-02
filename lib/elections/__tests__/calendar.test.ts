import { describe, expect, it } from 'vitest';
import {
  countdownTo,
  currentCycle,
  cycleForYear,
  cycleOptions,
  etDayStart,
  generalElectionDate,
  parseCycle,
  phaseOf,
  resultsUrl,
} from '../calendar';

describe('generalElectionDate', () => {
  it('is the Tuesday after the first Monday in November', () => {
    expect(generalElectionDate(2024)).toBe('2024-11-05');
    expect(generalElectionDate(2026)).toBe('2026-11-03');
    expect(generalElectionDate(2028)).toBe('2028-11-07');
    expect(generalElectionDate(2030)).toBe('2030-11-05');
    // Nov 1 is a Monday: the earliest possible Election Day.
    expect(generalElectionDate(2032)).toBe('2032-11-02');
  });
});

describe('cycleForYear', () => {
  it('labels midterms and presidential years', () => {
    expect(cycleForYear(2026).kind).toBe('midterm');
    expect(cycleForYear(2028).kind).toBe('presidential');
    expect(cycleForYear(2028).offices).toContain('president');
    expect(cycleForYear(2026).offices).not.toContain('president');
  });
});

describe('parseCycle', () => {
  it('accepts a year or its exact date and rejects the rest', () => {
    expect(parseCycle('2028')?.date).toBe('2028-11-07');
    expect(parseCycle('2028-11-07')?.year).toBe(2028);
    expect(parseCycle('2027')).toBeNull(); // odd year
    expect(parseCycle('2028-11-08')).toBeNull();
    expect(parseCycle('nope')).toBeNull();
    expect(parseCycle(undefined)).toBeNull();
  });
});

describe('etDayStart', () => {
  it('starts the day at midnight Eastern, standard and daylight time', () => {
    expect(etDayStart('2026-11-03').toISOString()).toBe('2026-11-03T05:00:00.000Z');
    // 2032: DST has not ended yet on Nov 2.
    expect(etDayStart('2032-11-02').toISOString()).toBe('2032-11-02T04:00:00.000Z');
  });
});

describe('phaseOf / currentCycle', () => {
  const date = '2026-11-03';
  it('walks upcoming → election-day → counting → archive', () => {
    expect(phaseOf(date, new Date('2026-11-02T12:00:00Z'))).toBe('upcoming');
    expect(phaseOf(date, new Date('2026-11-03T12:00:00Z'))).toBe('election-day');
    expect(phaseOf(date, new Date('2026-11-05T12:00:00Z'))).toBe('counting');
    expect(phaseOf(date, new Date('2026-12-30T12:00:00Z'))).toBe('archive');
  });
  it('opens on the next election, and rolls to 2028 after the counting window', () => {
    expect(currentCycle(new Date('2026-11-02T12:00:00Z')).year).toBe(2026);
    expect(currentCycle(new Date('2026-11-20T12:00:00Z')).year).toBe(2026);
    expect(currentCycle(new Date('2026-12-30T12:00:00Z')).year).toBe(2028);
    expect(cycleOptions(new Date('2026-11-02T12:00:00Z')).map((c) => c.year)).toEqual([
      2024, 2026, 2028, 2030,
    ]);
  });
});

describe('countdownTo', () => {
  it('splits the remaining time and clamps at zero', () => {
    const c = countdownTo('2026-11-03', new Date('2026-11-01T03:58:58Z'));
    expect(c).toMatchObject({ days: 2, hours: 1, minutes: 1, seconds: 2 });
    expect(countdownTo('2026-11-03', new Date('2026-11-04T00:00:00Z')).totalMs).toBe(0);
  });
});

describe('resultsUrl', () => {
  it('points at the per-office static page', () => {
    expect(resultsUrl('2026-11-03', 'senate')).toBe(
      'https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-senate.json',
    );
  });
});
