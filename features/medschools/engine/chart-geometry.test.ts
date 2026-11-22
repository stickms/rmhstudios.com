import { describe, expect, it } from 'vitest';
import {
  GEOMETRIES,
  MID,
  PHONE,
  WIDE,
  addUtcDays,
  barsGeometry,
  extendStep,
  fillDays,
  heightOf,
  linePath,
  niceMax,
  spreadLabels,
  xTicks,
  yTicksFor,
} from './chart-geometry';

const PLOT = WIDE.plot;
const CHART_W = WIDE.w;
const CHART_H = WIDE.h;

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

describe('geometries', () => {
  it('there is one per width, narrowest first, each plot inside its viewBox with room for end labels and ticks', () => {
    expect(GEOMETRIES.map((g) => g.id)).toEqual(['phone', 'mid', 'wide']);
    for (const g of GEOMETRIES) {
      expect(g.plot.left).toBeGreaterThan(0);
      expect(g.plot.right).toBeGreaterThan(g.plot.left);
      expect(g.plot.bottom).toBeGreaterThan(g.plot.top);
      // A 12-unit tick label under the plot, and at least 70 units to the right for a short end label.
      expect(g.h - g.plot.bottom).toBeGreaterThanOrEqual(20);
      expect(g.w - g.plot.right).toBeGreaterThanOrEqual(70);
      expect(g.labelGap).toBeGreaterThanOrEqual(g.font);
    }
  });
  it('the phone viewBox is no wider than a 320px phone content box, so its text is not scaled down', () => {
    // A 320 px phone has about 274 px of content: 12 units at that scale must stay at or above 11 px.
    expect((PHONE.font * 274) / PHONE.w).toBeGreaterThanOrEqual(11);
    expect(PHONE.font).toBeGreaterThanOrEqual(11);
    expect(MID.w).toBeLessThan(WIDE.w);
    expect(PHONE.xTickCount).toBeLessThan(WIDE.xTickCount);
  });
  it('every geometry keeps bars, lines and ticks inside its own plot', () => {
    for (const g of GEOMETRIES) {
      const bars = barsGeometry(
        [
          { date: '2026-06-01', count: 2 },
          { date: '2026-06-02', count: 9 },
        ],
        0,
        g,
      );
      for (const b of bars.bars) {
        expect(b.x).toBeGreaterThanOrEqual(g.plot.left);
        expect(b.x + b.w).toBeLessThanOrEqual(g.plot.right + 1e-6);
        expect(b.y + b.h).toBeCloseTo(g.plot.bottom, 5);
      }
      expect(bars.yTicks.length).toBeLessThanOrEqual(g.yTickCount + 2);
      const { end } = linePath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 5 },
        ],
        [0, 10],
        5,
        true,
        g,
      );
      expect(end!.x).toBeCloseTo(g.plot.right, 5);
      expect(end!.y).toBeCloseTo(g.plot.top, 5);
      const ticks = xTicks([0, 174], g.xTickCount, g);
      expect(ticks).toHaveLength(g.xTickCount);
      expect(ticks[0]!.x).toBeCloseTo(g.plot.left, 5);
      expect(ticks[ticks.length - 1]!.x).toBeCloseTo(g.plot.right, 5);
    }
  });
  it('five end labels fit the phone plot height at the phone gap without being compressed', () => {
    const out = spreadLabels([60, 61, 62, 63, 64], PHONE.labelGap, [PHONE.plot.top + 4, PHONE.plot.bottom]);
    const s = [...out].sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) expect(s[i]! - s[i - 1]!).toBeGreaterThanOrEqual(PHONE.labelGap - 1e-9);
  });
  it('heightOf adds a line for an axis title', () => {
    expect(heightOf(PHONE, true)).toBeGreaterThan(heightOf(PHONE, false));
    expect(heightOf(PHONE, false)).toBe(PHONE.h);
  });
});

describe('addUtcDays', () => {
  it('counts calendar days in UTC across month and year ends and DST', () => {
    expect(addUtcDays('2026-06-01', 0)).toBe('2026-06-01');
    expect(addUtcDays('2026-06-01', 44)).toBe('2026-07-15');
    expect(addUtcDays('2025-12-30', 3)).toBe('2026-01-02');
    expect(addUtcDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addUtcDays('2026-06-10', -9)).toBe('2026-06-01');
  });
});
