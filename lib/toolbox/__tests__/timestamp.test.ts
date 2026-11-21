import { describe, expect, it } from 'vitest';
import { dayOfYear, guessUnit, isoWeek, parseTimestamp, relativeParts, unixSeconds } from '@/lib/toolbox/timestamp';

describe('parseTimestamp', () => {
  it('guesses the unit from the number of digits', () => {
    expect(guessUnit('1700000000')).toBe('seconds');
    expect(guessUnit('1700000000000')).toBe('milliseconds');
    expect(guessUnit('1700000000000000')).toBe('microseconds');
    expect(guessUnit('1700000000000000000')).toBe('nanoseconds');
    for (const s of ['1700000000', '1700000000000', '1700000000000000', '1700000000000000000']) {
      const r = parseTimestamp(s);
      expect(r.ok && r.date.toISOString(), s).toBe('2023-11-14T22:13:20.000Z');
    }
  });

  it('honours a fixed unit, negatives and fractions', () => {
    const r = parseTimestamp('1700000000', 'milliseconds');
    expect(r.ok && r.date.toISOString()).toBe('1970-01-20T16:13:20.000Z');
    const neg = parseTimestamp('-86400');
    expect(neg.ok && neg.date.toISOString()).toBe('1969-12-31T00:00:00.000Z');
    const frac = parseTimestamp('1.5');
    expect(frac.ok && frac.date.getTime()).toBe(1500);
  });

  it('reads date strings', () => {
    const r = parseTimestamp('2024-02-29T12:00:00Z');
    expect(r).toEqual({ ok: true, date: new Date('2024-02-29T12:00:00Z'), unit: 'date' });
  });

  it('reports empty, invalid and out-of-range input', () => {
    expect(parseTimestamp('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseTimestamp('soon')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseTimestamp('99999999999', 'milliseconds').ok).toBe(true);
    expect(parseTimestamp('9999999999999999', 'seconds')).toEqual({ ok: false, reason: 'out-of-range' });
  });
});

describe('calendar facts', () => {
  it('computes the day of year and ISO week', () => {
    expect(dayOfYear(new Date('2024-12-31T00:00:00Z'))).toBe(366);
    expect(isoWeek(new Date('2021-01-03T00:00:00Z'))).toEqual({ year: 2020, week: 53 });
    expect(isoWeek(new Date('2024-12-30T00:00:00Z'))).toEqual({ year: 2025, week: 1 });
  });

  it('floors Unix seconds before 1970', () => {
    expect(unixSeconds(new Date(-1500))).toBe(-2);
  });
});

describe('relativeParts', () => {
  const now = new Date('2026-01-10T00:00:00Z');
  it('picks the largest whole unit', () => {
    expect(relativeParts(new Date('2026-01-07T00:00:00Z'), now)).toEqual([-3, 'day']);
    expect(relativeParts(new Date('2026-01-10T05:00:00Z'), now)).toEqual([5, 'hour']);
    expect(relativeParts(new Date('2024-01-10T00:00:00Z'), now)).toEqual([-2, 'year']);
    expect(relativeParts(now, now)).toEqual([0, 'second']);
  });
});
