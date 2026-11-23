import { scaleBand, scaleLinear } from 'd3-scale';
import { clamp01 } from '@/lib/core/math';
import { curveLinear, curveStepAfter, line } from 'd3-shape';

/**
 * Pure chart geometry (Phase 3 Task 5, D2). The ONLY module that imports `d3-*`: every output is plain numbers and
 * strings, so the React charts in `ui/charts/` draw SVG without a d3 type crossing the boundary, and a route module
 * that never imports the charts never pulls d3 into the shared entry (`scripts/check-entry-composition.ts`).
 * No DOM, no viewer time zone: a `YYYY-MM-DD` here is a UTC calendar day.
 */

/**
 * One drawing's geometry. The charts are server-rendered in every geometry and CSS shows exactly one (no measuring,
 * no JS): a viewBox that is scaled down to a phone shrinks its text with it, so each width gets a viewBox close to
 * the width it is shown at and the text stays at a readable size (`font` is in viewBox units, about 1 px each).
 */
export interface ChartGeometry {
  id: 'phone' | 'mid' | 'wide';
  w: number;
  h: number;
  /** The plot rectangle inside the viewBox (O7: no end labels, the legend names the lines, so the right margin is small). */
  plot: { left: number; right: number; top: number; bottom: number };
  /** Axis ticks. */
  xTickCount: number;
  yTickCount: number;
  /** Axis and end-label text size. */
  font: number;
  /** Closest two end labels may sit. */
  labelGap: number;
  /** True when the end labels use the short names. */
  shortLabels: boolean;
}

/**
 * Shown below 30rem. The chart sits on a card (1px border, 12 px padding on a phone), so a 320 px phone shows its
 * 252-unit drawing in about 248 px: one unit is about 0.98 px, and the 12-unit text stays at 11.8 px.
 */
export const PHONE: ChartGeometry = {
  id: 'phone',
  w: 252,
  h: 230,
  plot: { left: 38, right: 240, top: 12, bottom: 196 },
  xTickCount: 3,
  yTickCount: 3,
  font: 12,
  labelGap: 16,
  shortLabels: true,
};
/** From 30rem to 40rem. */
export const MID: ChartGeometry = {
  id: 'mid',
  w: 420,
  h: 240,
  plot: { left: 40, right: 408, top: 12, bottom: 206 },
  xTickCount: 4,
  yTickCount: 4,
  font: 12,
  labelGap: 16,
  shortLabels: true,
};
/** From 40rem up. */
export const WIDE: ChartGeometry = {
  id: 'wide',
  w: 640,
  h: 250,
  plot: { left: 44, right: 628, top: 12, bottom: 216 },
  xTickCount: 5,
  yTickCount: 4,
  font: 12,
  labelGap: 16,
  shortLabels: false,
};
export const GEOMETRIES: readonly ChartGeometry[] = [PHONE, MID, WIDE];

/** Room under the plot for the tick labels, and for an axis title when there is one. */
export const TICK_ROOM = 22;
export const TITLE_ROOM = 18;
/** The viewBox height: the geometry's own, plus a line for an axis title. */
export const heightOf = (g: ChartGeometry, withTitle: boolean) => g.h + (withTitle ? TITLE_ROOM : 0);

/** The calendar day `day` days after `from` (both `YYYY-MM-DD`, UTC). */
export function addUtcDays(from: string, day: number): string {
  return new Date(Date.parse(`${from}T00:00:00Z`) + Math.round(day) * 86_400_000).toISOString().slice(0, 10);
}

type Day = { date: string; count: number };

const DAY_MS = 86_400_000;
const utcMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Zero-filled, ascending, inclusive. An inverted or unparseable range is empty. */
export function fillDays(days: Day[], from: string, to: string): Day[] {
  const start = utcMs(from);
  const end = utcMs(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const byDate = new Map<string, number>();
  for (const d of days) byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.count);
  const out: Day[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, count: byDate.get(date) ?? 0 });
  }
  return out;
}

/** A round upper bound for a y axis that starts at 0. Never 0, so an empty chart still has a scale. */
export function niceMax(max: number): number {
  const m = Number.isFinite(max) && max > 0 ? max : 1;
  const top = scaleLinear().domain([0, m]).nice(4).domain()[1];
  return top !== undefined && top > 0 ? top : 1;
}

/** Y ticks for a `[0, yMax]` axis, in pixels inside the plot. */
export function yTicksFor(yMax: number, g: ChartGeometry = WIDE): { v: number; y: number }[] {
  const y = scaleLinear()
    .domain([0, yMax > 0 ? yMax : 1])
    .range([g.plot.bottom, g.plot.top]);
  return y.ticks(g.yTickCount).map((v) => ({ v, y: round2(y(v)) }));
}

/**
 * `extraMax` lets comparison series share the scale: bars and lines are drawn against one y axis. `fixedTop` forces
 * the axis top (the animated scale while the chart tweens); the ticks returned are then those of `niceMax` anyway.
 */
export function barsGeometry(
  days: Day[],
  extraMax = 0,
  g: ChartGeometry = WIDE,
  fixedTop?: number,
): {
  bars: { x: number; y: number; w: number; h: number }[];
  yTicks: { v: number; y: number }[];
  max: number;
  /** The nice top of the axis for this data (the tween's target). */
  top: number;
} {
  const max = days.reduce((m, d) => Math.max(m, d.count), 0);
  const { plot } = g;
  const niceTop = niceMax(Math.max(max, extraMax));
  const top = fixedTop !== undefined && fixedTop > 0 ? fixedTop : niceTop;
  const y = scaleLinear().domain([0, top]).range([plot.bottom, plot.top]);
  const x = scaleBand<string>()
    .domain(days.map((d) => d.date))
    .range([plot.left, plot.right])
    .padding(0.15);
  const bars = days.map((d) => ({
    x: round2(x(d.date) ?? plot.left),
    y: round2(y(d.count)),
    w: round2(x.bandwidth()),
    h: round2(plot.bottom - y(d.count)),
  }));
  return { bars, yTicks: yTicksFor(niceTop, g), max, top: niceTop };
}

/**
 * A path in plot pixels. `points` are in data units (`x` inside `xDomain`, `y` inside `[0, yMax]`). `digits(2)` keeps
 * the string byte-equal between the server render and the client.
 */
export function linePath(
  points: { x: number; y: number }[],
  xDomain: [number, number],
  yMax: number,
  step = false,
  g: ChartGeometry = WIDE,
): { d: string; end: { x: number; y: number } | null } {
  const last = points[points.length - 1];
  if (!last) return { d: '', end: null };
  const [x0, x1] = xDomain;
  const sx = scaleLinear()
    .domain(x1 > x0 ? [x0, x1] : [x0 - 0.5, x0 + 0.5])
    .range([g.plot.left, g.plot.right]);
  const sy = scaleLinear()
    .domain([0, yMax > 0 ? yMax : 1])
    .range([g.plot.bottom, g.plot.top]);
  const gen = line<{ x: number; y: number }>()
    .x((p) => sx(p.x))
    .y((p) => sy(p.y))
    .curve(step ? curveStepAfter : curveLinear)
    .digits(2);
  return { d: gen(points) ?? '', end: { x: round2(sx(last.x)), y: round2(sy(last.y)) } };
}

/** Hold the last value to the end of the domain, so a step line runs to "today" and not to its last event. */
export function extendStep(points: { x: number; y: number }[], xMax: number): { x: number; y: number }[] {
  const last = points[points.length - 1];
  if (!last || last.x >= xMax) return points;
  return [...points, { x: xMax, y: last.y }];
}

/** `count` evenly spaced integer ticks across the domain, in plot pixels. A one-point domain is one tick. */
export function xTicks(domain: [number, number], count: number, g: ChartGeometry = WIDE): { v: number; x: number }[] {
  const [a, b] = domain;
  const sx = scaleLinear()
    .domain(b > a ? [a, b] : [a - 0.5, a + 0.5])
    .range([g.plot.left, g.plot.right]);
  if (!(b > a) || count < 2) return [{ v: a, x: round2(sx(a)) }];
  const seen = new Set<number>();
  const out: { v: number; x: number }[] = [];
  for (let i = 0; i < count; i++) {
    const v = Math.round(a + ((b - a) * i) / (count - 1));
    if (seen.has(v)) continue;
    seen.add(v);
    out.push({ v, x: round2(sx(v)) });
  }
  return out;
}

/**
 * Place end labels so none sits closer than `minGap` to another and all stay inside `bounds`. Output order matches
 * input order. When the bounds cannot hold the gap the labels are spread evenly across them instead.
 */
export function spreadLabels(ys: number[], minGap: number, bounds: [number, number]): number[] {
  const [lo, hi] = bounds;
  const n = ys.length;
  if (n === 0) return [];
  const order = ys.map((_, i) => i).sort((a, b) => ys[a]! - ys[b]! || a - b);
  const out = new Array<number>(n);
  if (n > 1 && (hi - lo) / (n - 1) < minGap) {
    order.forEach((idx, rank) => {
      out[idx] = round2(lo + ((hi - lo) * rank) / (n - 1));
    });
    return out;
  }
  const pos = order.map((i) => Math.min(Math.max(ys[i]!, lo), hi));
  for (let i = 1; i < n; i++) pos[i] = Math.max(pos[i]!, pos[i - 1]! + minGap);
  if (pos[n - 1]! > hi) {
    pos[n - 1] = hi;
    for (let i = n - 2; i >= 0; i--) pos[i] = Math.min(pos[i]!, pos[i + 1]! - minGap);
  }
  order.forEach((idx, rank) => {
    out[idx] = round2(pos[rank]!);
  });
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Owner O7 (2026-11-23): zero start, calendar alignment, crosshair lookup and the scale tween. All pure.
 * ---------------------------------------------------------------------------------------------------------------- */

/**
 * A cumulative line rises from 0: prepend a zero at the start day (or at the first report, if that is earlier), so the
 * line does not begin mid-air at the first report. A step line then climbs vertically on a first-day report.
 */
export function withZeroStart(points: { x: number; y: number }[], startX: number): { x: number; y: number }[] {
  const first = points[0];
  if (!first) return [];
  return [{ x: Math.min(startX, first.x), y: 0 }, ...points];
}

/** The reference calendar the cycle overlay is drawn on: x 0 is June 1 of 2023 (the 2023-2024 cycle includes Feb 29). */
export const REFERENCE_DAY_ZERO = '2023-06-01';

/** The reference calendar date of overlay position `x` (days after June 1). */
export function calendarDate(x: number): string {
  return addUtcDays(REFERENCE_DAY_ZERO, x);
}

/**
 * The overlay position of `date` in the cycle that starts in `startYear` (its June 1 is `startYear-06-01`): the days
 * from June 1 to the date's month and day laid on the reference calendar. Cycles of different years therefore agree
 * on the calendar ("Jun 1" is x 0 in all of them, Mar 1 is the same x in a leap year and a plain one) and an event
 * before June 1 is a negative x. A Feb 29 on a plain reference year is Feb 28.
 */
export function calendarX(date: string, startYear: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return Number.NaN;
  const refYear = 2023 + (Number(m[1]) - startYear);
  const month = m[2]!;
  let dom = m[3]!;
  if (month === '02' && dom === '29' && !(refYear % 4 === 0 && (refYear % 100 !== 0 || refYear % 400 === 0)))
    dom = '28';
  const ref = utcMs(`${refYear}-${month}-${dom}`);
  return Math.round((ref - utcMs(REFERENCE_DAY_ZERO)) / DAY_MS);
}

/**
 * One cycle's cumulative points (days since ITS day zero) on the shared calendar, starting at 0 on its own first day.
 * `cycleYear` is the entry year (2026 for 2025-2026), so the cycle starts in `cycleYear - 1`.
 */
export function cycleCalendarPoints(
  points: { day: number; cumulative: number }[],
  dayZeroOn: string,
  cycleYear: number,
): { x: number; y: number }[] {
  const startYear = cycleYear - 1;
  const mapped = points.map((p) => ({ x: calendarX(addUtcDays(dayZeroOn, p.day), startYear), y: p.cumulative }));
  return withZeroStart(mapped, calendarX(dayZeroOn, startYear));
}

/** Index of the position nearest `target` (ties to the earlier), or -1 for none. `positions` ascend. */
export function nearestIndex(positions: readonly number[], target: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const d = Math.abs(positions[i]! - target);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** Ease-out: fast first, settling. Clamped to [0, 1]. */
export function easeOutCubic(p: number): number {
  const t = clamp01(p);
  return 1 - (1 - t) ** 3;
}

/** Plot pixel of data x inside `domain` (a one-point domain is centred). */
export function plotX(x: number, domain: [number, number], g: ChartGeometry = WIDE): number {
  const [a, b] = domain;
  const sx = scaleLinear()
    .domain(b > a ? [a, b] : [a - 0.5, a + 0.5])
    .range([g.plot.left, g.plot.right]);
  return round2(sx(x));
}

/** Plot pixel of value `v` on a `[0, yMax]` axis. */
export function plotY(v: number, yMax: number, g: ChartGeometry = WIDE): number {
  const sy = scaleLinear()
    .domain([0, yMax > 0 ? yMax : 1])
    .range([g.plot.bottom, g.plot.top]);
  return round2(sy(v));
}

/** How far past the plot edge (as a fraction of the plot height) a tick still shows, fading out, while the scale moves. */
export const TICK_FADE = 0.12;

/**
 * The y axis while the scale tweens from `prevMax` to `nextMax`. `nowMax` is the scale in force this frame; ticks are
 * placed on it, so the gridlines glide with the lines. A tick both scales have stays solid, one only the new scale
 * has fades in with `p`, one only the old scale had fades out. Ticks the current scale pushes outside the plot are
 * dropped. `p` is the eased progress, 0 to 1.
 */
export function yTicksTween(
  prevMax: number,
  nextMax: number,
  p: number,
  nowMax: number,
  g: ChartGeometry = WIDE,
): { v: number; y: number; opacity: number }[] {
  const prev = new Set(yTicksFor(prevMax, g).map((t) => t.v));
  const next = new Set(yTicksFor(nextMax, g).map((t) => t.v));
  const values = [...new Set([...prev, ...next])].sort((a, b) => a - b);
  const out: { v: number; y: number; opacity: number }[] = [];
  for (const v of values) {
    const y = plotY(v, nowMax, g);
    // A tick the shrinking scale pushes past the plot edge fades with its distance from it instead of vanishing.
    const over = Math.max(g.plot.top - y, y - g.plot.bottom, 0);
    const edge = 1 - over / ((g.plot.bottom - g.plot.top) * TICK_FADE);
    if (edge <= 0) continue;
    const opacity = (prev.has(v) && next.has(v) ? 1 : next.has(v) ? p : 1 - p) * edge;
    const o = Math.min(Math.max(round2(opacity), 0), 1);
    if (o > 0) out.push({ v, y, opacity: o });
  }
  return out;
}
