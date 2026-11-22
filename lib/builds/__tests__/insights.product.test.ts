import { describe, expect, it } from 'vitest';
import {
  buildInsights,
  biggestDays,
  fillDays,
  parseRange,
  releaseMarkers,
  totalsOf,
  type BuildDay,
  type DayMap,
} from '@/lib/builds/insights';
import { dayKeys } from '@/lib/communities/insights';

const day = (d: string, over: Partial<BuildDay> = {}): BuildDay => ({
  day: d,
  views: 0,
  likes: 0,
  comments: 0,
  unlocks: 0,
  coins: 0,
  ...over,
});

describe('parseRange', () => {
  it('accepts 7, 30 and 90 and falls back to 30', () => {
    expect([parseRange('7'), parseRange('90'), parseRange('30')]).toEqual([7, 90, 30]);
    expect(parseRange(undefined)).toBe(30);
    expect(parseRange('28')).toBe(30);
    expect(parseRange('abc')).toBe(30);
  });
});

describe('fillDays', () => {
  it('shows days with views and zeros between them', () => {
    const keys = dayKeys(Date.parse('2026-12-10T08:00:00Z'), 7);
    const counts: DayMap = new Map([
      ['2026-12-04', { views: 2 }],
      ['2026-12-06', { views: 1, likes: 1 }],
      ['2026-12-10', { views: 5 }],
    ]);
    const days = fillDays(keys, counts);
    expect(days.map((d) => d.views)).toEqual([2, 0, 1, 0, 0, 0, 5]);
    expect(days[2]).toMatchObject({ day: '2026-12-06', likes: 1, comments: 0, unlocks: 0, coins: 0 });
  });

  it('crosses month and year ends without skipping or repeating a day', () => {
    const keys = dayKeys(Date.parse('2027-01-02T00:00:00Z'), 5);
    expect(keys).toEqual(['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    const feb = dayKeys(Date.parse('2028-03-01T23:59:59Z'), 3);
    expect(feb).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });
});

describe('period comparison', () => {
  it('has no fraction against a zero baseline, and the change is the whole value', () => {
    const t = totalsOf(
      { views: 12, likes: 0, comments: 0, unlocks: 0, coins: 0 },
      { views: 0, likes: 0, comments: 0, unlocks: 0, coins: 0 },
    );
    expect(t.views).toEqual({ value: 12, previous: 0, change: 12, fraction: null });
    expect(t.likes).toEqual({ value: 0, previous: 0, change: 0, fraction: null });
  });

  it('reports a drop as a negative change', () => {
    const t = totalsOf(
      { views: 3, likes: 0, comments: 0, unlocks: 0, coins: 0 },
      { views: 12, likes: 0, comments: 0, unlocks: 0, coins: 0 },
    );
    expect(t.views).toMatchObject({ change: -9, fraction: -0.75 });
  });

  it('sums the previous period from the days just before the range', () => {
    const now = Date.parse('2026-12-10T00:00:00Z');
    const counts: DayMap = new Map([
      ['2026-12-10', { views: 4, coins: 50 }],
      ['2026-12-04', { views: 1 }], // the first day of the range
      ['2026-12-03', { views: 2 }], // the last day of the previous 7
      ['2026-11-27', { views: 8 }], // the first day of the previous 7
      ['2026-11-26', { views: 100 }], // before the previous period: counted nowhere
    ]);
    const out = buildInsights(now, 7, { title: 'x', isCurated: false }, counts, []);
    expect(out.totals.views).toMatchObject({ value: 5, previous: 10 });
    expect(out.totals.coins.value).toBe(50);
  });
});

describe('biggestDays', () => {
  const days = [
    day('2026-12-01', { views: 5, likes: 1 }),
    day('2026-12-02', { views: 9 }),
    day('2026-12-03', { views: 5, likes: 3 }),
    day('2026-12-04', { views: 5, likes: 3 }),
    day('2026-12-05'),
    day('2026-12-06', { views: 1 }),
    day('2026-12-07', { views: 2 }),
  ];

  it('ranks by first views, then other activity, then the more recent day, at most five, no empty days', () => {
    const out = biggestDays(days, [], true);
    expect(out.map((d) => d.day)).toEqual(['2026-12-02', '2026-12-04', '2026-12-03', '2026-12-01', '2026-12-07']);
    expect(out).toHaveLength(5);
  });

  it('returns fewer than five for a quiet build', () => {
    expect(biggestDays([day('2026-12-01'), day('2026-12-02', { views: 1 })], [], true)).toHaveLength(1);
    expect(biggestDays([day('2026-12-01')], [], true)).toEqual([]);
  });

  it('ranks a build without view data by likes, comments and unlocks together', () => {
    const out = biggestDays(
      [day('2026-12-01', { likes: 1 }), day('2026-12-02', { comments: 1, unlocks: 1 }), day('2026-12-03')],
      [],
      false,
    );
    expect(out.map((d) => d.day)).toEqual(['2026-12-02', '2026-12-01']);
  });

  it('carries the releases of the day', () => {
    const out = biggestDays(
      days,
      [
        { day: '2026-12-02', version: '1.2' },
        { day: '2026-12-02', version: '1.2.1' },
      ],
      true,
    );
    expect(out[0]!.releases).toEqual(['1.2', '1.2.1']);
    expect(out[1]!.releases).toEqual([]);
  });
});

describe('releaseMarkers', () => {
  const keys = dayKeys(Date.parse('2026-12-10T00:00:00Z'), 7);
  it('marks each release on its UTC day, oldest first, ignoring days outside the range', () => {
    const out = releaseMarkers(
      [
        { version: '2.0', createdAt: '2026-12-09T23:59:59Z' },
        { version: '1.2', createdAt: '2026-12-05T00:00:00Z' },
        { version: '1.2.1', createdAt: '2026-12-05T10:00:00Z' },
        { version: '0.9', createdAt: '2026-12-03T23:59:59Z' }, // the day before the range
        { version: '3.0', createdAt: '2026-12-11T00:00:00Z' }, // tomorrow
      ],
      keys,
    );
    expect(out).toEqual([
      { day: '2026-12-05', version: '1.2' },
      { day: '2026-12-05', version: '1.2.1' },
      { day: '2026-12-09', version: '2.0' },
    ]);
  });

  it('appears on the day in the assembled answer', () => {
    const out = buildInsights(
      Date.parse('2026-12-10T12:00:00Z'),
      7,
      { title: 'x', isCurated: false },
      new Map([['2026-12-08', { views: 1 }]]),
      [{ version: '1.2', createdAt: '2026-12-08T09:00:00Z' }],
    );
    expect(out.releases).toEqual([{ day: '2026-12-08', version: '1.2' }]);
    expect(out.biggestDays[0]!.releases).toEqual(['1.2']);
    expect(out.hasViews).toBe(true);
    expect(buildInsights(0, 7, { title: 'c', isCurated: true }, new Map(), []).hasViews).toBe(false);
  });
});
