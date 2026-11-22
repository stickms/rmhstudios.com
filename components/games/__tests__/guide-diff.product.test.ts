import { describe, expect, it } from 'vitest';
import { collapseUnchanged, diffGuideBodies } from '../guide-diff';
import { diffLines, splitLines } from '@/lib/toolbox/diff';

describe('diffGuideBodies', () => {
  it('marks an added line', () => {
    const d = diffGuideBodies('one\ntwo', 'one\ntwo\nthree');
    if (d.tooLong) throw new Error('unexpected');
    expect(d.summary).toMatchObject({ added: 1, removed: 0, unchanged: 2 });
    expect(d.entries.filter((e) => e.op === 'insert').map((e) => ('text' in e ? e.text : ''))).toEqual(['three']);
  });

  it('marks a removed paragraph line', () => {
    const d = diffGuideBodies('intro\n\nremove me\n\noutro', 'intro\n\n\noutro');
    if (d.tooLong) throw new Error('unexpected');
    const removed = d.entries.filter((e) => e.op === 'delete');
    expect(removed).toHaveLength(1);
    expect(removed[0] && 'text' in removed[0] ? removed[0].text : '').toBe('remove me');
    expect(d.summary.added).toBe(0);
  });

  it('reports identical text as identical', () => {
    const d = diffGuideBodies('same\ntext', 'same\ntext');
    if (d.tooLong) throw new Error('unexpected');
    expect(d.identical).toBe(true);
    expect(d.summary).toMatchObject({ added: 0, removed: 0, unchanged: 2 });
  });

  it('keeps unchanged lines as unchanged', () => {
    const d = diffGuideBodies('a\nb\nc', 'a\nX\nc');
    if (d.tooLong) throw new Error('unexpected');
    expect(d.summary).toMatchObject({ added: 1, removed: 1, unchanged: 2 });
  });

  it('refuses to diff past the size limit on either side', () => {
    expect(diffGuideBodies('x'.repeat(11), 'y', 10)).toEqual({ tooLong: true });
    expect(diffGuideBodies('y', 'x'.repeat(11), 10)).toEqual({ tooLong: true });
    expect(diffGuideBodies('x'.repeat(10), 'y', 10).tooLong).toBe(false);
  });

  it('uses the 200 000 character default', () => {
    expect(diffGuideBodies('x'.repeat(200_001), 'y')).toEqual({ tooLong: true });
  });
});

describe('diffGuideBodies on long texts', () => {
  it('trims shared head and tail so one changed paragraph in a long text still diffs', () => {
    const a = Array.from({ length: 6_000 }, (_, i) => `line ${i}`);
    const b = [...a];
    b[3_000] = 'changed';
    const d = diffGuideBodies(a.join('\n'), b.join('\n'));
    if (d.tooLong) throw new Error('unexpected');
    expect(d.summary).toMatchObject({ added: 1, removed: 1, unchanged: 5_999 });
    expect(d.entries.find((e) => e.op === 'delete')).toMatchObject({ oldLine: 3_001 });
  });

  it('refuses a rewrite whose differing middle is too long', () => {
    const a = Array.from({ length: 2_000 }, (_, i) => `old ${i}`).join('\n');
    const b = Array.from({ length: 2_000 }, (_, i) => `new ${i}`).join('\n');
    expect(diffGuideBodies(a, b)).toEqual({ tooLong: true });
  });
});

describe('collapseUnchanged', () => {
  it('folds long unchanged runs into a gap and keeps context around a change', () => {
    const a = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const b = [...a];
    b[10] = 'changed';
    const entries = collapseUnchanged(diffLines(splitLines(a.join('\n')), splitLines(b.join('\n'))));
    expect(entries.filter((e) => e.op === 'gap')).toEqual([
      { op: 'gap', count: 8 },
      { op: 'gap', count: 7 },
    ]);
    // 2 context lines each side, plus the removed and the inserted line.
    expect(entries.filter((e) => e.op !== 'gap')).toHaveLength(6);
  });
});
