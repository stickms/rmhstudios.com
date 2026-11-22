import { describe, expect, it } from 'vitest';
import { wallToUtcMs } from '@/lib/calendar/tz';
import {
  HEATMAP_DAYS,
  MAX_DURATION_MS,
  clampDurationMs,
  clampScore,
  goalMetDays,
  heatDays,
  toPracticeDay,
  weekBounds,
  weekDays,
  weekFrom,
  weekMinutes,
  type PracticeDay,
} from '@/lib/rmhmusic/history';

const day = (date: string, minutes: number, count: number): PracticeDay => ({
  date,
  minutes,
  count,
});

describe('clampDurationMs', () => {
  it('keeps a whole number of ms in 0 to two hours', () => {
    expect(clampDurationMs(90_000)).toBe(90_000);
    expect(clampDurationMs(1234.6)).toBe(1235);
    expect(clampDurationMs(0)).toBe(0);
    expect(clampDurationMs(-5)).toBe(0);
    expect(clampDurationMs(MAX_DURATION_MS + 1)).toBe(MAX_DURATION_MS);
    expect(MAX_DURATION_MS).toBe(7_200_000);
  });
  it('is null when the client sent nothing usable', () => {
    for (const v of [undefined, null, Number.NaN, Infinity, '90' as unknown as number])
      expect(clampDurationMs(v)).toBeNull();
  });
});

describe('clampScore', () => {
  it('keeps a whole number in 0 to 100 and null for none', () => {
    expect(clampScore(72.4)).toBe(72);
    expect(clampScore(140)).toBe(100);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(undefined)).toBeNull();
    expect(clampScore(null)).toBeNull();
    expect(clampScore(Number.NaN)).toBeNull();
  });
});

describe('weekBounds', () => {
  const at = (day: string, tz: string, hour = 12) => {
    const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
    return wallToUtcMs({ y, mo, d, h: hour, mi: 0 }, tz);
  };

  it('starts on the given first day and spans seven calendar days', () => {
    // 2026-11-18 is a Wednesday.
    const monday = weekBounds(at('2026-11-18', 'UTC'), 'UTC', 1);
    expect(monday.start).toBe('2026-11-16');
    expect(monday.end).toBe('2026-11-22');
    expect(monday.days).toHaveLength(7);
    const sunday = weekBounds(at('2026-11-18', 'UTC'), 'UTC', 0);
    expect(sunday.start).toBe('2026-11-15');
    expect(sunday.end).toBe('2026-11-21');
  });

  it('is still seven days when daylight saving ends inside the week', () => {
    // New York fell back on Sunday 2026-11-01: that Sunday-start week has 25 hours.
    const week = weekBounds(at('2026-11-03', 'America/New_York'), 'America/New_York', 0);
    expect(week.days).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
  });

  it('is still seven days when daylight saving starts inside the week', () => {
    // New York sprang forward on Sunday 2026-03-08.
    const week = weekBounds(at('2026-03-10', 'America/New_York'), 'America/New_York', 1);
    expect(week.start).toBe('2026-03-09');
    const before = weekBounds(at('2026-03-07', 'America/New_York'), 'America/New_York', 1);
    expect(before.start).toBe('2026-03-02');
    expect(before.end).toBe('2026-03-08');
    expect(before.days).toHaveLength(7);
  });

  it('puts a late evening in the member’s own day, not UTC’s', () => {
    // 23:30 Monday in Los Angeles is already Tuesday in UTC; the week is the one holding Monday.
    const week = weekBounds(at('2026-11-16', 'America/Los_Angeles', 23), 'America/Los_Angeles', 1);
    expect(week.start).toBe('2026-11-16');
  });

  it('weekFrom builds the same seven days from a start', () => {
    expect(weekFrom('2026-12-28').days.at(-1)).toBe('2027-01-03');
  });
});

describe('toPracticeDay and weekMinutes', () => {
  it('rounds the summed ms to whole minutes', () => {
    expect(toPracticeDay({ date: '2026-11-23', count: 2, ms: 150_000 })).toEqual(day('2026-11-23', 3, 2));
    expect(toPracticeDay({ date: '2026-11-23', count: 1, ms: 0 })).toEqual(day('2026-11-23', 0, 1));
  });
  it('sums only the days inside the week', () => {
    const days = [
      day('2026-11-15', 99, 1),
      day('2026-11-16', 10, 1),
      day('2026-11-22', 5, 2),
      day('2026-11-23', 99, 1),
    ];
    expect(weekMinutes(days, weekFrom('2026-11-16'))).toBe(15);
  });
});

describe('goalMetDays', () => {
  const week = weekFrom('2026-11-16');
  const days = [
    day('2026-11-16', 5, 2),
    day('2026-11-17', 0, 3),
    day('2026-11-18', 20, 1),
    day('2026-11-19', 8, 2),
    day('2026-11-21', 8, 5),
  ];

  it('counts days with at least the goal in activities, out of the days so far', () => {
    expect(goalMetDays(days, week, 2, '2026-11-20')).toEqual({ met: 3, elapsed: 5 });
  });
  it('minutes do not count toward an activity goal', () => {
    expect(goalMetDays([day('2026-11-16', 120, 1)], week, 2, '2026-11-16')).toEqual({ met: 0, elapsed: 1 });
  });
  it('a finished week counts all seven days, and a week not started counts none', () => {
    expect(goalMetDays(days, week, 1, '2026-11-30').elapsed).toBe(7);
    expect(goalMetDays(days, week, 1, '2026-11-15')).toEqual({ met: 0, elapsed: 0 });
  });
  it('treats a goal under 1 as 1, so an empty day never meets it', () => {
    expect(goalMetDays([], week, 0, '2026-11-22')).toEqual({ met: 0, elapsed: 7 });
  });
});

describe('heatDays', () => {
  it('has one entry per day ending today, empty days zero', () => {
    const out = heatDays([], '2026-11-23', HEATMAP_DAYS);
    expect(out).toHaveLength(HEATMAP_DAYS);
    expect(out.at(-1)).toEqual({ date: '2026-11-23', count: 0 });
    expect(out[0]?.date).toBe('2025-11-24');
  });
  it('shows minutes where a day has them and the activity count where it has none', () => {
    const out = heatDays([day('2026-11-21', 25, 2), day('2026-11-22', 0, 3), day('2026-11-23', 0, 0)], '2026-11-23', 4);
    expect(out).toEqual([
      { date: '2026-11-20', count: 0 },
      { date: '2026-11-21', count: 25 },
      { date: '2026-11-22', count: 3 },
      { date: '2026-11-23', count: 0 },
    ]);
  });
  it('a day of finished lessons with no duration is never blank', () => {
    const [d] = heatDays([day('2026-11-23', 0, 3)], '2026-11-23', 1);
    expect(d?.count).toBeGreaterThan(0);
  });
});

describe('weekDays', () => {
  it('lists the seven days, filling the missing ones with zero', () => {
    const out = weekDays([day('2026-11-18', 12, 2)], weekFrom('2026-11-16'));
    expect(out.map((d) => d.date)).toHaveLength(7);
    expect(out[2]).toEqual(day('2026-11-18', 12, 2));
    expect(out[0]).toEqual(day('2026-11-16', 0, 0));
  });
});
