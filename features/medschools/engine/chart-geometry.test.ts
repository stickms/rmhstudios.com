import { describe, expect, it } from 'vitest';
import {
  GEOMETRIES,
  MID,
  PHONE,
  WIDE,
  REFERENCE_DAY_ZERO,
  TICK_FADE,
  addUtcDays,
  barsGeometry,
  calendarDate,
  calendarX,
  cycleCalendarPoints,
  easeOutCubic,
  nearestIndex,
  plotX,
  plotY,
  withZeroStart,
  yTicksTween,
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
  it('there is one per width, narrowest first, each plot inside its viewBox with room for ticks', () => {
    expect(GEOMETRIES.map((g) => g.id)).toEqual(['phone', 'mid', 'wide']);
    for (const g of GEOMETRIES) {
      expect(g.plot.left).toBeGreaterThan(0);
      expect(g.plot.right).toBeGreaterThan(g.plot.left);
      expect(g.plot.bottom).toBeGreaterThan(g.plot.top);
      // A 12-unit tick label under the plot; no end labels (O7), so only a small right margin.
      expect(g.h - g.plot.bottom).toBeGreaterThanOrEqual(20);
      expect(g.w - g.plot.right).toBeGreaterThanOrEqual(8);
      expect(g.w - g.plot.right).toBeLessThanOrEqual(20);
      expect(g.labelGap).toBeGreaterThanOrEqual(g.font);
    }
  });
  it('the phone viewBox is no wider than a 320px phone content box, so its text is not scaled down', () => {
    // A 320 px phone has about 274 px of content, 248 inside the chart card (1px border, 12px padding): 12 units at
    // that scale must stay at or above 11 px.
    expect((PHONE.font * 248) / PHONE.w).toBeGreaterThanOrEqual(11);
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

describe('withZeroStart (O7: a cumulative line rises from 0 on the first day)', () => {
  it('prepends a zero at the start day when the first report is later', () => {
    expect(
      withZeroStart(
        [
          { x: 12, y: 3 },
          { x: 20, y: 5 },
        ],
        0,
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 12, y: 3 },
      { x: 20, y: 5 },
    ]);
  });
  it('prepends the zero on the first day of a report too, so the step rises from 0', () => {
    expect(withZeroStart([{ x: 0, y: 4 }], 0)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 4 },
    ]);
  });
  it('starts at the earlier of the start day and the first report (a report before day zero)', () => {
    expect(withZeroStart([{ x: -3, y: 1 }], 0)[0]).toEqual({ x: -3, y: 0 });
  });
  it('leaves an empty series empty', () => {
    expect(withZeroStart([], 0)).toEqual([]);
  });
});

describe('calendar alignment of cycles (O7: always dates)', () => {
  it('puts June 1 of every cycle at the same x, whatever the cycle year', () => {
    expect(calendarX('2025-06-01', 2025)).toBe(0);
    expect(calendarX('2026-06-01', 2026)).toBe(0);
    expect(calendarX('2028-06-01', 2028)).toBe(0);
  });
  it('puts equal month-days at equal x, across a leap year', () => {
    // 2027-2028 has Feb 29 (2028); Mar 1 still lines up with Mar 1 of 2025-2026.
    expect(calendarX('2028-03-01', 2027)).toBe(calendarX('2026-03-01', 2025));
    expect(calendarX('2026-01-15', 2025)).toBe(calendarX('2027-01-15', 2026));
  });
  it('keeps days before June 1 negative and later days increasing', () => {
    expect(calendarX('2025-05-25', 2025)).toBe(-7);
    expect(calendarX('2025-06-02', 2025)).toBe(1);
    expect(calendarX('2026-05-31', 2025)).toBeGreaterThan(calendarX('2026-05-30', 2025));
  });
  it('turns an x back into a month-day on the reference calendar', () => {
    expect(calendarDate(0)).toBe(REFERENCE_DAY_ZERO);
    expect(calendarDate(75)).toBe('2023-08-15');
  });
  it('maps cycle points to calendar x from their own day zero and starts the line at 0', () => {
    const pts = cycleCalendarPoints([{ day: 10, cumulative: 4 }], '2025-06-05', 2026);
    // day 10 after 2025-06-05 is 2025-06-15 -> x 14; the zero sits on the cycle's own first day, x 4.
    expect(pts).toEqual([
      { x: 4, y: 0 },
      { x: 14, y: 4 },
    ]);
    const later = cycleCalendarPoints([{ day: 10, cumulative: 4 }], '2026-06-05', 2027);
    expect(later.map((p) => p.x)).toEqual([4, 14]);
  });
});

describe('nearestIndex', () => {
  it('finds the closest position, ties to the earlier', () => {
    expect(nearestIndex([10, 20, 40], 26)).toBe(1);
    expect(nearestIndex([10, 20, 40], 31)).toBe(2);
    expect(nearestIndex([10, 20, 40], 30)).toBe(1);
    expect(nearestIndex([10, 20, 40], -50)).toBe(0);
    expect(nearestIndex([10, 20, 40], 900)).toBe(2);
  });
  it('is -1 for nothing', () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });
});

describe('tweening', () => {
  it('ease-out runs from 0 to 1, fast first and clamped', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
  it('yTicksTween: ticks of both scales, the shared ones solid, the others fading, all inside the plot', () => {
    const start = yTicksTween(10, 100, 0, 10, WIDE);
    const byV = new Map(start.map((t) => [t.v, t]));
    expect(byV.get(0)!.opacity).toBe(1);
    // A tick only the old scale has is fully visible at the start and gone at the end.
    const oldOnly = yTicksFor(10, WIDE).find((t) => !yTicksFor(100, WIDE).some((u) => u.v === t.v));
    if (oldOnly) expect(byV.get(oldOnly.v)!.opacity).toBe(1);
    const end = yTicksTween(10, 100, 1, 100, WIDE);
    expect(end.map((t) => t.v)).toEqual(yTicksFor(100, WIDE).map((t) => t.v));
    for (const t of end) expect(t.opacity).toBe(1);
    // Midway at a scale of 55: every tick is inside the plot or within the fade margin, opacity is in (0, 1].
    const margin = (WIDE.plot.bottom - WIDE.plot.top) * TICK_FADE;
    for (const t of yTicksTween(10, 100, 0.5, 55, WIDE)) {
      expect(t.y).toBeGreaterThanOrEqual(WIDE.plot.top - margin);
      expect(t.y).toBeLessThanOrEqual(WIDE.plot.bottom + margin);
      expect(t.opacity).toBeGreaterThan(0);
      expect(t.opacity).toBeGreaterThanOrEqual(0);
      expect(t.opacity).toBeLessThanOrEqual(1);
    }
  });
  it('a tick the shrinking scale pushes past the top fades out and is gone beyond the margin', () => {
    // Scale 400 -> 300: the 400 tick is on the top edge at the start, just past it a frame later, gone soon after.
    const at = (now: number) => yTicksTween(400, 300, 0.2, now, WIDE).find((t) => t.v === 400);
    expect(at(400)!.opacity).toBeGreaterThan(0.5);
    const near = at(390);
    expect(near === undefined || near.opacity < at(400)!.opacity).toBe(true);
    expect(at(330)).toBeUndefined();
    expect(yTicksTween(400, 300, 0.2, 330, WIDE).find((t) => t.v === 300)!.opacity).toBe(1);
  });
  it('yTicksTween with equal scales is just the ticks', () => {
    expect(yTicksTween(40, 40, 1, 40, MID).map((t) => t.v)).toEqual(yTicksFor(40, MID).map((t) => t.v));
  });
});

describe('plot scales', () => {
  it('plotX and plotY put the domain ends on the plot edges', () => {
    expect(plotX(0, [0, 100], WIDE)).toBeCloseTo(WIDE.plot.left, 5);
    expect(plotX(100, [0, 100], WIDE)).toBeCloseTo(WIDE.plot.right, 5);
    expect(plotY(0, 50, WIDE)).toBeCloseTo(WIDE.plot.bottom, 5);
    expect(plotY(50, 50, WIDE)).toBeCloseTo(WIDE.plot.top, 5);
  });
  it('a one-point domain is centred', () => {
    expect(plotX(5, [5, 5], WIDE)).toBeCloseTo((WIDE.plot.left + WIDE.plot.right) / 2, 5);
  });
});

describe('barsGeometry with a forced top (the tween frame)', () => {
  const days = [
    { date: '2026-06-01', count: 5 },
    { date: '2026-06-02', count: 10 },
  ];
  it('reports the nice top and draws against the forced one', () => {
    const rest = barsGeometry(days, 0, WIDE);
    const forced = barsGeometry(days, 0, WIDE, 40);
    expect(rest.top).toBe(10);
    expect(forced.top).toBe(10);
    // Against a larger forced top the same bar is shorter.
    expect(forced.bars[1]!.h).toBeLessThan(rest.bars[1]!.h);
    expect(forced.bars[1]!.h).toBeCloseTo((WIDE.plot.bottom - WIDE.plot.top) / 4, 1);
  });
});
