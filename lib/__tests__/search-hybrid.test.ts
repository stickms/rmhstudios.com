import { describe, it, expect } from 'vitest';

/**
 * Hybrid retrieval's fusion step (M1).
 *
 * The property that has to hold is the one that makes a hybrid search worth
 * having: a document both retrievers found outranks one either found alone,
 * even when it placed second in both. Everything else here is about the order
 * being total and stable, because an unstable ranking is invisible in a test
 * and maddening in a UI.
 */

import { RRF_K, fuse, pinExact, prepareText } from '@/lib/search/hybrid';

describe('fuse', () => {
  it('returns nothing for nothing', () => {
    expect(fuse({})).toEqual([]);
    expect(fuse({ lex: { ids: [] } })).toEqual([]);
  });

  it('preserves a single retriever\'s order', () => {
    const out = fuse({ lex: { ids: ['a', 'b', 'c'] } });
    expect(out.map((h) => h.id)).toEqual(['a', 'b', 'c']);
  });

  it('ranks agreement above either retriever\'s first pick', () => {
    // `b` is second in both lists and first overall. This is the whole reason
    // to fuse rather than to interleave.
    const out = fuse({
      lex: { ids: ['a', 'b'] },
      vec: { ids: ['c', 'b'] },
    });
    expect(out[0].id).toBe('b');
  });

  it('records where each retriever placed a hit', () => {
    const out = fuse({ lex: { ids: ['a', 'b'] }, vec: { ids: ['b'] } });
    const b = out.find((h) => h.id === 'b')!;
    expect(b.ranks).toEqual({ lex: 1, vec: 0 });
  });

  it('honours a retriever weight without reintroducing score blending', () => {
    const even = fuse({ lex: { ids: ['a'] }, vec: { ids: ['b'] } });
    expect(even[0].score).toBeCloseTo(even[1].score, 10);

    const tilted = fuse({ lex: { ids: ['a'], weight: 2 }, vec: { ids: ['b'] } });
    expect(tilted[0].id).toBe('a');
  });

  it('does not double-count a retriever that lists the same id twice', () => {
    const once = fuse({ lex: { ids: ['a'] } })[0].score;
    const twice = fuse({ lex: { ids: ['a', 'a'] } })[0].score;
    expect(twice).toBeCloseTo(once, 10);
  });

  it('keeps the better rank when an id is repeated', () => {
    const out = fuse({ lex: { ids: ['x', 'a', 'a'] } });
    expect(out.find((h) => h.id === 'a')!.ranks.lex).toBe(1);
  });

  it('is a total, stable order', () => {
    // Two ids with identical everything must still come back in a fixed
    // sequence — the same query re-rendered has to look the same.
    const a = fuse({ lex: { ids: ['b', 'a'] }, vec: { ids: ['a', 'b'] } });
    const b = fuse({ lex: { ids: ['b', 'a'] }, vec: { ids: ['a', 'b'] } });
    expect(a.map((h) => h.id)).toEqual(b.map((h) => h.id));
  });

  it('uses the documented constant by default', () => {
    expect(fuse({ lex: { ids: ['a'] } })[0].score).toBeCloseTo(1 / (RRF_K + 1), 10);
  });

  it('lets a smaller k sharpen the top of the list', () => {
    const flat = fuse({ lex: { ids: ['a', 'b'] } }, 1000);
    const sharp = fuse({ lex: { ids: ['a', 'b'] } }, 1);
    expect(sharp[0].score / sharp[1].score).toBeGreaterThan(flat[0].score / flat[1].score);
  });
});

describe('pinExact', () => {
  it('is a no-op with nothing to pin', () => {
    const hits = fuse({ lex: { ids: ['a', 'b'] } });
    expect(pinExact(hits, []).map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('lifts an exact match over a better-ranked neighbour', () => {
    // Typing a title in full is asking for that thing, not expressing an
    // interest in the topic.
    const hits = fuse({ lex: { ids: ['a', 'b', 'c'] } });
    expect(pinExact(hits, ['c']).map((h) => h.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps several exact matches in their fused order', () => {
    const hits = fuse({ lex: { ids: ['a', 'b', 'c'] } });
    expect(pinExact(hits, ['c', 'b']).map((h) => h.id)).toEqual(['b', 'c', 'a']);
  });

  it('ignores an id that is not in the results', () => {
    const hits = fuse({ lex: { ids: ['a'] } });
    expect(pinExact(hits, ['zzz']).map((h) => h.id)).toEqual(['a']);
  });
});

describe('prepareText', () => {
  it('collapses whitespace so a cosmetic re-save is not a re-embed', () => {
    expect(prepareText('a\n\n  b\t c ')).toBe('a b c');
  });

  it('truncates to the cap', () => {
    expect(prepareText('x'.repeat(50), 10)).toHaveLength(10);
  });

  it('handles empty input', () => {
    expect(prepareText('   \n ')).toBe('');
  });
});
