import { describe, expect, it } from 'vitest';
import {
  CHART_H,
  CHART_W,
  PLOT,
  barsGeometry,
  extendStep,
  fillDays,
  linePath,
  niceMax,
  spreadLabels,
  xTicks,
  yTicksFor,
} from './chart-geometry';

describe('fillDays', () => {
  it('zero-fills an inclusive ascending range', () => {
    const out = fillDays([{ date: '2026-06-02', count: 3 }], '2026-06-01', '2026-06-03');
    expect(out.map((d) => d.count)).toEqual([0, 3, 0]);
    expect(out.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });
  it('returns nothing for an inverted range', () => {
    expect(fillDays([], '2026-06-03', '2026-06-01')).toEqual([]);
  });
});

describe('barsGeometry', () => {
  it('handles empty input without NaN', () => {
    const g = barsGeometry([]);
    expect(g.bars).toEqual([]);
    expect(g.max).toBe(0);
    for (const t of g.yTicks) expect(Number.isFinite(t.y)).toBe(true);
  });
  it('all-zero input gives finite geometry', () => {
    const g = barsGeometry([
      { date: '2026-06-01', count: 0 },
      { date: '2026-06-02', count: 0 },
    ]);
    for (const b of g.bars) for (const v of [b.x, b.y, b.w, b.h]) expect(Number.isFinite(v)).toBe(true);
    expect(g.yTicks.length).toBeGreaterThan(0);
  });
  it('bars stand on the baseline and stay inside the plot', () => {
    const g = barsGeometry([
      { date: '2026-06-01', count: 4 },
      { date: '2026-06-02', count: 8 },
    ]);
    for (const b of g.bars) {
      expect(b.y + b.h).toBeCloseTo(PLOT.bottom, 5);
      expect(b.x).toBeGreaterThanOrEqual(PLOT.left);
      expect(b.x + b.w).toBeLessThanOrEqual(PLOT.right + 1e-6);
    }
    expect(g.bars[1]!.h).toBeGreaterThan(g.bars[0]!.h);
  });
  it('an extra max (comparison series) raises the scale', () => {
    const base = barsGeometry([{ date: '2026-06-01', count: 4 }]);
    const raised = barsGeometry([{ date: '2026-06-01', count: 4 }], 40);
    expect(raised.bars[0]!.h).toBeLessThan(base.bars[0]!.h);
  });
});

describe('linePath', () => {
  it('is empty for no points', () => {
    expect(linePath([], [0, 10], 5)).toEqual({ d: '', end: null });
  });
  it('is byte-identical across calls, with no exponent and at most two decimals', () => {
    const pts = [
      { x: 0, y: 1 / 3 },
      { x: 1, y: 2 / 3 },
      { x: 7, y: 1e-9 },
      { x: 9, y: 5 },
    ];
    const a = linePath(pts, [0, 9], 5, true);
    const b = linePath(pts, [0, 9], 5, true);
    expect(a.d).toBe(b.d);
    expect(a.d).not.toMatch(/e-/);
    expect(a.d).not.toMatch(/\.\d{3,}/);
    expect(a.d).not.toMatch(/NaN/);
  });
  it('step paths hold the previous value, straight paths do not', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const step = linePath(pts, [0, 10], 10, true).d;
    const straight = linePath(pts, [0, 10], 10, false).d;
    expect(step).not.toBe(straight);
  });
  it('end is the last point in pixels, inside the plot', () => {
    const { end } = linePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      [0, 10],
      5,
    );
    expect(end).not.toBeNull();
    expect(end!.x).toBeCloseTo(PLOT.right, 5);
    expect(end!.y).toBeCloseTo(PLOT.top, 5);
  });
  it('a zero yMax and a one-point domain stay finite', () => {
    const { d, end } = linePath([{ x: 3, y: 0 }], [3, 3], 0);
    expect(d).not.toMatch(/NaN/);
    expect(Number.isFinite(end!.x) && Number.isFinite(end!.y)).toBe(true);
  });
});

describe('extendStep', () => {
  it('appends the last value at the domain end, once', () => {
    expect(
      extendStep(
        [
          { x: 0, y: 1 },
          { x: 4, y: 3 },
        ],
        9,
      ),
    ).toEqual([
      { x: 0, y: 1 },
      { x: 4, y: 3 },
      { x: 9, y: 3 },
    ]);
    expect(extendStep([{ x: 9, y: 3 }], 9)).toEqual([{ x: 9, y: 3 }]);
    expect(extendStep([], 9)).toEqual([]);
  });
});

describe('ticks', () => {
  it('xTicks gives ascending ticks inside the plot', () => {
    const t = xTicks([0, 300], 4);
    expect(t).toHaveLength(4);
    for (let i = 1; i < t.length; i++) expect(t[i]!.x).toBeGreaterThan(t[i - 1]!.x);
    for (const k of t) {
      expect(k.x).toBeGreaterThanOrEqual(0);
      expect(k.x).toBeLessThanOrEqual(CHART_W);
    }
  });
  it('xTicks on a one-point domain is one finite tick', () => {
    const t = xTicks([5, 5], 4);
    expect(t).toHaveLength(1);
    expect(Number.isFinite(t[0]!.x)).toBe(true);
  });
  it('niceMax and yTicksFor never return zero or NaN', () => {
    expect(niceMax(0)).toBeGreaterThan(0);
    expect(niceMax(37)).toBeGreaterThanOrEqual(37);
    for (const t of yTicksFor(niceMax(0))) expect(Number.isFinite(t.y)).toBe(true);
    const ticks = yTicksFor(niceMax(37));
    expect(ticks[0]!.v).toBe(0);
    expect(ticks[0]!.y).toBeCloseTo(PLOT.bottom, 5);
    expect(CHART_H).toBeGreaterThan(PLOT.bottom);
  });
});

describe('spreadLabels', () => {
  it('separates crowded labels, in order, inside the bounds', () => {
    const out = spreadLabels([100, 102, 104], 12, [0, 240]);
    expect(out).toHaveLength(3);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(12 - 1e-9);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(240);
    }
    expect(out[0]!).toBeLessThanOrEqual(out[1]!);
    expect(out[1]!).toBeLessThanOrEqual(out[2]!);
  });
  it('preserves the input order when the input is unsorted', () => {
    const out = spreadLabels([200, 10, 12], 12, [0, 240]);
    expect(out[1]!).toBeLessThan(out[2]!);
    expect(out[0]!).toBe(200);
  });
  it('pushes labels off the edges back inside', () => {
    const out = spreadLabels([238, 239, 240], 12, [0, 240]);
    for (const v of out) expect(v).toBeLessThanOrEqual(240);
    const s = [...out].sort((a, b) => a - b);
    expect(s[1]! - s[0]!).toBeGreaterThanOrEqual(12 - 1e-9);
  });
  it('compresses evenly when the bounds cannot hold the gap', () => {
    const out = spreadLabels([5, 5, 5], 12, [0, 12]);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...out)).toBeLessThanOrEqual(12);
  });
  it('handles empty input', () => {
    expect(spreadLabels([], 12, [0, 240])).toEqual([]);
  });
});
