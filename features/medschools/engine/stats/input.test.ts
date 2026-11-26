import { describe, expect, it } from 'vitest';
import type { StoredCountRow } from '../public-read';
import { primarySeriesOf, seriesBySource, seriesOfSource, toDayCounts } from './input';

const TODAY = '2026-11-23';
const row = (o: Partial<StoredCountRow> & Pick<StoredCountRow, 'source' | 'date'>): StoredCountRow => ({
  eventType: 'INTERVIEW',
  count: 1,
  contributors: null,
  ...o,
});

describe('primarySeriesOf', () => {
  const rmhOnly: StoredCountRow[] = [
    row({ source: 'RMH', date: '2026-11-10', count: 9, contributors: 9, publishedCount: 2, publishedContributors: 2 }),
    row({
      source: 'RMH',
      date: '2026-11-11',
      count: 9,
      contributors: 9,
      publishedCount: null,
      publishedContributors: null,
    }),
    row({ source: 'RMH', date: TODAY, count: 9, contributors: 9, publishedCount: 5, publishedContributors: 5 }),
  ];
  it('a suppressed, unpublished or same-day RMH figure moves nothing', () => {
    expect(primarySeriesOf(rmhOnly, TODAY)).toBeNull();
  });
  it('a published cell at k = 3 dated before today is the primary, by its published count', () => {
    const rows = [
      ...rmhOnly,
      row({
        source: 'RMH',
        date: '2026-11-22',
        count: 99,
        contributors: 99,
        publishedCount: 4,
        publishedContributors: 3,
      }),
    ];
    expect(primarySeriesOf(rows, TODAY)).toEqual({ source: 'RMH', days: [{ date: '2026-11-22', count: 4 }] });
  });
  it('picks the first source in PRIMARY_ORDER and never adds another', () => {
    const rows = [
      row({ source: 'RMH', date: '2026-11-01', publishedCount: 4, publishedContributors: 4 }),
      row({ source: 'CYCLETRACK', date: '2026-11-01', count: 7 }),
      row({ source: 'ADMIT', date: '2026-11-01', count: 2 }),
    ];
    expect(primarySeriesOf(rows, TODAY)).toEqual({ source: 'CYCLETRACK', days: [{ date: '2026-11-01', count: 7 }] });
  });
  it('is null for no rows', () => expect(primarySeriesOf([], TODAY)).toBeNull());
});

describe('seriesBySource', () => {
  it('lists CycleTrack and Admit separately and never adds them', () => {
    const rows = [
      row({ source: 'ADMIT', date: '2026-11-01', count: 5 }),
      row({ source: 'CYCLETRACK', date: '2026-11-01', count: 3 }),
    ];
    expect(seriesBySource(rows, TODAY)).toEqual([
      { source: 'CYCLETRACK', days: [{ date: '2026-11-01', count: 3 }] },
      { source: 'ADMIT', days: [{ date: '2026-11-01', count: 5 }] },
    ]);
  });
  it('drops a suppressed RMH source (k floor)', () => {
    const rows = [
      row({
        source: 'RMH',
        date: '2026-11-01',
        count: 9,
        contributors: 2,
        publishedCount: 9,
        publishedContributors: 2,
      }),
      row({ source: 'ADMIT', date: '2026-11-01', count: 5 }),
    ];
    expect(seriesBySource(rows, TODAY).map((s) => s.source)).toEqual(['ADMIT']);
  });
  it('is empty for no rows', () => expect(seriesBySource([], TODAY)).toEqual([]));
});

describe('primarySeriesOf with a preferred source', () => {
  const both = [
    row({ source: 'CYCLETRACK', date: '2026-11-01', count: 7 }),
    row({ source: 'ADMIT', date: '2026-11-01', count: 2 }),
  ];
  it('prefers the chosen source and falls back when it has none', () => {
    expect(primarySeriesOf(both, TODAY, 'ADMIT')?.source).toBe('ADMIT');
    expect(primarySeriesOf([both[0]!], TODAY, 'ADMIT')?.source).toBe('CYCLETRACK');
  });
});

describe('seriesOfSource', () => {
  it('returns one source only; an RMH row is its published count', () => {
    const rows = [
      row({ source: 'ADMIT', date: '2026-10-01', count: 3 }),
      row({ source: 'CYCLETRACK', date: '2026-10-01', count: 8 }),
      row({
        source: 'RMH',
        date: '2026-10-01',
        count: 50,
        contributors: 50,
        publishedCount: 6,
        publishedContributors: 5,
      }),
    ];
    expect(seriesOfSource(rows, TODAY, 'ADMIT')).toEqual([{ date: '2026-10-01', count: 3 }]);
    expect(seriesOfSource(rows, TODAY, 'RMH')).toEqual([{ date: '2026-10-01', count: 6 }]);
    expect(seriesOfSource(rows, TODAY, 'SDN')).toEqual([]);
  });
});

describe('toDayCounts', () => {
  it('maps dates to days since day zero and drops nothing', () => {
    expect(
      toDayCounts(
        [
          { date: '2026-06-01', count: 1 },
          { date: '2026-06-03', count: 4 },
        ],
        '2026-06-01',
      ),
    ).toEqual([
      { day: 0, count: 1 },
      { day: 2, count: 4 },
    ]);
  });
});
