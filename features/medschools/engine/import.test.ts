import { describe, expect, it } from 'vitest';
import { cycleOfDate, importKindOf, inferCycle, inferYear, programOf, rawSupportsDate } from './import';

const NOW = new Date('2027-03-01T00:00:00Z');

describe('importKindOf', () => {
  it('reads the declared type and the name together', () => {
    const X = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    expect(importKindOf(X, 'a.xlsx')).toBe('xlsx');
    expect(importKindOf('application/pdf', 'A.PDF')).toBe('pdf');
    expect(importKindOf('text/csv; charset=utf-8', 'a.csv')).toBe('csv');
    expect(importKindOf('text/plain', 'a.txt')).toBe('txt');
    // no type or a generic one: the extension decides
    expect(importKindOf('', 'a.csv')).toBe('csv');
    expect(importKindOf('application/octet-stream', 'a.docx')).toBe('docx');
    // Windows' CSV type is a CSV only when named one
    expect(importKindOf('application/vnd.ms-excel', 'a.csv')).toBe('csv');
    expect(importKindOf('application/vnd.ms-excel', 'a.xls')).toBeNull();
  });
  it('refuses what is not ours, and a type that contradicts its name', () => {
    expect(importKindOf('image/png', 'a.png')).toBeNull();
    expect(importKindOf('', 'a.exe')).toBeNull();
    expect(importKindOf('', 'noextension')).toBeNull();
    expect(importKindOf('application/pdf', 'a.csv')).toBeNull();
    expect(importKindOf('text/html', 'a.txt')).toBeNull();
  });
});

describe('rawSupportsDate', () => {
  const d = (y: number, m: number, day: number) => ({ y, m, d: day });
  it('needs both the month and the day in the quote', () => {
    expect(rawSupportsDate('2026-07-15', d(2026, 7, 15))).toEqual({ yearWritten: true, ambiguous: false });
    // A year-first date is never ambiguous, even when its month and day could swap.
    expect(rawSupportsDate('2026-10-09', d(2026, 10, 9))).toEqual({ yearWritten: true, ambiguous: false });
    expect(rawSupportsDate('July 15th', d(2026, 7, 15))).toEqual({ yearWritten: false, ambiguous: false });
    expect(rawSupportsDate('15 Jul 2026', d(2026, 7, 15))?.yearWritten).toBe(true);
    expect(rawSupportsDate('Sept 3', d(2026, 9, 3))).not.toBeNull();
    expect(rawSupportsDate('7/15/26', d(2026, 7, 15))).toEqual({ yearWritten: true, ambiguous: false });
    expect(rawSupportsDate('Submitted', d(2026, 7, 15))).toBeNull();
    expect(rawSupportsDate('July', d(2026, 7, 15))).toBeNull();
    expect(rawSupportsDate('15', d(2026, 7, 15))).toBeNull();
    expect(rawSupportsDate('Aug 15', d(2026, 7, 15))).toBeNull();
    // one number cannot be both the month and the day
    expect(rawSupportsDate('5', d(2026, 5, 5))).toBeNull();
    expect(rawSupportsDate('5/5', d(2026, 5, 5))?.ambiguous).toBe(false);
  });
  it('flags a numeric date that reads two ways', () => {
    expect(rawSupportsDate('03/04/2026', d(2026, 3, 4))?.ambiguous).toBe(true);
    expect(rawSupportsDate('03/04/2026', d(2026, 4, 3))?.ambiguous).toBe(true);
    expect(rawSupportsDate('03/14/2026', d(2026, 3, 14))?.ambiguous).toBe(false);
  });
  it('a swapped month and day is not the date', () => {
    // Year first reads one way: 2026-10-09 is October 9, never September 10.
    expect(rawSupportsDate('2026-10-09', d(2026, 9, 10))).toBeNull();
    expect(rawSupportsDate('2026-10-09', d(2026, 10, 9))).not.toBeNull();
    expect(rawSupportsDate('Oct 9', d(2026, 9, 10))).toBeNull();
    expect(rawSupportsDate('9 October', d(2026, 9, 10))).toBeNull();
  });
  it('unrelated numbers are not a date', () => {
    expect(rawSupportsDate('Duke | 3 | 12 interviews', d(2026, 3, 12))).toBeNull();
    expect(rawSupportsDate('12 interviews, 3 offers', d(2026, 3, 12))).toBeNull();
    expect(rawSupportsDate('Rank 7 of 20', d(2026, 7, 20))).toBeNull();
    expect(rawSupportsDate('3.5 GPA 12', d(2026, 3, 12))).toBeNull();
  });
  it('reads the formats in the wild', () => {
    expect(rawSupportsDate('Oct 9', d(2026, 10, 9))).toEqual({ yearWritten: false, ambiguous: false });
    expect(rawSupportsDate('October 9th, 2026', d(2026, 10, 9))).toEqual({ yearWritten: true, ambiguous: false });
    expect(rawSupportsDate('9 October', d(2026, 10, 9))).toEqual({ yearWritten: false, ambiguous: false });
    expect(rawSupportsDate('9th of October 2026', d(2026, 10, 9))?.yearWritten).toBe(true);
    expect(rawSupportsDate('Sept. 14 2026', d(2026, 9, 14))).toEqual({ yearWritten: true, ambiguous: false });
    expect(rawSupportsDate('Interview 10 Oct', d(2026, 10, 10))).not.toBeNull();
    expect(rawSupportsDate('10/9/2026', d(2026, 10, 9))).toEqual({ yearWritten: true, ambiguous: true });
    expect(rawSupportsDate('10/9', d(2026, 9, 10))).toEqual({ yearWritten: false, ambiguous: true }); // D/M reading
    expect(rawSupportsDate('14/9/2026', d(2026, 9, 14))).toEqual({ yearWritten: true, ambiguous: false });
    expect(rawSupportsDate('7-20', d(2026, 7, 20))?.yearWritten).toBe(false);
    expect(rawSupportsDate('7/20/2025', d(2026, 7, 20))).toBeNull();
    expect(rawSupportsDate('Sent on 2026-10-09 (secondary 7/20)', d(2026, 7, 20))).not.toBeNull();
  });
  it('a year the quote writes must be the date\'s', () => {
    expect(rawSupportsDate('2025-07-15', d(2026, 7, 15))).toBeNull();
  });
});

describe('cycles', () => {
  it('cycleOfDate follows the cycleYearOf rules, with May belonging to the next cycle for the application', () => {
    expect(cycleOfDate('SECONDARY', 2026, 7, 20)).toBe(2027);
    expect(cycleOfDate('SUBMITTED', 2026, 5, 30)).toBe(2027);
    expect(cycleOfDate('INTERVIEW', 2026, 10, 5)).toBe(2027);
    expect(cycleOfDate('INTERVIEW', 2027, 1, 5)).toBe(2027);
    expect(cycleOfDate('REJECTION', 2027, 7, 30)).toBe(2027);
    expect(cycleOfDate('ACCEPTANCE', 2027, 9, 2)).toBe(2028);
  });
  it('inferYear picks the year of the cycle, or none for a date nowhere near it', () => {
    expect(inferYear('SUBMITTED', 6, 12, 2027, NOW)).toBe(2026);
    expect(inferYear('INTERVIEW', 1, 20, 2027, NOW)).toBe(2027);
    expect(inferYear('ACCEPTANCE', 12, 15, 2027, NOW)).toBe(2026);
    expect(inferYear('SUBMITTED', 2, 30, 2027, NOW)).toBeNull();
    expect(inferYear('SUBMITTED', 6, 12, 2027, new Date('2026-01-01'))).toBe(2026);
  });
  it('inferCycle: the majority of the dated milestones, then the hint, then the current cycle', () => {
    const dated = (y: number) => ({ type: 'SECONDARY' as const, y, m: 7, d: 1 });
    expect(inferCycle([dated(2026), dated(2026), dated(2025)], null, NOW)).toEqual({ cycleYear: 2027, from: 'dates' });
    expect(inferCycle([dated(2026), dated(2025)], null, NOW).cycleYear).toBe(2027); // a tie goes to the later
    expect(inferCycle([], 2026, NOW)).toEqual({ cycleYear: 2026, from: 'hint' });
    expect(inferCycle([], 1999, NOW)).toEqual({ cycleYear: 2027, from: 'default' });
  });
});

describe('programOf', () => {
  it('reads MD, DO and the PhD pairs', () => {
    for (const p of ['MD', 'DO', '', 'md']) expect(programOf(p)).toBe('REG');
    for (const p of ['MD-PhD', 'MD/PhD', 'DO-PhD', 'do phd', 'MSTP', 'M.D.-Ph.D.']) expect(programOf(p)).toBe('PHD');
  });
});
