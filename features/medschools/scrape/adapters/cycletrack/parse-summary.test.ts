import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test-support';
import { parseSchoolPage, UnexpectedPageError } from './parse-school';
import { parseSummaryJson } from './parse-summary';

const yalePhdJson = JSON.parse(loadFixture('yale-summary-phd.json')) as unknown;

const yaleJson = JSON.parse(loadFixture('yale-summary.json')) as unknown;

describe('parseSummaryJson', () => {
  it('matches the school page daily table for the same cycle', () => {
    const [table, ...rest] = parseSummaryJson(yaleJson, 'reg');
    expect(rest).toEqual([]);
    expect(table).toMatchObject({
      program: 'REG',
      cycleYear: 2027,
    });
    const page = parseSchoolPage(loadFixture('yale.html'), 'Yale');
    const html = page.tables.find((t) => t.program === 'REG' && t.cycleYear === 2027)!;
    expect(table!.counts).toEqual(html.counts);
  });

  it('unavailable data is no table, not zero', () => {
    expect(
      parseSummaryJson(
        {
          ...(yaleJson as object),
          availability: 'unavailable',
          daily: [],
        },
        'reg',
      ),
    ).toEqual([]);
  });

  it('wrong shape or negative count throws', () => {
    expect(() => parseSummaryJson({}, 'reg')).toThrow(UnexpectedPageError);
    expect(() => parseSummaryJson(null, 'reg')).toThrow(UnexpectedPageError);
    const bad = JSON.parse(JSON.stringify(yaleJson)) as {
      daily: {
        observationCounts: Record<string, number>;
      }[];
    };
    bad.daily[0]!.observationCounts.Secondary = -1;
    expect(() => parseSummaryJson(bad, 'reg')).toThrow(UnexpectedPageError);
  });
  it('maps the requested program exactly: reg to REG, phd to PHD, any case', () => {
    expect(parseSummaryJson(yaleJson, 'REG')[0]!.program).toBe('REG');
    const phd = parseSummaryJson(yalePhdJson, 'phd')[0]!;
    expect(phd.program).toBe('PHD');
    expect(phd.counts.length).toBeGreaterThan(0);
    expect(phd.counts.every((c) => c.program === 'PHD')).toBe(true);
  });

  it('a PhD-labelled payload requested as reg throws, and a regular payload requested as phd throws', () => {
    expect(() => parseSummaryJson(yalePhdJson, 'reg')).toThrow(UnexpectedPageError);
    expect(() => parseSummaryJson(yaleJson, 'phd')).toThrow(UnexpectedPageError);
  });

  it('any other program value throws UnexpectedPageError', () => {
    for (const bad of ['MD', 'regular', 'phd2', 'xphd', '']) {
      expect(() => parseSummaryJson(yaleJson, bad)).toThrow(UnexpectedPageError);
    }
  });

  it('emits the normalized school key', () => {
    const json = {
      ...(yaleJson as object),
      school: {
        key: 'Texas A&amp;M',
        name: 'x',
      },
    };
    const [table] = parseSummaryJson(json, 'reg');
    expect(table!.counts.length).toBeGreaterThan(0);
    expect(new Set(table!.counts.map((c) => c.schoolKey))).toEqual(new Set(['Texas A&M']));
  });
  it('real Arkansas payloads: a reg table when data exists, no table (not an error) when unavailable with daily null', () => {
    const reg = parseSummaryJson(JSON.parse(loadFixture('arkansas-summary-reg.json')), 'reg');
    expect(reg).toHaveLength(1);
    expect(reg[0]!.program).toBe('REG');
    expect(reg[0]!.counts.length).toBeGreaterThan(0);
    expect(parseSummaryJson(JSON.parse(loadFixture('arkansas-summary-phd-unavailable.json')), 'phd')).toEqual([]);
  });

  it('unavailable with daily absent or an object is also no table; available with a non-array daily still throws', () => {
    const base = JSON.parse(loadFixture('arkansas-summary-phd-unavailable.json')) as Record<string, unknown>;
    const { daily: _omit, ...noDaily } = base;
    expect(parseSummaryJson(noDaily, 'phd')).toEqual([]);
    expect(
      parseSummaryJson(
        {
          ...base,
          daily: {},
        },
        'phd',
      ),
    ).toEqual([]);
    expect(() =>
      parseSummaryJson(
        {
          ...(yaleJson as object),
          daily: null,
        },
        'reg',
      ),
    ).toThrow(UnexpectedPageError);
    expect(() =>
      parseSummaryJson(
        {
          ...(yaleJson as object),
          daily: {},
        },
        'reg',
      ),
    ).toThrow(UnexpectedPageError);
  });
});
