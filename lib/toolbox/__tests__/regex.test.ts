import { describe, expect, it } from 'vitest';
import { compileRegex, findMatches, replacePreview, segmentText } from '@/lib/toolbox/regex';

const compile = (p: string, f = 'g') => {
  const r = compileRegex(p, f);
  if (!r.ok) throw new Error(r.message);
  return r.regex;
};

describe('compileRegex', () => {
  it('compiles, unwraps literals and merges flags', () => {
    const r = compileRegex('/ab+c/i', 'g');
    expect(r.ok && r.regex.flags).toBe('dgi');
    expect(r.ok && r.regex.source).toBe('ab+c');
  });

  it('returns the engine message for a bad pattern', () => {
    const r = compileRegex('(', 'g');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/Invalid regular expression/);
  });
});

describe('findMatches', () => {
  it('finds every match with numbered and named groups and their spans', () => {
    const { matches } = findMatches(compile('(?<year>\\d{4})-(\\d{2})'), 'from 2024-05 to 2025-11');
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({
      value: '2024-05',
      start: 5,
      end: 12,
      groups: [
        { index: 1, name: 'year', value: '2024', start: 5, end: 9 },
        { index: 2, value: '05', start: 10, end: 12 },
      ],
    });
  });

  it('ignores non-capturing groups, escapes and classes when naming groups', () => {
    const { matches } = findMatches(compile('(?:x)\\((?<n>[(]?\\d)'), 'x(5');
    expect(matches[0]?.groups).toEqual([{ index: 1, name: 'n', value: '5', start: 2, end: 3 }]);
  });

  it('reports an unmatched optional group without a value', () => {
    const { matches } = findMatches(compile('a(b)?'), 'a');
    expect(matches[0]?.groups).toEqual([{ index: 1 }]);
  });

  it('stops after one match without the g flag', () => {
    expect(findMatches(compile('a', ''), 'aaa').matches).toHaveLength(1);
  });

  it('advances past empty matches and caps the count', () => {
    expect(findMatches(compile('x*'), 'ab').matches).toHaveLength(3);
    const capped = findMatches(compile('.'), 'abcdef', 4);
    expect(capped.matches).toHaveLength(4);
    expect(capped.truncated).toBe(true);
    expect(findMatches(compile('', 'gu'), '😀😀').matches.map((m) => m.start)).toEqual([0, 2, 4]);
  });
});

describe('segmentText', () => {
  it('alternates plain and matched runs', () => {
    const text = 'a1b22c';
    const { matches } = findMatches(compile('\\d+'), text);
    expect(segmentText(text, matches)).toEqual([
      { text: 'a', match: -1 },
      { text: '1', match: 0 },
      { text: 'b', match: -1 },
      { text: '22', match: 1 },
      { text: 'c', match: -1 },
    ]);
  });
});

describe('replacePreview', () => {
  it('supports numbered and named references', () => {
    expect(replacePreview(compile('(?<y>\\d{4})-(\\d{2})'), '2024-05', '$2/$<y>')).toBe('05/2024');
  });
});
