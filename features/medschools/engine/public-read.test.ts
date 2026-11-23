process.env.TZ = 'America/Los_Angeles';
import { describe, it, expect } from 'vitest';
import {
  PRIMARY_ORDER,
  CHARTED_TYPES,
  K_FLOOR,
  SOURCE_NAMES,
  SCHOOL_TABS,
  pickPrimary,
  applyKFloor,
  publicCell,
  floorSplit,
  buildTypeSeries,
  resolveCycleYear,
  toCumulativeByDay,
  overlaySource,
  filterSchools,
  encodeLiveCursor,
  decodeLiveCursor,
  mergeLiveHead,
  truncateToMinute,
  formatUtcDay,
  type CountCell,
} from './public-read';

const cell = (
  source: CountCell['source'],
  date: string,
  count: number,
  contributors: number | null = null,
): CountCell => ({
  source,
  date,
  count,
  contributors,
});

describe('constants', () => {
  it('orders sources and types', () => {
    expect(PRIMARY_ORDER).toEqual(['CYCLETRACK', 'ADMIT', 'SDN', 'RMH', 'MDAPPLICANTS']);
    expect(CHARTED_TYPES).toEqual(['INTERVIEW', 'SECONDARY', 'WAITLIST', 'REJECTION', 'ACCEPTANCE']);
    expect(K_FLOOR).toBe(3);
    expect(SOURCE_NAMES.ADMIT).toBe('Admit.org');
    expect(SOURCE_NAMES.SDN).toBe('Student Doctor Network');
    expect(SCHOOL_TABS).toEqual(['activity', 'history', 'forecast', 'interviews']);
  });
});

describe('pickPrimary', () => {
  it('follows PRIMARY_ORDER', () => {
    expect(pickPrimary(['SDN', 'ADMIT'])).toBe('ADMIT');
    expect(pickPrimary(['RMH', 'SDN'])).toBe('SDN');
    expect(pickPrimary([])).toBeNull();
  });
});

describe('applyKFloor holds back today (Q2)', () => {
  const rows = [
    cell('RMH', '2026-11-19', 4, 4),
    cell('RMH', '2026-11-20', 4, 4),
    cell('RMH', '2026-11-21', 4, 4),
    cell('CYCLETRACK', '2026-11-20', 4, null),
  ];
  it('drops RMH rows dated today or later, whatever the count', () => {
    expect(applyKFloor(rows, '2026-11-20').map((r) => `${r.source}${r.date}`)).toEqual([
      'RMH2026-11-19',
      'CYCLETRACK2026-11-20',
    ]);
    expect(applyKFloor(rows, '2026-11-22').filter((r) => r.source === 'RMH')).toHaveLength(3);
  });
  it('a held-back RMH day can never be primary or appear', () => {
    const s = buildTypeSeries([cell('RMH', '2026-11-20', 9, 9)], '2026-11-20');
    expect(s).toEqual({ primary: null, sources: [] });
  });
  it('with no day given it uses the clock: a row dated far in the future is held back', () => {
    expect(applyKFloor([cell('RMH', '2999-01-01', 9, 9)])).toEqual([]);
  });
});

describe('applyKFloor', () => {
  it('drops RMH rows under 3 contributors, fails closed on null', () => {
    const rows = [
      cell('RMH', '2026-11-01', 1, null),
      cell('RMH', '2026-11-02', 1, 2),
      cell('RMH', '2026-11-03', 1, 3),
      cell('CYCLETRACK', '2026-11-01', 4, null),
      cell('ADMIT', '2026-11-01', 4, null),
    ];
    expect(applyKFloor(rows).map((r) => `${r.source}${r.date}`)).toEqual([
      'RMH2026-11-03',
      'CYCLETRACK2026-11-01',
      'ADMIT2026-11-01',
    ]);
  });
});

describe('floorSplit', () => {
  it('needs both sides at the floor', () => {
    expect(floorSplit(2, 10)).toBeNull();
    expect(floorSplit(null, 5)).toBeNull();
    expect(floorSplit(5, null)).toBeNull();
    expect(floorSplit(3, 3)).toEqual({ inState: 3, outOfState: 3 });
  });
});

describe('buildTypeSeries', () => {
  it('never lets a suppressed RMH source be primary or appear', () => {
    const s = buildTypeSeries([cell('RMH', '2026-11-01', 9, 2), cell('ADMIT', '2026-11-01', 1)]);
    expect(s.primary).toBe('ADMIT');
    expect(s.sources.map((x) => x.source)).toEqual(['ADMIT']);
  });
  it('keeps sources separate, ordered, ascending, never summed', () => {
    const s = buildTypeSeries([
      cell('SDN', '2026-11-02', 2),
      cell('ADMIT', '2026-11-03', 2),
      cell('ADMIT', '2026-11-01', 3),
    ]);
    expect(s.primary).toBe('ADMIT');
    expect(s.sources.map((x) => [x.source, x.total])).toEqual([
      ['ADMIT', 5],
      ['SDN', 2],
    ]);
    expect(s.sources[0]?.days.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-03']);
  });
  it('is empty with no rows', () => {
    expect(buildTypeSeries([])).toEqual({ primary: null, sources: [] });
  });
});

describe('resolveCycleYear', () => {
  it('uses the latest cycle with data, capped at the June rollover', () => {
    expect(resolveCycleYear({ latestWithData: 2027, now: new Date('2027-06-02T00:00:00Z') })).toBe(2027);
    expect(resolveCycleYear({ latestWithData: 2028, now: new Date('2027-06-02T00:00:00Z') })).toBe(2028);
    expect(resolveCycleYear({ latestWithData: null, now: new Date('2027-06-02T00:00:00Z') })).toBe(2028);
    expect(resolveCycleYear({ latestWithData: null, now: new Date('2027-05-31T00:00:00Z') })).toBe(2027);
    expect(resolveCycleYear({ latestWithData: 2029, now: new Date('2027-05-31T00:00:00Z') })).toBe(2027);
    expect(resolveCycleYear({ requested: 2025, latestWithData: 2027, now: new Date('2027-06-02T00:00:00Z') })).toBe(
      2025,
    );
  });
});

describe('toCumulativeByDay', () => {
  it('accumulates by day of cycle', () => {
    expect(
      toCumulativeByDay(
        [
          { date: '2026-06-01', count: 2 },
          { date: '2026-06-03', count: 1 },
        ],
        '2026-06-01',
      ),
    ).toEqual([
      { day: 0, cumulative: 2 },
      { day: 2, cumulative: 3 },
    ]);
  });
});

describe('overlaySource', () => {
  it('picks the best source spanning the newest and an earlier cycle', () => {
    expect(
      overlaySource([
        { cycleYear: 2027, sources: ['ADMIT', 'CYCLETRACK'] },
        { cycleYear: 2026, sources: ['CYCLETRACK'] },
      ]),
    ).toBe('CYCLETRACK');
    expect(overlaySource([{ cycleYear: 2027, sources: ['ADMIT'] }])).toBe('ADMIT');
    expect(overlaySource([])).toBeNull();
  });
});

describe('filterSchools', () => {
  const schools = [
    { name: 'Duke University School of Medicine', shortName: 'Duke', state: 'NC', degree: 'MD' },
    { name: 'UT Southwestern', shortName: 'UTSW', state: 'TX', degree: 'MD' },
    { name: 'UNT Texas College of Osteopathic', shortName: 'TCOM', state: 'TX', degree: 'DO' },
  ];
  it('matches name and shortName case-insensitively', () => {
    expect(filterSchools(schools, { q: ' duke ' })).toHaveLength(1);
    expect(filterSchools(schools, { q: 'utsw' })).toHaveLength(1);
  });
  it('treats regex characters literally', () => {
    expect(filterSchools(schools, { q: '([' })).toEqual([]);
  });
  it('combines with AND', () => {
    expect(filterSchools(schools, { degree: 'DO', state: 'TX' }).map((s) => s.shortName)).toEqual(['TCOM']);
    expect(filterSchools(schools, { degree: 'DO', state: 'NC' })).toEqual([]);
  });
});

describe('live cursor', () => {
  it('round-trips to the millisecond', () => {
    const c = { occurredAt: new Date('2026-11-20T10:15:42.123Z'), id: 'ckabc123' };
    const back = decodeLiveCursor(encodeLiveCursor(c));
    expect(back?.id).toBe('ckabc123');
    expect(back?.occurredAt.getTime()).toBe(c.occurredAt.getTime());
  });
  it('rejects garbage', () => {
    expect(decodeLiveCursor('%%%')).toBeNull();
    expect(decodeLiveCursor('')).toBeNull();
    expect(decodeLiveCursor(Buffer.from('nope').toString('base64url'))).toBeNull();
  });
});

describe('mergeLiveHead', () => {
  const r = (id: string) => ({ id });
  it('prepends new rows and reports arrivals', () => {
    const m = mergeLiveHead([r('c'), r('b'), r('a')], [r('d'), r('c'), r('b')]);
    expect(m.rows.map((x) => x.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(m.arrived).toEqual(['d']);
    expect(m.gap).toBe(false);
  });
  it('detects a gap when the head shares no row with the previous rows, and replaces them', () => {
    const m = mergeLiveHead([r('c'), r('b'), r('a')], [r('z'), r('y'), r('x')]);
    expect(m.gap).toBe(true);
    expect(m.rows.map((x) => x.id)).toEqual(['z', 'y', 'x']);
    expect(m.arrived).toEqual(['z', 'y', 'x']);
  });
  it('an empty head is not a gap', () => {
    const m = mergeLiveHead([r('b'), r('a')], []);
    expect(m.gap).toBe(false);
    expect(m.rows.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('treats the first batch as a baseline', () => {
    const m = mergeLiveHead([], [r('b'), r('a')]);
    expect(m.rows.map((x) => x.id)).toEqual(['b', 'a']);
    expect(m.arrived).toEqual([]);
    expect(m.gap).toBe(false);
  });
});

describe('dates', () => {
  it('truncateToMinute', () => {
    expect(truncateToMinute(new Date('2026-11-20T10:15:42.123Z'))).toBe('2026-11-20T10:15:00.000Z');
  });
  it('formatUtcDay ignores the viewer zone', () => {
    const s = formatUtcDay('2026-11-20', 'en-US');
    expect(s).toContain('Nov');
    expect(s).toContain('20');
  });
});

describe('publicCell (the daily snapshot is the only RMH figure the public sees)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    source: 'RMH' as const,
    date: '2026-11-10',
    eventType: 'INTERVIEW' as const,
    count: 9,
    contributors: 9,
    publishedCount: 3,
    publishedContributors: 3,
    ...over,
  });

  it('swaps the live figures for the published ones and drops the published keys', () => {
    expect(publicCell(row())).toEqual({
      source: 'RMH',
      date: '2026-11-10',
      eventType: 'INTERVIEW',
      count: 3,
      contributors: 3,
    });
  });

  it('is absent when never published, whatever the live count', () => {
    expect(publicCell(row({ publishedCount: null, publishedContributors: null }))).toBeNull();
    expect(publicCell(row({ publishedCount: undefined }))).toBeNull();
  });

  it('passes other sources through untouched by their (null) published columns', () => {
    expect(publicCell(row({ source: 'ADMIT', count: 5, contributors: null, publishedCount: null }))).toMatchObject({
      source: 'ADMIT',
      count: 5,
      contributors: null,
    });
  });

  it('then the floor applies to the published contributors', () => {
    const cells = [row({ publishedContributors: 2 }), row({ date: '2026-11-11' })].flatMap((r) => publicCell(r) ?? []);
    expect(applyKFloor(cells, '2026-11-20').map((c) => c.date)).toEqual(['2026-11-11']);
  });
});
