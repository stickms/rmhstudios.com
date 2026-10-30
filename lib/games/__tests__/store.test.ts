import { describe, expect, it } from 'vitest';
import { filterStore, rankFeatured, tagCounts, type StoreItem } from '../store';

const item = (id: string, over: Partial<StoreItem> = {}): StoreItem => ({
  id,
  title: id.toUpperCase(),
  description: `about ${id}`,
  tags: [],
  kind: 'game',
  ...over,
});

describe('tagCounts', () => {
  it('counts each tag once per title, most common first, ties A to Z', () => {
    const c = tagCounts([
      item('a', { tags: ['Strategy', 'Co-op'] }),
      item('b', { tags: ['Strategy', 'strategy'] }),
      item('c', { tags: ['Puzzle'] }),
    ]);
    expect(c).toEqual([
      { tag: 'Strategy', count: 2 },
      { tag: 'Co-op', count: 1 },
      { tag: 'Puzzle', count: 1 },
    ]);
  });

  it('is empty without tags', () => {
    expect(tagCounts([item('a')])).toEqual([]);
  });
});

describe('filterStore', () => {
  const items = [
    item('altair', { title: 'Altair', tags: ['Roguelike'], description: 'space mining' }),
    item('laundry', { title: 'Laundry Sort', tags: ['Puzzle'], description: 'sort socks' }),
    item('tube', { title: 'RMHTube', tags: ['Video'], kind: 'app', description: 'watch together' }),
  ];

  it('filters by tag, ignoring case', () => {
    expect(filterStore(items, { tag: 'roguelike' }).map((i) => i.id)).toEqual(['altair']);
  });

  it('searches title, tags and description, ignoring case', () => {
    expect(filterStore(items, { q: 'SOCKS' }).map((i) => i.id)).toEqual(['laundry']);
    expect(filterStore(items, { q: 'video' }).map((i) => i.id)).toEqual(['tube']);
    expect(filterStore(items, { q: 'alt' }).map((i) => i.id)).toEqual(['altair']);
  });

  it('combines tag and search, and returns everything with neither', () => {
    expect(filterStore(items, { tag: 'puzzle', q: 'altair' })).toEqual([]);
    expect(filterStore(items, {})).toHaveLength(3);
  });

  it('an empty search is no search', () => {
    expect(filterStore(items, { q: '   ' })).toHaveLength(3);
  });
});

describe('rankFeatured', () => {
  const base = [item('a'), item('b'), item('c'), item('d')];

  it('puts the most played first, lifted by a strong rating', () => {
    const ranked = rankFeatured(base, {
      players: new Map([['a', 10], ['b', 40], ['c', 5]]),
      ratings: new Map([['c', { average: 5, count: 20 }]]),
    });
    expect(ranked[0].id).toBe('b');
    expect(ranked.map((i) => i.id)).toContain('d');
  });

  it('a rating with too few reviews does not count', () => {
    const ranked = rankFeatured(base, {
      players: new Map([['a', 10]]),
      ratings: new Map([['b', { average: 5, count: 1 }]]),
    });
    expect(ranked[0].id).toBe('a');
  });

  it('falls back to catalog order when there is no signal, and never repeats a title', () => {
    const ranked = rankFeatured(base, { players: new Map(), ratings: new Map() });
    expect(ranked.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(new Set(ranked.map((i) => i.id)).size).toBe(4);
  });

  it('respects the limit', () => {
    expect(rankFeatured(base, { players: new Map(), ratings: new Map() }, 2)).toHaveLength(2);
  });
});
