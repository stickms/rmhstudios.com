import { describe, expect, it } from 'vitest';
import { diffLines, splitLines, summarise, unifiedDiff, type DiffLine } from '@/lib/toolbox/diff';

/** Re-apply a script: the old side must rebuild `a`, the new side `b`. */
function sides(lines: DiffLine[]) {
  return {
    old: lines.filter((l) => l.op !== 'insert').map((l) => l.text),
    neu: lines.filter((l) => l.op !== 'delete').map((l) => l.text),
  };
}

describe('diffLines', () => {
  it('finds no change between equal texts', () => {
    const d = diffLines(['a', 'b'], ['a', 'b']);
    expect(summarise(d)).toEqual({ added: 0, removed: 0, unchanged: 2 });
  });

  it('handles empty sides', () => {
    expect(summarise(diffLines([], ['x', 'y']))).toEqual({ added: 2, removed: 0, unchanged: 0 });
    expect(summarise(diffLines(['x'], []))).toEqual({ added: 0, removed: 1, unchanged: 0 });
    expect(diffLines([], [])).toEqual([]);
  });

  it('finds a minimal script (the Myers paper example)', () => {
    const a = 'ABCABBA'.split('');
    const b = 'CBABAC'.split('');
    const d = diffLines(a, b);
    const s = summarise(d);
    expect(s.added + s.removed).toBe(5);
    expect(sides(d).old).toEqual(a);
    expect(sides(d).neu).toEqual(b);
  });

  it('rebuilds both sides for random edits', () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 50; run++) {
      const a = Array.from({ length: Math.floor(rnd() * 30) }, () => String(Math.floor(rnd() * 5)));
      const b = Array.from({ length: Math.floor(rnd() * 30) }, () => String(Math.floor(rnd() * 5)));
      const d = diffLines(a, b);
      expect(sides(d).old).toEqual(a);
      expect(sides(d).neu).toEqual(b);
    }
  });

  it('numbers lines on each side', () => {
    const d = diffLines(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(d).toEqual([
      { op: 'equal', text: 'a', oldLine: 1, newLine: 1 },
      { op: 'delete', text: 'b', oldLine: 2 },
      { op: 'insert', text: 'x', newLine: 2 },
      { op: 'equal', text: 'c', oldLine: 3, newLine: 3 },
    ]);
  });

  it('can ignore whitespace and case', () => {
    const d = diffLines(['  Hello   world'], ['hello world'], { ignoreWhitespace: true, ignoreCase: true });
    expect(summarise(d).unchanged).toBe(1);
    expect(d[0]?.text).toBe('hello world');
  });

  it('compares long, mostly equal texts quickly', () => {
    const a = Array.from({ length: 20_000 }, (_, i) => `line ${i}`);
    const b = a.slice();
    b[10_000] = 'changed';
    const start = performance.now();
    expect(summarise(diffLines(a, b))).toEqual({ added: 1, removed: 1, unchanged: 19_999 });
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe('splitLines', () => {
  it('normalises line endings and drops one trailing newline', () => {
    expect(splitLines('a\r\nb\rc\n')).toEqual(['a', 'b', 'c']);
    expect(splitLines('')).toEqual([]);
  });
});

describe('unifiedDiff', () => {
  it('writes hunks with context in diff -u form', () => {
    const a = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const b = a.slice();
    b[4] = 'five';
    expect(unifiedDiff(diffLines(a, b), 1)).toBe(
      ['--- a', '+++ b', '@@ -4,3 +4,3 @@', ' 4', '-5', '+five', ' 6'].join('\n'),
    );
  });

  it('is empty when nothing changed', () => {
    expect(unifiedDiff(diffLines(['a'], ['a']))).toBe('');
  });

  it('numbers a pure insertion at the start', () => {
    expect(unifiedDiff(diffLines(['b'], ['a', 'b']), 0)).toBe(['--- a', '+++ b', '@@ -0,0 +1,1 @@', '+a'].join('\n'));
  });
});
