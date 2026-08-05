import { describe, it, expect } from 'vitest';
import {
  diffWords,
  diffStat,
  tokenizeWords,
  buildVersions,
  DIFF_TOKEN_LIMIT,
} from '@/lib/feed/word-diff';

/**
 * F23 — public edit history.
 *
 * The diff is the feature. Two properties are load-bearing and neither is
 * obvious from reading the function: reassembling the parts must reproduce both
 * inputs exactly (otherwise the "history" is showing something the author never
 * wrote), and the version list must attribute the right timestamp to the right
 * text (`RMHarkEdit` stores the content that was REPLACED, so the naive reading
 * is off by one and silently mislabels every revision).
 */

/** The `before` text, reassembled from the parts that survived it. */
const rebuildBefore = (parts: ReturnType<typeof diffWords>) =>
  parts
    .filter((p) => p.op !== 'insert')
    .map((p) => p.value)
    .join('');

/** The `after` text, reassembled from the parts that make it up. */
const rebuildAfter = (parts: ReturnType<typeof diffWords>) =>
  parts
    .filter((p) => p.op !== 'delete')
    .map((p) => p.value)
    .join('');

describe('tokenizeWords', () => {
  it('keeps whitespace as its own token so the text round-trips', () => {
    const text = 'hello  world\nagain';
    expect(tokenizeWords(text).join('')).toBe(text);
  });

  it('returns nothing for an empty string', () => {
    expect(tokenizeWords('')).toEqual([]);
  });
});

describe('diffWords', () => {
  it('reports no change as a single equal run', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ op: 'equal', value: 'same text' }]);
  });

  it('isolates a single changed word instead of rewriting the line', () => {
    const parts = diffWords('the quick brown fox', 'the quick red fox');
    expect(parts.filter((p) => p.op === 'delete').map((p) => p.value)).toEqual(['brown']);
    expect(parts.filter((p) => p.op === 'insert').map((p) => p.value)).toEqual(['red']);
    // The unchanged words stay unchanged — a diff that marks them is noise.
    expect(rebuildBefore(parts)).toBe('the quick brown fox');
    expect(rebuildAfter(parts)).toBe('the quick red fox');
  });

  it('round-trips both sides for an insertion, a deletion and a rewrite', () => {
    const cases: [string, string][] = [
      ['a b c', 'a b c d'],
      ['a b c d', 'a b c'],
      ['completely different words here', 'nothing at all alike'],
      ['', 'brand new post'],
      ['deleted everything', ''],
      ['trailing space ', 'trailing space'],
      ['line one\nline two', 'line one\nline TWO'],
    ];
    for (const [before, after] of cases) {
      const parts = diffWords(before, after);
      expect(rebuildBefore(parts), `before: ${JSON.stringify(before)}`).toBe(before);
      expect(rebuildAfter(parts), `after: ${JSON.stringify(after)}`).toBe(after);
    }
  });

  it('coalesces neighbouring runs so each op appears once per stretch', () => {
    const parts = diffWords('one two three four', 'one four');
    // "two three " is a single deletion, not three alternating parts.
    expect(parts.filter((p) => p.op === 'delete')).toHaveLength(1);
  });

  it('degrades to a wholesale replace past the token limit', () => {
    const before = Array.from({ length: DIFF_TOKEN_LIMIT + 50 }, (_, i) => `a${i}`).join(' ');
    const after = Array.from({ length: DIFF_TOKEN_LIMIT + 50 }, (_, i) => `b${i}`).join(' ');
    const parts = diffWords(before, after);
    expect(parts).toHaveLength(2);
    expect(parts[0].op).toBe('delete');
    expect(parts[1].op).toBe('insert');
    expect(rebuildBefore(parts)).toBe(before);
    expect(rebuildAfter(parts)).toBe(after);
  });
});

describe('diffStat', () => {
  it('counts words, not tokens — whitespace is not a change', () => {
    const parts = diffWords('the quick brown fox', 'the very quick red fox');
    const stat = diffStat(parts);
    expect(stat.added).toBeGreaterThan(0);
    expect(stat.removed).toBeGreaterThan(0);
  });

  it('reports nothing for an unchanged post', () => {
    expect(diffStat(diffWords('unchanged', 'unchanged'))).toEqual({ added: 0, removed: 0 });
  });
});

describe('buildVersions', () => {
  const post = {
    content: 'v3',
    createdAt: '2026-08-01T00:00:00.000Z',
    editedAt: '2026-08-03T00:00:00.000Z',
  };

  it('returns just the current text for a post that was never edited', () => {
    expect(buildVersions({ ...post, editedAt: null }, [])).toEqual([
      { content: 'v3', at: '2026-08-01T00:00:00.000Z' },
    ]);
  });

  it('pairs each stored version with the time it became visible', () => {
    // Edit rows carry the REPLACED content, stamped when the replacement
    // happened — so row 0's text was live from post creation until row 0's
    // timestamp, and the current text has been live since the LAST row.
    const versions = buildVersions(post, [
      { content: 'v1', createdAt: '2026-08-02T00:00:00.000Z' },
      { content: 'v2', createdAt: '2026-08-03T00:00:00.000Z' },
    ]);
    expect(versions).toEqual([
      { content: 'v1', at: '2026-08-01T00:00:00.000Z' },
      { content: 'v2', at: '2026-08-02T00:00:00.000Z' },
      { content: 'v3', at: '2026-08-03T00:00:00.000Z' },
    ]);
  });

  it('orders out-of-order rows before pairing them', () => {
    const versions = buildVersions(post, [
      { content: 'v2', createdAt: '2026-08-03T00:00:00.000Z' },
      { content: 'v1', createdAt: '2026-08-02T00:00:00.000Z' },
    ]);
    expect(versions.map((v) => v.content)).toEqual(['v1', 'v2', 'v3']);
  });
});
