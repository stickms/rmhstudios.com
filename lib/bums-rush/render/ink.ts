/**
 * Ink — every stroke in the game goes through this file.
 *
 * Two ideas do almost all of the work of making a canvas path look like a pen
 * on paper, and both are cheap enough to afford on every line:
 *
 * **The graphite under-pass.** Each stroke is drawn twice: once in
 * `--bum-graphite` at 40% alpha offset by (+1.5, +1.5) design px, then once in
 * `--bum-ink` on top. It reads as a pencil construction line the biro didn't
 * quite follow, and it is the single highest-value trick in the pipeline — 80%
 * of the "drawn" impression for the price of one extra fill.
 *
 * **The taper.** A stroke's width follows `1 - 0.35·|2t − 1|`, so it is widest
 * in the middle and thins at both ends: a pen lifting, not a rectangle
 * stopping. Canvas has no variable-width stroke, so a stroke here is a *fill*
 * of an outline built from per-vertex normals. That also means one fill call
 * per pass instead of N short `stroke()` calls, which is why an arm costs the
 * same as a straight line.
 *
 * Everything is written through module-level scratch buffers. The hot path
 * (four heads, eight arms, eight hands, ~40 particles, every frame) must not
 * allocate — a GC pause in a physics game reads as input lag (§17).
 */

import { RENDER } from '../constants';
import type { BoilField } from './boil';

/**
 * Ceiling on the points in a single stroke. An authored polygon is a handful of
 * points and a smoothed arm is a dozen; 512 is a wall, not a budget. Callers
 * over it are clamped rather than throwing, because a level that ships a
 * 600-point blob should render badly, not crash the game.
 */
export const MAX_STROKE_POINTS = 512;

const OUT_X = new Float64Array(MAX_STROKE_POINTS * 2);
const OUT_Y = new Float64Array(MAX_STROKE_POINTS * 2);
/** Resample target for {@link smoothPolyline}; shared with the arm renderer. */
const SMOOTH_X = new Float64Array(MAX_STROKE_POINTS);
const SMOOTH_Y = new Float64Array(MAX_STROKE_POINTS);

export interface StrokeOptions {
  /** Width at the middle of the stroke, in the current transform's units. */
  width: number;
  /** Stroke colour. Comes from a `BumPalette` field — never a literal. */
  color: string;
  /**
   * When set, width lerps `width → widthEnd` along the path instead of
   * tapering symmetrically. Arms use this: thick at the shoulder, thin at the
   * wrist, so the arm visibly whips rather than pulsing in the middle.
   */
  widthEnd?: number;
  /** Taper strength; defaults to `RENDER.STROKE_TAPER`. Ignored when `widthEnd` is set. */
  taper?: number;
  /** The pencil pass. Off for hairlines and for anything already faint. */
  graphite?: boolean;
  graphiteColor?: string;
  /** Overall alpha for both passes. */
  alpha?: number;
  /** Treat the point list as a closed ring. */
  closed?: boolean;
  /** Boil field + per-shape salt. Omit either to draw the path exactly as given. */
  boil?: BoilField;
  salt?: number;
  amplitude?: number;
}

/**
 * The §2.3 taper curve: 1 at the midpoint, `1 - taper` at both ends.
 * Exported because it is the one piece of stroke maths worth a unit test.
 */
export function taperWidth(t: number, width: number, taper: number = RENDER.STROKE_TAPER): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return width * (1 - taper * Math.abs(2 * clamped - 1));
}

function widthAt(t: number, o: StrokeOptions): number {
  if (o.widthEnd !== undefined) {
    const k = t < 0 ? 0 : t > 1 ? 1 : t;
    return o.width + (o.widthEnd - o.width) * k;
  }
  return taperWidth(t, o.width, o.taper);
}

/**
 * Build the fillable outline of a tapered stroke into the scratch buffers.
 * Returns the number of outline points written, or 0 if there is nothing to
 * draw. `ox`/`oy` shift the whole path — that is how the graphite pass is
 * offset without touching the context transform.
 */
function buildOutline(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count: number,
  o: StrokeOptions,
  ox: number,
  oy: number,
  closed: boolean,
): number {
  const n = Math.min(count, MAX_STROKE_POINTS);
  if (n < 2) return 0;
  const boil = o.boil;
  const amp = boil ? (o.amplitude ?? 0) : 0;
  const salt = o.salt ?? 0;

  // Previous unit normal, reused when a segment is degenerate. Without this a
  // repeated point (common in authored geometry) produces a NaN normal and the
  // whole path vanishes.
  let pnx = 0;
  let pny = -1;

  for (let i = 0; i < n; i++) {
    const bx = boil && amp !== 0 ? boil.dx(salt + i, amp) : 0;
    const by = boil && amp !== 0 ? boil.dy(salt + i, amp) : 0;
    const x = xs[i] + ox + bx;
    const y = ys[i] + oy + by;

    const prev = i === 0 ? (closed ? n - 1 : 0) : i - 1;
    const next = i === n - 1 ? (closed ? 0 : n - 1) : i + 1;
    let tx = xs[next] - xs[prev];
    let ty = ys[next] - ys[prev];
    const len = Math.hypot(tx, ty);
    let nx: number;
    let ny: number;
    if (len > 1e-6) {
      tx /= len;
      ty /= len;
      nx = -ty;
      ny = tx;
      pnx = nx;
      pny = ny;
    } else {
      nx = pnx;
      ny = pny;
    }

    const t = closed ? 0.5 : i / (n - 1);
    const half = widthAt(t, o) * 0.5;
    OUT_X[i] = x + nx * half;
    OUT_Y[i] = y + ny * half;
    // The return side is written back-to-front so the two sides join into one
    // ring with no crossing edge.
    OUT_X[2 * n - 1 - i] = x - nx * half;
    OUT_Y[2 * n - 1 - i] = y - ny * half;
  }
  return 2 * n;
}

function fillOutline(ctx: CanvasRenderingContext2D, count: number, closed: boolean): void {
  ctx.beginPath();
  if (closed) {
    // Two rings, outer then inner, filled even-odd: a closed tapered stroke is
    // an annulus, and a single ring would fill the interior too.
    const half = count / 2;
    ctx.moveTo(OUT_X[0], OUT_Y[0]);
    for (let i = 1; i < half; i++) ctx.lineTo(OUT_X[i], OUT_Y[i]);
    ctx.closePath();
    ctx.moveTo(OUT_X[half], OUT_Y[half]);
    for (let i = half + 1; i < count; i++) ctx.lineTo(OUT_X[i], OUT_Y[i]);
    ctx.closePath();
    ctx.fill('evenodd');
    return;
  }
  ctx.moveTo(OUT_X[0], OUT_Y[0]);
  for (let i = 1; i < count; i++) ctx.lineTo(OUT_X[i], OUT_Y[i]);
  ctx.closePath();
  ctx.fill();
}

/** Draw a tapered polyline: graphite under-pass, then ink. */
export function inkStroke(
  ctx: CanvasRenderingContext2D,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count: number,
  o: StrokeOptions,
): void {
  strokeInternal(ctx, xs, ys, count, o, false);
}

/**
 * `forceClosed` exists so {@link inkPolygon} can reuse the caller's options
 * object instead of spreading a copy of it. Cheap per call, and this is called
 * a few hundred times a frame.
 */
function strokeInternal(
  ctx: CanvasRenderingContext2D,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count: number,
  o: StrokeOptions,
  forceClosed: boolean,
): void {
  const closed = forceClosed || o.closed === true;
  const alpha = o.alpha ?? 1;
  if (alpha <= 0 || o.width <= 0) return;

  if (o.graphite !== false && o.graphiteColor) {
    const n = buildOutline(
      xs,
      ys,
      count,
      o,
      RENDER.GRAPHITE_OFFSET,
      RENDER.GRAPHITE_OFFSET,
      closed,
    );
    if (n > 0) {
      ctx.globalAlpha = alpha * RENDER.GRAPHITE_ALPHA;
      ctx.fillStyle = o.graphiteColor;
      fillOutline(ctx, n, closed);
    }
  }
  const n = buildOutline(xs, ys, count, o, 0, 0, closed);
  if (n === 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = o.color;
  fillOutline(ctx, n, closed);
  ctx.globalAlpha = 1;
}

/** Two-point convenience wrapper — margin rules, tape edges, laser beams. */
const LINE_X = new Float64Array(2);
const LINE_Y = new Float64Array(2);
export function inkLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  o: StrokeOptions,
): void {
  LINE_X[0] = x0;
  LINE_Y[0] = y0;
  LINE_X[1] = x1;
  LINE_Y[1] = y1;
  inkStroke(ctx, LINE_X, LINE_Y, 2, o);
}

export interface ShapeOptions extends StrokeOptions {
  /** Interior fill — a material pattern from `patterns.ts`, or a flat colour. */
  fill?: string | CanvasPattern | null;
  /**
   * Fills are never flat (§2.3): the pattern is composited at `multiply` so it
   * darkens the paper rather than covering it. Inverted (dark-paper) worlds
   * pass `'screen'` instead — multiply over near-black draws nothing.
   */
  fillComposite?: GlobalCompositeOperation;
  fillAlpha?: number;
}

/** Trace a closed point ring into the current path, with the boil applied. */
function tracePolygon(
  ctx: CanvasRenderingContext2D,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count: number,
  o: StrokeOptions,
): void {
  const n = Math.min(count, MAX_STROKE_POINTS);
  const boil = o.boil;
  const amp = boil ? (o.amplitude ?? 0) : 0;
  const salt = o.salt ?? 0;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xs[i] + (boil && amp !== 0 ? boil.dx(salt + i, amp) : 0);
    const y = ys[i] + (boil && amp !== 0 ? boil.dy(salt + i, amp) : 0);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** A closed ink shape: patterned interior, then the tapered outline. */
export function inkPolygon(
  ctx: CanvasRenderingContext2D,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count: number,
  o: ShapeOptions,
): void {
  if (count < 3) return;
  if (o.fill) {
    tracePolygon(ctx, xs, ys, count, o);
    const composite = o.fillComposite ?? 'multiply';
    const previous = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = composite;
    ctx.globalAlpha = o.fillAlpha ?? 1;
    ctx.fillStyle = o.fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = previous;
  }
  strokeInternal(ctx, xs, ys, count, o, true);
}

/**
 * Resample a coarse polyline into a smooth one through Catmull-Rom, writing
 * into shared scratch buffers. Arms are four physics segments; drawn raw they
 * read as a folding ruler, and drawn smoothed they read as an arm whipping.
 *
 * Returns the resampled count; the points live in {@link smoothedX} /
 * {@link smoothedY} until the next call, which is fine because nothing here
 * interleaves two smoothing passes.
 */
export function smoothPolyline(
  points: readonly { x: number; y: number }[],
  perSegment = 3,
): number {
  const n = points.length;
  if (n === 0) return 0;
  if (n === 1) {
    SMOOTH_X[0] = points[0].x;
    SMOOTH_Y[0] = points[0].y;
    return 1;
  }
  const steps = Math.max(1, perSegment);
  let out = 0;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < n ? i + 2 : n - 1];
    const last = i === n - 2;
    const count = last ? steps + 1 : steps;
    for (let s = 0; s < count && out < MAX_STROKE_POINTS; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      SMOOTH_X[out] =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      SMOOTH_Y[out] =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out++;
    }
  }
  return out;
}

export const smoothedX: Float64Array = SMOOTH_X;
export const smoothedY: Float64Array = SMOOTH_Y;

/**
 * A circle that was drawn by hand: sampled to `segments` points so the boil can
 * push each one, and closed with a tapered outline like any other stroke.
 */
const CIRCLE_X = new Float64Array(64);
const CIRCLE_Y = new Float64Array(64);
export function inkCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  o: ShapeOptions,
  segments = 20,
): void {
  const n = Math.min(segments, CIRCLE_X.length);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    CIRCLE_X[i] = cx + Math.cos(a) * r;
    CIRCLE_Y[i] = cy + Math.sin(a) * r;
  }
  inkPolygon(ctx, CIRCLE_X, CIRCLE_Y, n, o);
}

/**
 * An open arc — mouths, eyebrows, the tape's curl. Cheaper than a full circle
 * and the taper makes both ends read as pen lifts.
 */
export function inkArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  o: StrokeOptions,
  segments = 8,
): void {
  const n = Math.max(2, Math.min(segments, CIRCLE_X.length));
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * i) / (n - 1);
    CIRCLE_X[i] = cx + Math.cos(a) * r;
    CIRCLE_Y[i] = cy + Math.sin(a) * r;
  }
  inkStroke(ctx, CIRCLE_X, CIRCLE_Y, n, o);
}

/**
 * A filled blot with no outline — ink splats, dots, pupils. Uses a radius
 * function so the same primitive draws a clean dot and a ragged blot.
 */
export function inkBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radii: ArrayLike<number>,
  count: number,
  rotation: number,
  scale: number,
  color: string,
  alpha = 1,
): void {
  if (count < 3) return;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = rotation + (i / count) * Math.PI * 2;
    const r = radii[i] * scale;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}
