import { describe, it, expect } from 'vitest';
import { gridLayout } from '../daily-puzzles/desk-layout';

describe('gridLayout', () => {
  it('centers a single row horizontally around x=0', () => {
    const { positions, perRow, rows } = gridLayout(3, 10, { cellW: 2, gapX: 0.5, maxPerRow: 6 });
    expect(perRow).toBe(3);
    expect(rows).toBe(1);
    const xs = positions.map((p) => p[0]);
    expect(xs[0]).toBeCloseTo(-2.5);
    expect(xs[1]).toBeCloseTo(0);
    expect(xs[2]).toBeCloseTo(2.5);
    // single row sits on the horizontal axis
    expect(positions.every((p) => Math.abs(p[1]) < 1e-9)).toBe(true);
  });

  it('wraps into rows with the top row highest in y', () => {
    const { positions, perRow, rows } = gridLayout(6, 5, { cellW: 2, cellH: 1, gapX: 0.2, gapY: 0.4, maxPerRow: 2 });
    expect(perRow).toBe(2);
    expect(rows).toBe(3);
    // item 0 (top row) has greater y than item 4 (bottom row)
    expect(positions[0][1]).toBeGreaterThan(positions[4][1]);
  });

  it('never exceeds maxPerRow and stays >= 1 per row', () => {
    const { perRow } = gridLayout(6, 100, { cellW: 1, maxPerRow: 3 });
    expect(perRow).toBe(3);
    const narrow = gridLayout(6, 0.1, { cellW: 1, maxPerRow: 3 });
    expect(narrow.perRow).toBeGreaterThanOrEqual(1);
  });
});
