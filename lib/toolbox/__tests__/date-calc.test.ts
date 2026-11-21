import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  addToDate,
  businessDaysBetween,
  differenceBetween,
  formatPlainDate,
  parsePlainDate,
  weekday,
} from '@/lib/toolbox/date-calc';

const d = (s: string) => {
  const p = parsePlainDate(s);
  if (!p) throw new Error(s);
  return p;
};

describe('parsePlainDate', () => {
  it('accepts real dates only', () => {
    expect(parsePlainDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parsePlainDate('2023-02-29')).toBeNull();
    expect(parsePlainDate('2024-13-01')).toBeNull();
    expect(parsePlainDate('20240101')).toBeNull();
    expect(weekday(d('2026-11-20'))).toBe(5);
  });
});

describe('differenceBetween', () => {
  it('counts total days, weeks and the calendar difference', () => {
    expect(differenceBetween(d('2026-01-01'), d('2026-12-25'))).toEqual({
      totalDays: 358,
      weeks: 51,
      remainderDays: 1,
      calendar: { years: 0, months: 11, days: 24 },
      businessDays: 256,
    });
  });

  it('counts month ends the way people do', () => {
    expect(differenceBetween(d('2026-01-31'), d('2026-02-28')).calendar).toEqual({ years: 0, months: 0, days: 28 });
    expect(differenceBetween(d('2026-01-31'), d('2026-03-01')).calendar).toEqual({ years: 0, months: 1, days: 1 });
    expect(differenceBetween(d('2000-02-29'), d('2026-02-28')).calendar).toEqual({ years: 25, months: 11, days: 30 });
  });

  it('is signed when the end comes first, and can include the end day', () => {
    expect(differenceBetween(d('2026-01-10'), d('2026-01-01')).totalDays).toBe(-9);
    expect(differenceBetween(d('2026-01-01'), d('2026-01-01'), true).totalDays).toBe(1);
  });

  it('crosses a daylight-saving change without losing a day', () => {
    expect(differenceBetween(d('2026-03-28'), d('2026-03-30')).totalDays).toBe(2);
  });
});

describe('businessDaysBetween', () => {
  it('skips weekends', () => {
    // Friday to the next Friday: Fri, Mon, Tue, Wed, Thu.
    expect(businessDaysBetween(d('2026-11-20'), d('2026-11-27'))).toBe(5);
    expect(businessDaysBetween(d('2026-11-21'), d('2026-11-23'))).toBe(0);
  });
});

describe('adding', () => {
  it('clamps to the end of a shorter month', () => {
    expect(formatPlainDate(addToDate(d('2026-01-31'), { months: 1 }))).toBe('2026-02-28');
    expect(formatPlainDate(addToDate(d('2024-02-29'), { years: 1 }))).toBe('2025-02-28');
    expect(formatPlainDate(addToDate(d('2026-03-31'), { months: -1 }))).toBe('2026-02-28');
    expect(formatPlainDate(addToDate(d('2026-12-15'), { months: 2, weeks: 1, days: -1 }))).toBe('2027-02-21');
  });

  it('adds business days in both directions', () => {
    expect(formatPlainDate(addBusinessDays(d('2026-11-20'), 1))).toBe('2026-11-23');
    expect(formatPlainDate(addBusinessDays(d('2026-11-23'), -1))).toBe('2026-11-20');
    expect(formatPlainDate(addBusinessDays(d('2026-11-21'), 1))).toBe('2026-11-23');
    expect(formatPlainDate(addBusinessDays(d('2026-11-20'), 0))).toBe('2026-11-20');
  });
});
