import { parse } from 'node-html-parser';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { NormalizedCount } from '../../../engine/types';
import { loadFixture } from '../../test-support';
import { parseSchoolPage, UnexpectedPageError } from './parse-school';

const yale = loadFixture('yale.html');

function without(html: string, selectors: string[]): string {
  const root = parse(html);
  for (const s of selectors) root.querySelectorAll(s).forEach((n) => n.remove());
  return root.toString();
}

function checkCommon(page: ReturnType<typeof parseSchoolPage>, key: string) {
  expect(page.counts.length).toBeGreaterThan(0);
  for (const c of page.counts) {
    expect(c.count).toBeGreaterThan(0);
    expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.source).toBe('CYCLETRACK');
    expect(c.contributors).toBeNull();
    expect(c.schoolKey).toBe(key);
  }
}

describe('parseSchoolPage', () => {
  it('yale: reads the freshness stamp', () => {
    expect(parseSchoolPage(yale, 'Yale').sourceStamp).toBe('2026-11-20T02:16:05+00:00');
  });

  it('yale: parses MD current and previous cycle tables', () => {
    const page = parseSchoolPage(yale, 'Yale');
    const reg = page.tables.filter((t) => t.program === 'REG').map((t) => t.cycleYear);
    expect(reg).toEqual(expect.arrayContaining([2027, 2026]));
    checkCommon(page, 'Yale');
    const day = page.tables
      .find((t) => t.program === 'REG' && t.cycleYear === 2026)!
      .counts.filter((c) => c.date === '2026-02-25')
      .map((c) => [c.eventType, c.count]);
    expect(day).toEqual(
      expect.arrayContaining([
        ['REJECTION', 131],
        ['WAITLIST', 14],
        ['ACCEPTANCE', 20],
      ]),
    );
    expect(day).toHaveLength(3);
    expect(page.counts).toEqual(page.tables.flatMap((t) => t.counts));
  });

  it('yale: parses the MD-PhD tables as PHD', () => {
    const page = parseSchoolPage(yale, 'Yale');
    expect(
      page.tables
        .filter((t) => t.program === 'PHD')
        .map((t) => t.cycleYear)
        .sort(),
    ).toEqual([2026, 2027]);
    expect(page.counts.some((c) => c.program === 'PHD')).toBe(true);
  });

  it('cycle year comes from the caption, not the date', () => {
    const counts = parseSchoolPage(yale, 'Yale').counts;
    // The fixture's current cycle (2026-2027) has no December/January rows yet, so check both calendar years
    // of the previous cycle and a synthetic December row inside the current one.
    const byMonth = (re: RegExp) => counts.filter((c) => re.test(c.date));
    const decPrev = byMonth(/^2025-12/);
    const janPrev = byMonth(/^2026-01/);
    expect(decPrev.length).toBeGreaterThan(0);
    expect(janPrev.length).toBeGreaterThan(0);
    for (const c of [...decPrev, ...janPrev]) expect(c.cycleYear).toBe(2026);

    const injected = yale.replace('<th scope="row">2026-07-01</th>', '<th scope="row">2026-12-25</th>');
    const dec = parseSchoolPage(injected, 'Yale').counts.filter((c) => c.date === '2026-12-25');
    expect(dec.length).toBeGreaterThan(0);
    for (const c of dec) expect(c.cycleYear).toBe(2027);
  });

  it('DO page parses', () => {
    const page = parseSchoolPage(loadFixture('atsu-arizona.html'), 'A.T. Still - Arizona');
    expect(page.tables.length).toBeGreaterThan(0);
    checkCommon(page, 'A.T. Still - Arizona');
    const alabama = parseSchoolPage(loadFixture('alabama-com.html'), 'Alabama - COM');
    checkCommon(alabama, 'Alabama - COM');
  });

  it('Canadian page parses too (filtering is the registry job)', () => {
    checkCommon(parseSchoolPage(loadFixture('toronto.html'), 'Toronto'), 'Toronto');
  });

  it('page with stamp and no tables returns empty, not zero rows', () => {
    const page = parseSchoolPage(without(yale, ['details.md_info', 'details.phd_info']), 'Yale');
    expect(page.sourceStamp).toBe('2026-11-20T02:16:05+00:00');
    expect(page.tables).toEqual([]);
    expect(page.counts).toEqual([]);
  });

  it('only a MD page returns no PHD table for a school without one', () => {
    const page = parseSchoolPage(without(yale, ['details.phd_info']), 'Yale');
    expect(page.tables.every((t) => t.program === 'REG')).toBe(true);
  });

  it('challenge page throws UnexpectedPageError', () => {
    for (const html of [
      '<html><title>Just a moment...</title></html>',
      '',
      without(yale, ['details.md_info', 'details.phd_info', 'time[data-update-full]']),
    ]) {
      expect(() => parseSchoolPage(html, 'Yale')).toThrow(UnexpectedPageError);
    }
  });

  it('malformed cell throws', () => {
    expect(() => parseSchoolPage(yale.replace('<td>131</td>', '<td>x</td>'), 'Yale')).toThrow(UnexpectedPageError);
    expect(() => parseSchoolPage(yale.replace('<td>131</td>', '<td>-1</td>'), 'Yale')).toThrow(UnexpectedPageError);
    expect(() =>
      parseSchoolPage(yale.replace('<th scope="row">2026-02-25</th>', '<th scope="row">Feb 25</th>'), 'Yale'),
    ).toThrow(UnexpectedPageError);
  });

  it('bad headers throw', () => {
    const hdr = '<th scope="col">Date</th><th scope="col">Secondary</th>';
    expect(yale).toContain(hdr);
    expect(() =>
      parseSchoolPage(yale.replace(hdr, '<th scope="col">Day</th><th scope="col">Secondary</th>'), 'Yale'),
    ).toThrow(UnexpectedPageError);
    expect(() =>
      parseSchoolPage(yale.replace(hdr, '<th scope="col">Date</th><th scope="col">Offer</th>'), 'Yale'),
    ).toThrow(UnexpectedPageError);
  });

  it('adapter boundary: counts are NormalizedCount', () => {
    expectTypeOf<ReturnType<typeof parseSchoolPage>['counts'][number]>().toEqualTypeOf<NormalizedCount>();
  });
});
