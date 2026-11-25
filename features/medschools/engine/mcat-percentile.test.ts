import { describe, expect, it } from 'vitest';
import table from '../../../data/medschools/mcat-percentiles.json';
import { MCAT_PERCENTILE_SOURCE, MCAT_TOTAL_MAX, MCAT_TOTAL_MIN, mcatPercentile, rankValue } from './mcat-percentile';

/**
 * The checked-in AAMC table (`data/medschools/mcat-percentiles.json`): its header, and that its rows are a complete,
 * never-falling table. That every value is what the PDF prints is `scripts/medschools/check-mcat-percentiles.ts`, run
 * by hand against the downloaded PDF (CI has no network and the PDF is not committed).
 */
const RANK = /^(<1|\d{1,3})$/;

function assertTable(rows: readonly { score: number; rank: string }[], min: number, max: number) {
  expect(rows.map((r) => r.score)).toEqual(Array.from({ length: max - min + 1 }, (_, i) => min + i));
  let prev = -1;
  for (const r of rows) {
    expect(r.rank).toMatch(RANK);
    const v = rankValue(r.rank)!;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
    expect(v).toBeGreaterThanOrEqual(prev);
    prev = v;
  }
  expect(rows.at(-1)?.rank).toBe('100');
}

describe('mcat-percentiles.json', () => {
  it('carries its source, period, fetch date, method and the attribution line', () => {
    expect(table.sourceUrl).toBe('https://www.aamc.org/media/89826/download');
    expect(table.pageUrl).toMatch(/^https:\/\/www\.aamc\.org\//);
    expect(table.inEffect).toBe('May 1, 2026 – April 30, 2027');
    expect(table.title).toContain(table.inEffect);
    expect(table.fetchedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(table.method).toContain('check-mcat-percentiles.ts');
    expect(table.attribution).toBe(
      `Source: AAMC, Percentile Ranks for MCAT Total and Section Scores, ${table.inEffect}`,
    );
    expect(MCAT_PERCENTILE_SOURCE.attribution).toBe(table.attribution);
  });

  it('the total table covers 472-528 with no gaps, and ranks never fall', () => {
    expect(table.total).toHaveLength(57);
    assertTable(table.total, MCAT_TOTAL_MIN, MCAT_TOTAL_MAX);
  });

  it('each section table covers 118-132 with no gaps, and ranks never fall', () => {
    expect(Object.keys(table.sections).sort()).toEqual(['BBLS', 'CARS', 'CPBS', 'PSBB']);
    for (const rows of Object.values(table.sections)) assertTable(rows, 118, 132);
  });
});

describe('mcatPercentile', () => {
  it('looks up a whole total as printed', () => {
    expect(mcatPercentile(508)).toEqual({ score: 508, rank: 74, printed: '74' });
    expect(mcatPercentile(472)).toEqual({ score: 472, rank: 0, printed: '<1' });
    expect(mcatPercentile(528)).toEqual({ score: 528, rank: 100, printed: '100' });
  });
  it('a score outside the table or not a whole number has no rank', () => {
    expect(mcatPercentile(471)).toBeNull();
    expect(mcatPercentile(529)).toBeNull();
    expect(mcatPercentile(511.5)).toBeNull();
    expect(mcatPercentile(Number.NaN)).toBeNull();
  });
  it('a rank is "<1" or a whole number', () => {
    expect(rankValue('<1')).toBe(0);
    expect(rankValue('84')).toBe(84);
    expect(rankValue('1.5')).toBeNull();
    expect(rankValue('')).toBeNull();
  });
});
