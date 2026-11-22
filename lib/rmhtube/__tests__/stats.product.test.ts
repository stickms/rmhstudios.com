import { describe, expect, it } from 'vitest';
import {
  STATS_CHART_DAYS,
  WATCH_DAY_RETENTION_DAYS,
  chartStartDay,
  isEmptyStats,
  isVideoWatched,
  minutesFromIntervals,
  retentionCutoffDay,
  utcDay,
  zeroFill30,
  type WatchStats,
} from '@/lib/rmhtube/stats';

describe('isVideoWatched', () => {
  it('needs half of a known duration', () => {
    expect(isVideoWatched(119, 240)).toBe(false);
    expect(isVideoWatched(120, 240)).toBe(true);
    expect(isVideoWatched(240, 240)).toBe(true);
  });
  it('needs two minutes when the duration is unknown or zero', () => {
    expect(isVideoWatched(119, null)).toBe(false);
    expect(isVideoWatched(120, null)).toBe(true);
    expect(isVideoWatched(119, 0)).toBe(false);
    expect(isVideoWatched(120, 0)).toBe(true);
  });
  it('never counts no presence', () => {
    expect(isVideoWatched(0, 10)).toBe(false);
    expect(isVideoWatched(-5, null)).toBe(false);
    expect(isVideoWatched(Number.NaN, 10)).toBe(false);
  });
});

describe('minutesFromIntervals', () => {
  const m = 60_000;
  it('floors to whole minutes', () => {
    expect(
      minutesFromIntervals([
        {
          start: 0,
          end: 90_000,
        },
      ]),
    ).toBe(1);
    expect(
      minutesFromIntervals([
        {
          start: 0,
          end: 59_999,
        },
      ]),
    ).toBe(0);
  });
  it('counts overlapping intervals once and sums disjoint ones', () => {
    expect(
      minutesFromIntervals([
        {
          start: 0,
          end: 3 * m,
        },
        {
          start: 2 * m,
          end: 4 * m,
        },
        {
          start: 10 * m,
          end: 11 * m,
        },
      ]),
    ).toBe(5);
  });
  it('ignores empty, reversed and non-finite intervals', () => {
    expect(
      minutesFromIntervals([
        {
          start: 5 * m,
          end: 5 * m,
        },
        {
          start: 9 * m,
          end: 4 * m,
        },
        {
          start: Number.NaN,
          end: 4 * m,
        },
      ]),
    ).toBe(0);
    expect(minutesFromIntervals([])).toBe(0);
  });
});

describe('zeroFill30', () => {
  const now = Date.UTC(2026, 10, 28, 23, 59, 0);
  it('returns thirty UTC days oldest first, ending today, zero where there is no row', () => {
    const out = zeroFill30(
      [
        {
          day: '2026-11-28',
          minutes: 12,
        },
        {
          day: '2026-11-01',
          minutes: 3,
        },
      ],
      now,
    );
    expect(out).toHaveLength(STATS_CHART_DAYS);
    expect(out[0]).toEqual({
      day: '2026-10-30',
      minutes: 0,
    });
    expect(out[29]).toEqual({
      day: '2026-11-28',
      minutes: 12,
    });
    expect(out.find((d) => d.day === '2026-11-01')?.minutes).toBe(3);
    expect(out.filter((d) => d.minutes === 0)).toHaveLength(28);
  });
  it('drops rows outside the window and crosses a month and year boundary', () => {
    const jan = Date.UTC(2027, 0, 5, 1, 0, 0);
    const out = zeroFill30(
      [
        {
          day: '2026-11-01',
          minutes: 99,
        },
      ],
      jan,
    );
    expect(out[0]!.day).toBe('2026-12-07');
    expect(out[29]!.day).toBe('2027-01-05');
    expect(out.every((d) => d.minutes === 0)).toBe(true);
  });
  it('uses the UTC day, not the local one', () => {
    expect(utcDay(Date.UTC(2026, 10, 28, 23, 59, 59))).toBe('2026-11-28');
    expect(utcDay(Date.UTC(2026, 10, 29, 0, 0, 0))).toBe('2026-11-29');
  });
});

describe('windows', () => {
  const now = Date.UTC(2026, 10, 28, 12, 0, 0);
  it('starts the chart 29 days back and keeps 90 days', () => {
    expect(chartStartDay(now)).toBe('2026-10-30');
    expect(retentionCutoffDay(now)).toBe('2026-08-31');
    expect(WATCH_DAY_RETENTION_DAYS).toBe(90);
  });
});

describe('isEmptyStats', () => {
  const base = (): WatchStats => ({
    counters: {
      totalWatchTimeMinutes: 0,
      videosWatched: 0,
      roomsCreated: 0,
      roomsJoined: 0,
      messagesSent: 0,
      reactionsUsed: 0,
    },
    paused: false,
    days: zeroFill30([], Date.UTC(2026, 10, 28)),
  });
  it('is true only when nothing is recorded', () => {
    expect(isEmptyStats(base())).toBe(true);
    const a = base();
    a.counters.messagesSent = 1;
    expect(isEmptyStats(a)).toBe(false);
    const b = base();
    b.days[3]!.minutes = 2;
    expect(isEmptyStats(b)).toBe(false);
  });
});
