import { describe, it, expect } from 'vitest';
import { summarizeGrades } from '@/lib/rmhstudy/session-summary';

describe('summarizeGrades', () => {
  it('handles an empty session', () => {
    expect(summarizeGrades([])).toEqual({ counts: [0, 0, 0, 0], total: 0, recalledPercent: 0 });
  });

  it('counts each grade and the recalled percentage (Good + Easy)', () => {
    const s = summarizeGrades([0, 1, 2, 2, 3, 3, 3, 2]);
    expect(s.counts).toEqual([1, 1, 3, 3]);
    expect(s.total).toBe(8);
    expect(s.recalledPercent).toBe(75);
  });

  it('rounds to a whole percent', () => {
    expect(summarizeGrades([2, 0, 0]).recalledPercent).toBe(33);
    expect(summarizeGrades([2, 2, 0]).recalledPercent).toBe(67);
  });

  it('ignores out-of-range or non-integer grades', () => {
    const s = summarizeGrades([2, 7, -1, 1.5, Number.NaN]);
    expect(s.total).toBe(1);
    expect(s.recalledPercent).toBe(100);
  });
});
