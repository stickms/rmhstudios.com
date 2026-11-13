import { describe, expect, it } from 'vitest';
import {
  bestScore,
  buildEngagement,
  compareCreations,
  pageEngagement,
  parseCreationSort,
  rankCreations,
  type Rankable,
} from '../best';
import { inIdOrder, parseRankCursor, rankPage } from '../rank-page';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 13);
const row = (id: string, engagement: number, ageDays: number): Rankable => ({
  id,
  engagement,
  createdAt: NOW - ageDays * DAY,
});
const ids = (rows: Rankable[]) => rows.map((r) => r.id);

/** Every ordering of a small list, to show the result does not depend on the input order. */
function permutations<T>(list: T[]): T[][] {
  if (list.length <= 1) return [list];
  return list.flatMap((item, i) =>
    permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

describe('bestScore', () => {
  it('is finite and positive with no engagement and no age', () => {
    expect(bestScore(0, 0)).toBe(1);
  });

  it('halves after the half age', () => {
    expect(bestScore(9, 14 * DAY)).toBe(bestScore(9, 0) / 2);
  });

  it('clamps a negative count, a future creation time and a non-number', () => {
    expect(bestScore(-5, 0)).toBe(1);
    expect(bestScore(3, -10 * DAY)).toBe(bestScore(3, 0));
    expect(bestScore(Number.NaN, Number.NaN)).toBe(1);
    expect(Number.isFinite(bestScore(Number.POSITIVE_INFINITY, 0))).toBe(true);
  });
});

describe('rankCreations', () => {
  const rows = [
    row('a', 0, 1),
    row('b', 12, 3),
    row('c', 40, 200),
    row('d', 0, 60),
    row('e', 3, 10),
    row('f', 3, 10),
  ];

  it.each(['best', 'popular', 'newest'] as const)(
    '%s gives one order whatever order the rows arrive in',
    (sort) => {
      const expected = ids(rankCreations(rows, sort, NOW));
      for (const p of permutations(rows))
        expect(ids(rankCreations(p, sort, NOW))).toEqual(expected);
    },
  );

  it('does not mutate its input', () => {
    const before = ids(rows);
    rankCreations(rows, 'best', NOW);
    expect(ids(rows)).toEqual(before);
  });

  it('best: equal engagement, the newer row ranks higher', () => {
    expect(ids(rankCreations([row('old', 5, 30), row('new', 5, 2)], 'best', NOW))).toEqual([
      'new',
      'old',
    ]);
  });

  it('best: equal age, the more engaged row ranks higher', () => {
    expect(ids(rankCreations([row('quiet', 1, 5), row('loud', 9, 5)], 'best', NOW))).toEqual([
      'loud',
      'quiet',
    ]);
  });

  it('best: rows with no engagement sort newest first and never divide by zero', () => {
    const ranked = rankCreations([row('x', 0, 9), row('y', 0, 0), row('z', 0, 400)], 'best', NOW);
    expect(ids(ranked)).toEqual(['y', 'x', 'z']);
    for (const r of ranked)
      expect(Number.isFinite(bestScore(r.engagement, NOW - r.createdAt))).toBe(true);
  });

  it('best: real use outlasts a new empty row, and fades in the end', () => {
    expect(ids(rankCreations([row('empty', 0, 0), row('used', 10, 60)], 'best', NOW))[0]).toBe(
      'used',
    );
    expect(ids(rankCreations([row('empty', 0, 0), row('used', 10, 600)], 'best', NOW))[0]).toBe(
      'empty',
    );
  });

  it('a full tie is broken by id, descending', () => {
    for (const sort of ['best', 'popular', 'newest'] as const) {
      expect(ids(rankCreations([row('e', 3, 10), row('f', 3, 10)], sort, NOW))).toEqual(['f', 'e']);
      expect(compareCreations(sort, NOW)(row('e', 3, 10), row('e', 3, 10))).toBe(0);
    }
  });

  it('popular ignores age; newest ignores engagement', () => {
    expect(ids(rankCreations(rows, 'popular', NOW))).toEqual(['c', 'b', 'f', 'e', 'a', 'd']);
    expect(ids(rankCreations(rows, 'newest', NOW))).toEqual(['a', 'b', 'f', 'e', 'd', 'c']);
  });
});

describe('engagement and sort parsing', () => {
  it('weights a build like the feed does', () => {
    expect(buildEngagement({ likeCount: 2, commentCount: 2, viewCount: 20 })).toBe(6);
  });

  it('counts a page by its customisations, not its first version', () => {
    expect(pageEngagement({ versionCount: 0 })).toBe(0);
    expect(pageEngagement({ versionCount: 1 })).toBe(0);
    expect(pageEngagement({ versionCount: 4 })).toBe(3);
  });

  it('falls back to best for an unknown sort', () => {
    expect(parseCreationSort('popular')).toBe('popular');
    expect(parseCreationSort('recent')).toBe('best');
    expect(parseCreationSort(null)).toBe('best');
  });
});

describe('rankPage', () => {
  const rows = Array.from({ length: 7 }, (_, i) => row(`r${i}`, i % 3, i));

  it('walks the whole list once, in rank order, across pages', () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const page: { ids: string[]; nextCursor: string | null } = rankPage(
        rows,
        'best',
        cursor,
        3,
        NOW,
      );
      seen.push(...page.ids);
      cursor = page.nextCursor;
    } while (cursor && ++guard < 10);
    expect(seen).toEqual(ids(rankCreations(rows, 'best', NOW)));
  });

  it('keeps ranking at the first page’s instant, so later pages do not shift', () => {
    const first = rankPage(rows, 'best', null, 3, NOW);
    expect(first.nextCursor).toBe(`${NOW}.3`);
    // A year later the scores have all changed; the second page is still the same slice.
    const later = rankPage(rows, 'best', first.nextCursor, 3, NOW + 365 * DAY);
    expect(later.ids).toEqual(ids(rankCreations(rows, 'best', NOW)).slice(3, 6));
  });

  it('ends with a null cursor and treats a malformed cursor as the first page', () => {
    expect(rankPage(rows, 'newest', `${NOW}.6`, 3, NOW)).toEqual({ ids: ['r6'], nextCursor: null });
    expect(rankPage(rows, 'newest', 'clxyz123', 2, NOW).ids).toEqual(['r0', 'r1']);
    expect(parseRankCursor(`${NOW + DAY}.4`, NOW)).toEqual({ asOf: NOW, offset: 4 });
  });

  it('inIdOrder restores the page order and drops ids that are gone', () => {
    expect(inIdOrder(['b', 'x', 'a'], [{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'b' },
      { id: 'a' },
    ]);
  });
});
