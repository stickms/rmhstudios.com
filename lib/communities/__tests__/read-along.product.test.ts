/** Read-alongs (s11-09), pure parts: the split into parts, the opening times, the thread text and the limits. */
import { describe, expect, it } from 'vitest';
import {
  LABEL_MAX,
  MAX_PARTS,
  canReadAlong,
  chaptersOf,
  composePartPost,
  firstOpeningDay,
  maxPartsFor,
  openingsAfter,
  openingsFor,
  partsProblem,
  spoilerWarning,
  splitByPages,
  splitFromToc,
  suggestedPartCount,
  type PartDraft,
} from '@/lib/communities/read-along';

const contiguous = (parts: PartDraft[], pages: number) => {
  expect(parts[0]!.startPage).toBe(1);
  expect(parts[parts.length - 1]!.endPage).toBe(pages);
  for (let i = 1; i < parts.length; i++) expect(parts[i]!.startPage).toBe(parts[i - 1]!.endPage + 1);
  for (const p of parts) expect(p.endPage).toBeGreaterThanOrEqual(p.startPage);
};

const TOC = [
  { title: 'Preface', page: 3 },
  { title: 'Chapter 1', page: 10 },
  { title: 'Chapter 2', page: 40 },
  { title: 'Chapter 3', page: 70 },
  { title: 'Chapter 4', page: 100 },
  { title: 'Chapter 5', page: 130 },
  { title: 'Chapter 6', page: 160 },
  { title: 'Epilogue', page: 190 },
];

describe('parts from a table of contents', () => {
  it('groups the chapters into the asked number of parts of roughly equal pages, contiguous over the whole book', () => {
    const parts = splitFromToc(TOC, 200, 4);
    expect(parts).toHaveLength(4);
    contiguous(parts, 200);
    // every part opens where a chapter does (the first at page 1, where the front matter starts)
    const starts = new Set([1, ...TOC.map((c) => c.page)]);
    for (const p of parts) expect(starts.has(p.startPage)).toBe(true);
    const sizes = parts.map((p) => p.endPage - p.startPage + 1);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(40);
  });

  it('labels each part with its number and the chapter it opens on, within the label limit', () => {
    const parts = splitFromToc(TOC, 200, 4);
    expect(parts[0]!.label).toBe('Part 1: Preface');
    expect(parts[1]!.label.startsWith('Part 2: ')).toBe(true);
    const long = splitFromToc(
      [{ title: 'x'.repeat(200), page: 1 }, ...TOC.map((c) => ({ ...c, page: c.page + 1 }))],
      200,
      3,
    );
    for (const p of long) expect([...p.label].length).toBeLessThanOrEqual(LABEL_MAX);
    // the translated word replaces "Part"
    expect(splitFromToc(TOC, 200, 2, 'Teil')[0]!.label.startsWith('Teil 1')).toBe(true);
  });

  it('uses fewer parts when the book has fewer chapters than asked', () => {
    const parts = splitFromToc(TOC.slice(0, 3), 200, 8);
    expect(parts).toHaveLength(3);
    contiguous(parts, 200);
  });

  it('takes the outermost level of a nested outline, in page order, and ignores entries outside the book', () => {
    const chapters = chaptersOf(
      [
        { title: 'B', page: 50, depth: 0 },
        { title: 'B.1', page: 60, depth: 1 },
        { title: 'A', page: 5, depth: 0 },
        { title: 'Same page', page: 50, depth: 0 },
        { title: 'Past the end', page: 999, depth: 0 },
        { title: '  ', page: 20, depth: 0 },
      ],
      100,
    );
    expect(chapters.map((c) => [c.title, c.page])).toEqual([
      ['A', 1],
      ['B', 50],
    ]);
  });

  it('falls back to equal page ranges when there is no usable table of contents', () => {
    expect(splitFromToc([], 100, 4)).toEqual(splitByPages(100, 4));
    expect(splitFromToc(null, 100, 4)).toEqual(splitByPages(100, 4));
    expect(splitFromToc([{ title: 'Only', page: 1 }], 100, 4)).toEqual(splitByPages(100, 4));
  });

  it('is contiguous for every part count a book allows', () => {
    for (let n = 2; n <= 6; n++) contiguous(splitFromToc(TOC, 200, n), 200);
  });
});

describe('parts from a page count', () => {
  it('makes equal contiguous ranges, the first ones one page longer when the pages do not divide', () => {
    const parts = splitByPages(10, 4);
    expect(parts.map((p) => [p.startPage, p.endPage])).toEqual([
      [1, 2],
      [3, 5],
      [6, 7],
      [8, 10],
    ]);
    contiguous(parts, 10);
    expect(parts.map((p) => p.label)).toEqual(['Part 1', 'Part 2', 'Part 3', 'Part 4']);
  });

  it('never makes an empty part: at most one part per page, between 2 and 20', () => {
    expect(maxPartsFor(5)).toBe(5);
    expect(maxPartsFor(500)).toBe(MAX_PARTS);
    expect(splitByPages(3, 20)).toHaveLength(3);
    expect(splitByPages(500, 99)).toHaveLength(MAX_PARTS);
    expect(splitByPages(100, 1)).toEqual([]);
    expect(canReadAlong(1)).toBe(false);
    expect(canReadAlong(2)).toBe(true);
    contiguous(splitByPages(97, 13), 97);
  });

  it('suggests about forty pages a part within the limits', () => {
    expect(suggestedPartCount(1)).toBe(0);
    expect(suggestedPartCount(30)).toBe(2);
    expect(suggestedPartCount(160)).toBe(4);
    expect(suggestedPartCount(5000)).toBe(12);
  });
});

describe('checking parts', () => {
  const ok: PartDraft[] = [
    { label: 'One', startPage: 1, endPage: 10 },
    { label: 'Two', startPage: 11, endPage: 20 },
  ];
  it('accepts ordered, non-overlapping parts inside the book, with gaps allowed', () => {
    expect(partsProblem(ok, 20)).toBeNull();
    expect(partsProblem([ok[0]!, { label: 'Two', startPage: 15, endPage: 20 }], 20)).toBeNull();
  });
  it('names what is wrong', () => {
    expect(partsProblem([ok[0]!], 20)).toBe('count');
    expect(
      partsProblem(
        Array.from({ length: 21 }, (_, i) => ({ label: 'x', startPage: i + 1, endPage: i + 1 })),
        50,
      ),
    ).toBe('count');
    expect(partsProblem([ok[0]!, { label: ' ', startPage: 11, endPage: 20 }], 20)).toBe('label');
    expect(partsProblem([ok[0]!, { label: 'x'.repeat(LABEL_MAX + 1), startPage: 11, endPage: 20 }], 20)).toBe('label');
    expect(partsProblem(ok, 15)).toBe('range');
    expect(partsProblem([ok[0]!, { label: 'Two', startPage: 20, endPage: 11 }], 20)).toBe('range');
    expect(partsProblem([ok[0]!, { label: 'Two', startPage: 1.5, endPage: 11 }], 20)).toBe('range');
    expect(partsProblem([ok[0]!, { label: 'Two', startPage: 10, endPage: 20 }], 20)).toBe('order');
  });
});

describe('opening times', () => {
  const london = { weekday: 0, minuteOfDay: 9 * 60, timeZone: 'Europe/London' };

  it('finds the first weekday on or after the start date', () => {
    // 2026-12-07 is a Monday
    expect(firstOpeningDay('2026-12-07', 1)).toBe('2026-12-07');
    expect(firstOpeningDay('2026-12-07', 0)).toBe('2026-12-13');
    expect(firstOpeningDay('2026-12-07', 6)).toBe('2026-12-12');
  });

  it('opens a part a week apart at the same wall time', () => {
    const opens = openingsFor({ ...london, weekday: 1 }, '2026-12-07', 4).map((ms) => new Date(ms).toISOString());
    expect(opens).toEqual([
      '2026-12-07T09:00:00.000Z',
      '2026-12-14T09:00:00.000Z',
      '2026-12-21T09:00:00.000Z',
      '2026-12-28T09:00:00.000Z',
    ]);
  });

  it('keeps 09:00 across the spring clock change in London (the 28th of March 2027)', () => {
    const opens = openingsFor(london, '2027-03-14', 4).map((ms) => new Date(ms).toISOString());
    expect(opens).toEqual([
      '2027-03-14T09:00:00.000Z', // GMT
      '2027-03-21T09:00:00.000Z', // GMT
      '2027-03-28T08:00:00.000Z', // BST: 09:00 local is an hour earlier in UTC
      '2027-04-04T08:00:00.000Z',
    ]);
  });

  it('keeps 09:00 across the autumn clock change in New York (the 1st of November 2026)', () => {
    const ny = { weekday: 0, minuteOfDay: 9 * 60, timeZone: 'America/New_York' };
    const opens = openingsFor(ny, '2026-10-25', 3).map((ms) => new Date(ms).toISOString());
    expect(opens).toEqual([
      '2026-10-25T13:00:00.000Z', // EDT
      '2026-11-01T14:00:00.000Z', // EST
      '2026-11-08T14:00:00.000Z',
    ]);
  });

  it('puts a time that does not exist (the spring-forward hour) just after the gap', () => {
    const gap = { weekday: 0, minuteOfDay: 90, timeZone: 'Europe/London' };
    const opens = openingsFor(gap, '2027-03-28', 1);
    // 01:30 on 2027-03-28 does not exist in London: the part opens an hour on, 02:30 BST = 01:30 UTC, never before the gap
    expect(new Date(opens[0]!).toISOString()).toBe('2027-03-28T01:30:00.000Z');
  });

  it('counts the next openings from an instant: strictly after it, then weekly', () => {
    const after = Date.parse('2027-03-21T09:00:00Z');
    const next = openingsAfter(london, after, 3).map((ms) => new Date(ms).toISOString());
    expect(next).toEqual(['2027-03-28T08:00:00.000Z', '2027-04-04T08:00:00.000Z', '2027-04-11T08:00:00.000Z']);
  });
});

describe('the thread', () => {
  it('carries "Spoilers: <label>" within the 80-character content warning', () => {
    expect(spoilerWarning('Part 1')).toBe('Spoilers: Part 1');
    expect([...spoilerWarning('x'.repeat(200))].length).toBeLessThanOrEqual(80);
    expect([...spoilerWarning('x'.repeat(LABEL_MAX))].length).toBe(80);
  });

  it('names the book, the part and its pages, and links to the page', () => {
    const text = composePartPost({
      bookTitle: 'Moby Dick',
      label: 'Part 2',
      startPage: 51,
      endPage: 100,
      url: 'https://rmhstudios.com/c/art/read/abc',
    });
    expect(text).toBe('Read-along: Moby Dick - Part 2 (pages 51-100)\nhttps://rmhstudios.com/c/art/read/abc');
    expect(composePartPost({ bookTitle: 'B', label: 'L', startPage: 7, endPage: 7, url: 'u' })).toContain('(page 7)');
  });

  it('fits one post: a long title is shortened and the link is kept whole', () => {
    const url = 'https://rmhstudios.com/c/some-community/read/clx0000000000000000000000';
    const text = composePartPost({
      bookTitle: 'T'.repeat(200),
      label: 'L'.repeat(LABEL_MAX),
      startPage: 1,
      endPage: 100,
      url,
    });
    expect([...text].length).toBeLessThanOrEqual(280);
    expect(text.endsWith(url)).toBe(true);
    expect(text).toContain('…');
  });
});
