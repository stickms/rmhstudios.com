import { describe, expect, it } from 'vitest';
import {
  addDays,
  cardState,
  dayKeyInZone,
  fillDays,
  forecast,
  isValidTimeZone,
  retention,
  streaks,
} from '@/lib/study/stats';
import { firstDayOfWeek } from '@/lib/locale-week';

describe('cardState', () => {
  it('has the boundaries at 0, 1, 20 and 21 days', () => {
    expect(cardState(0, false)).toBe('new');
    expect(cardState(0, true)).toBe('learning');
    expect(cardState(1, true)).toBe('young');
    expect(cardState(20, true)).toBe('young');
    expect(cardState(21, true)).toBe('mature');
  });
});

describe('streaks', () => {
  it('breaks at a missed day and keeps the longest run', () => {
    const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-14', '2026-11-15'];
    expect(streaks(days, '2026-11-15')).toEqual({ current: 2, longest: 3 });
  });
  it('does not end the current streak on an empty today', () => {
    expect(streaks(['2026-11-13', '2026-11-14'], '2026-11-15')).toEqual({ current: 2, longest: 2 });
    expect(streaks(['2026-11-12'], '2026-11-15')).toEqual({ current: 0, longest: 1 });
  });
  it('ignores repeats and order, and handles no days', () => {
    expect(streaks(['2026-11-15', '2026-11-14', '2026-11-15'], '2026-11-15').current).toBe(2);
    expect(streaks([], '2026-11-15')).toEqual({ current: 0, longest: 0 });
  });
  it('counts across a month end', () => {
    expect(streaks(['2026-11-30', '2026-12-01'], '2026-12-01').current).toBe(2);
  });
  it('follows the viewer time zone across midnight', () => {
    // 23:30 in New York on the 14th is already the 15th in Tokyo.
    const first = new Date('2026-11-15T04:30:00Z');
    const second = new Date('2026-11-14T15:30:00Z');
    const key = (d: Date, tz: string) => dayKeyInZone(d, tz);
    expect(key(first, 'America/New_York')).toBe('2026-11-14');
    expect(key(first, 'Asia/Tokyo')).toBe('2026-11-15');
    // Two reviews a few hours apart are one streak day in one zone and two in the other.
    const ny = [key(first, 'America/New_York'), key(second, 'America/New_York')];
    const tokyo = [key(first, 'Asia/Tokyo'), key(second, 'Asia/Tokyo')];
    expect(streaks(ny, '2026-11-14')).toEqual({ current: 1, longest: 1 });
    expect(streaks(tokyo, '2026-11-15')).toEqual({ current: 1, longest: 1 });
    expect(new Set(tokyo).size).toBe(1);
  });
});

describe('retention', () => {
  it('is hidden under 20 samples', () => {
    expect(retention({ total: 19, passed: 19 })).toEqual({ rate: null, samples: 19 });
    expect(retention({ total: 0, passed: 0 })).toEqual({ rate: null, samples: 0 });
  });
  it('is the pass share from 20 samples', () => {
    expect(retention({ total: 20, passed: 15 })).toEqual({ rate: 0.75, samples: 20 });
  });
});

describe('forecast', () => {
  it('folds overdue cards into today and drops days past the horizon', () => {
    const out = forecast(
      [
        { date: '2026-11-01', count: 4 },
        { date: '2026-11-15', count: 2 },
        { date: '2026-11-16', count: 3 },
        { date: '2026-12-15', count: 9 },
      ],
      '2026-11-15',
      30,
    );
    expect(out).toHaveLength(30);
    expect(out[0]).toEqual({ date: '2026-11-15', count: 6 });
    expect(out[1]).toEqual({ date: '2026-11-16', count: 3 });
    expect(out[29]).toEqual({ date: '2026-12-14', count: 0 });
    expect(out.reduce((a, d) => a + d.count, 0)).toBe(9);
  });
});

describe('fillDays', () => {
  it('returns consecutive days ending today, with zeros for gaps', () => {
    const out = fillDays([{ date: '2026-11-14', count: 3 }], '2026-11-15', 3);
    expect(out).toEqual([
      { date: '2026-11-13', count: 0 },
      { date: '2026-11-14', count: 3 },
      { date: '2026-11-15', count: 0 },
    ]);
    expect(fillDays([], '2026-11-15')).toHaveLength(365);
  });
});

describe('helpers', () => {
  it('shifts days across months and leap days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('validates IANA time zones', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
  it('picks a first day of the week per locale', () => {
    expect(firstDayOfWeek('en-US')).toBe(0);
    expect(firstDayOfWeek('de')).toBe(1);
    expect(firstDayOfWeek('not a locale!!')).toBe(1);
  });
});
