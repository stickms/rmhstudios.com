import { describe, expect, it } from 'vitest';
import { PAPERS } from '../catalog';
import { ARCHIVE_PAGE_SIZE, pageWindow, paginate, parseArchiveSearch, relatedPapers, sharedKeywords } from '../search';

describe('parseArchiveSearch', () => {
  it('keeps valid params and drops the rest', () => {
    expect(
      parseArchiveSearch({ q: '  resonance ', field: 'physics', author: 'a-b', from: 2020, to: '2024', sort: 'newest', kind: 'paper', page: 3 }),
    ).toEqual({ q: 'resonance', field: 'physics', author: 'a-b', from: 2020, to: 2024, sort: 'newest', kind: 'paper', page: 3 });
    expect(parseArchiveSearch({ q: '', field: 'alchemy', author: 'Bad Id', from: '', to: 'x', sort: 'loudest', kind: 'memo', page: 0 })).toEqual({});
  });

  it('accepts what a plain GET form sends', () => {
    // The router parses `?q=2024` as a number; it is still a query.
    expect(parseArchiveSearch({ q: 2024 })).toEqual({ q: '2024' });
    expect(parseArchiveSearch({ page: '1' })).toEqual({});
    expect(parseArchiveSearch({ page: '2' })).toEqual({ page: 2 });
  });

  it('orders a reversed year range and maps the old reports flag', () => {
    expect(parseArchiveSearch({ from: 2025, to: 2019 })).toEqual({ from: 2019, to: 2025 });
    expect(parseArchiveSearch({ reports: 'true' })).toEqual({ kind: 'report' });
    expect(parseArchiveSearch({ reports: true, kind: 'paper' })).toEqual({ kind: 'paper' });
  });
});

describe('paginate', () => {
  it('slices and clamps', () => {
    expect(paginate(0)).toEqual({ page: 1, pages: 1, start: 0, end: 0 });
    expect(paginate(45, 2)).toEqual({ page: 2, pages: 3, start: ARCHIVE_PAGE_SIZE, end: 40 });
    expect(paginate(45, 9)).toEqual({ page: 3, pages: 3, start: 40, end: 45 });
    expect(paginate(45, -4).page).toBe(1);
  });
});

describe('pageWindow', () => {
  it('shows the ends and the neighbourhood, with gaps', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageWindow(1, 12)).toEqual([1, 2, null, 12]);
    expect(pageWindow(12, 12)).toEqual([1, null, 11, 12]);
    // A one-page gap is the page itself.
    expect(pageWindow(4, 12)).toEqual([1, 2, 3, 4, 5, null, 12]);
  });
});

describe('relatedPapers', () => {
  it('returns up to five other papers in the same field, most shared keywords first', () => {
    for (const paper of PAPERS) {
      const related = relatedPapers(paper);
      expect(related.length).toBeLessThanOrEqual(5);
      const inField = PAPERS.filter((p) => p.field === paper.field && p.id !== paper.id).length;
      expect(related.length).toBe(Math.min(5, inField));
      for (const p of related) {
        expect(p.field).toBe(paper.field);
        expect(p.id).not.toBe(paper.id);
      }
      const shared = related.map((p) => sharedKeywords(paper, p));
      expect(shared).toEqual([...shared].sort((a, b) => b - a));
      // Nothing left out shares more keywords than the last one kept.
      const floor = shared[shared.length - 1] ?? 0;
      const ids = new Set(related.map((p) => p.id));
      for (const p of PAPERS) {
        if (p.field !== paper.field || p.id === paper.id || ids.has(p.id)) continue;
        expect(sharedKeywords(paper, p)).toBeLessThanOrEqual(floor);
      }
    }
  });

  it('honours the limit', () => {
    const paper = PAPERS[0];
    if (!paper) return;
    expect(relatedPapers(paper, 2).length).toBeLessThanOrEqual(2);
    expect(relatedPapers(paper, 0)).toEqual([]);
  });
});
