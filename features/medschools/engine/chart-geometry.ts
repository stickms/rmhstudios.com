import { scaleBand, scaleLinear } from 'd3-scale';
import { curveLinear, curveStepAfter, line } from 'd3-shape';

/**
 * Pure chart geometry (Phase 3 Task 5, D2). The ONLY module that imports `d3-*`: every output is plain numbers and
 * strings, so the React charts in `ui/charts/` draw SVG without a d3 type crossing the boundary, and a route module
 * that never imports the charts never pulls d3 into the shared entry (`scripts/check-entry-composition.ts`).
 * No DOM, no viewer time zone: a `YYYY-MM-DD` here is a UTC calendar day.
 */

export const CHART_W = 640;
export const CHART_H = 240;
/** The plot rectangle inside the viewBox; the right margin holds the direct end labels. */
export const PLOT = { left: 40, right: 500, top: 12, bottom: 212 } as const;

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
export function yTicksFor(yMax: number): { v: number; y: number }[] {
  const y = scaleLinear()
    .domain([0, yMax > 0 ? yMax : 1])
    .range([PLOT.bottom, PLOT.top]);
  return y.ticks(4).map((v) => ({ v, y: round2(y(v)) }));
}

/** `extraMax` lets comparison series share the scale: bars and lines are drawn against one y axis. */
export function barsGeometry(
  days: Day[],
  extraMax = 0,
): { bars: { x: number; y: number; w: number; h: number }[]; yTicks: { v: number; y: number }[]; max: number } {
  const max = days.reduce((m, d) => Math.max(m, d.count), 0);
  const top = niceMax(Math.max(max, extraMax));
  const y = scaleLinear().domain([0, top]).range([PLOT.bottom, PLOT.top]);
  const x = scaleBand<string>()
    .domain(days.map((d) => d.date))
    .range([PLOT.left, PLOT.right])
    .padding(0.15);
  const bars = days.map((d) => ({
    x: round2(x(d.date) ?? PLOT.left),
    y: round2(y(d.count)),
    w: round2(x.bandwidth()),
    h: round2(PLOT.bottom - y(d.count)),
  }));
  return { bars, yTicks: yTicksFor(top), max };
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
): { d: string; end: { x: number; y: number } | null } {
  const last = points[points.length - 1];
  if (!last) return { d: '', end: null };
  const [x0, x1] = xDomain;
  const sx = scaleLinear()
    .domain(x1 > x0 ? [x0, x1] : [x0 - 0.5, x0 + 0.5])
    .range([PLOT.left, PLOT.right]);
  const sy = scaleLinear()
    .domain([0, yMax > 0 ? yMax : 1])
    .range([PLOT.bottom, PLOT.top]);
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
export function xTicks(domain: [number, number], count: number): { v: number; x: number }[] {
  const [a, b] = domain;
  const sx = scaleLinear()
    .domain(b > a ? [a, b] : [a - 0.5, a + 0.5])
    .range([PLOT.left, PLOT.right]);
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
