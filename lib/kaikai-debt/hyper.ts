/**
 * Four-dimensional geometry for the debt ledger. Client-safe, pure, testable.
 *
 * ## Why a fourth dimension is not a gimmick here
 *
 * Every row on the books carries at least five independent measures — when it
 * was logged, what it cost, what it has compounded into since, what kind of debt
 * it is, and how many like it there are. A scatter plot shows two of those. A 3D
 * plot shows three and spends its whole depth budget doing it. The ledger simply
 * has more structure than a screen has axes, and the honest options are to throw
 * measures away or to plot in the space the data actually lives in and project
 * down.
 *
 * This module does the second thing. Points live in **R⁴**, are rotated by
 * genuine 4D rotations, and are then projected twice:
 *
 * ```
 *   R⁴  ──(rotate in six planes)──▶  R⁴  ──(perspective on w)──▶  R³  ──(camera)──▶  screen
 * ```
 *
 * The first projection is where the fourth dimension becomes visible: a point
 * further along `w` is *further away in a direction that is not on the screen*,
 * so it shrinks and dims exactly as depth does in 3D — and when a rotation in
 * one of the three `w` planes runs, points swap between "near in w" and "far in
 * w", which is the turning-inside-out effect that has no 3D analogue.
 *
 * ## Six planes, not three axes
 *
 * A rotation in n dimensions is not about an axis — that is a coincidence of
 * n = 3, where the plane of rotation happens to have a unique normal. A rotation
 * is about a **plane**, and R⁴ has six of them: `xy`, `xz`, `xw`, `yz`, `yw`,
 * `zw`. The first three behave like familiar 3D rotations (they leave `w`
 * alone); the last three are the ones with no intuition attached, and they are
 * the ones the panel gives its own controls to.
 *
 * The composition order below is fixed and documented rather than chosen per
 * call, because 4D rotations do not commute and a viewer dragging two sliders
 * needs the same drag to produce the same orientation every time.
 */

import { CATEGORY_ORDER, valueNow, type GridFrame } from './stats';

/* -------------------------------------------------------------------------- */
/* Vectors                                                                    */
/* -------------------------------------------------------------------------- */

export interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A point projected all the way to the screen, with what it lost on the way. */
export interface Projected {
  /** Screen offsets from the centre, in the caller's units. */
  x: number;
  y: number;
  /** Depth in R³ after the w-projection — the painter's-algorithm sort key. */
  depth: number;
  /**
   * Combined scale from BOTH projections. A mark drawn at this size is
   * foreshortened correctly in three dimensions and in the fourth.
   */
  scale: number;
  /**
   * Where the point sits along `w` after rotation, normalised to roughly
   * `[-1, 1]`. This is the only channel that carries the fourth dimension when
   * the projection is frozen, so the renderer maps it to opacity as well —
   * "further out in w" reads as "further into the haze".
   */
  w: number;
}

/* -------------------------------------------------------------------------- */
/* Rotation                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The six rotation planes of R⁴, in the order they are composed.
 *
 * `xy`, `xz` and `yz` are the ordinary ones — they fix `w` and look exactly like
 * turning a 3D object. `xw`, `yw` and `zw` are the ones that make the shape
 * appear to turn inside out, because they exchange a visible axis with the
 * invisible one.
 */
export const ROTATION_PLANES = ['xy', 'xz', 'yz', 'xw', 'yw', 'zw'] as const;
export type RotationPlane = (typeof ROTATION_PLANES)[number];

/** Angles in radians, one per plane. */
export type Rotation4 = Record<RotationPlane, number>;

export function identityRotation(): Rotation4 {
  return { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 };
}

/** Which two coordinates each plane mixes. */
const PLANE_AXES: Record<RotationPlane, [keyof Vec4, keyof Vec4]> = {
  xy: ['x', 'y'],
  xz: ['x', 'z'],
  yz: ['y', 'z'],
  xw: ['x', 'w'],
  yw: ['y', 'w'],
  zw: ['z', 'w'],
};

/**
 * Rotate a point through all six planes, in {@link ROTATION_PLANES} order.
 *
 * Each step is a plain 2D rotation of the two coordinates the plane names,
 * leaving the other two untouched — which is the definition, not a
 * simplification. Composing them in a fixed order is what makes the six sliders
 * a coordinate system a viewer can learn: the same six numbers always mean the
 * same orientation.
 *
 * Mutates nothing; the loop copies into a scratch object so a caller can rotate
 * thousands of points a frame without allocating.
 */
export function rotate4(point: Vec4, rotation: Rotation4, out?: Vec4): Vec4 {
  const result = out ?? { x: 0, y: 0, z: 0, w: 0 };
  result.x = point.x;
  result.y = point.y;
  result.z = point.z;
  result.w = point.w;

  for (const plane of ROTATION_PLANES) {
    const angle = rotation[plane];
    if (angle === 0) continue;
    const [a, b] = PLANE_AXES[plane];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const va = result[a];
    const vb = result[b];
    result[a] = va * cos - vb * sin;
    result[b] = va * sin + vb * cos;
  }
  return result;
}

/**
 * Step every plane's angle forward by its own rate.
 *
 * Kept here rather than in the component so the animation is the same pure
 * function the tests exercise — a 4D rotation that only exists inside a frame
 * loop is a 4D rotation nobody can check.
 */
export function advanceRotation(
  rotation: Rotation4,
  ratesPerSecond: Partial<Rotation4>,
  dtSeconds: number,
): Rotation4 {
  const next = { ...rotation };
  const TAU = Math.PI * 2;
  for (const plane of ROTATION_PLANES) {
    const rate = ratesPerSecond[plane] ?? 0;
    if (rate === 0) continue;
    // Wrapped, so a tab left open overnight does not accumulate a float big
    // enough for `Math.sin` to lose precision on.
    next[plane] = (next[plane] + rate * dtSeconds) % TAU;
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Projection                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How far the 4D "eye" sits along the w axis, in the same units the data is
 * normalised to (roughly `[-1, 1]`).
 *
 * At 2.6 a point at `w = 1` is drawn about 44% smaller than one at `w = -1`,
 * which is a strong enough cue to read as depth without the far side of the
 * cloud collapsing to a dot. Below ~1.6 points can reach the eye plane and the
 * projection blows up, which is why the divisor is clamped.
 */
export const W_DISTANCE = 2.6;

/**
 * How far the 3D camera sits along z, in the same normalised units. Slightly
 * further out than the 4D eye so the two foreshortenings are distinguishable —
 * if they matched, a `zw` rotation would look like nothing was happening.
 */
export const Z_DISTANCE = 3.4;

/**
 * R⁴ → R³ by perspective divide on `w`.
 *
 * The same operation a 3D renderer performs on `z`, one dimension up. This is
 * the step that turns "four numbers" into something a screen can eventually
 * show, and the reason a tesseract renders as a cube inside a cube: the inner
 * cube is not smaller, it is *further away along w*.
 */
export function project4to3(point: Vec4, distance = W_DISTANCE): Vec3 & { scale: number } {
  // Clamped so a point at or past the eye cannot divide by zero or flip sign —
  // one such point is a mark that jumps across the screen for a single frame.
  const denominator = Math.max(0.35, distance - point.w);
  const scale = distance / denominator;
  return { x: point.x * scale, y: point.y * scale, z: point.z * scale, scale };
}

/** R³ → screen, by the same perspective divide on `z`. */
export function project3to2(
  point: Vec3,
  distance = Z_DISTANCE,
  radius = 1,
): { x: number; y: number; scale: number } {
  const denominator = Math.max(0.35, distance - point.z);
  const scale = distance / denominator;
  return { x: point.x * scale * radius, y: point.y * scale * radius, scale };
}

/**
 * The whole pipeline for one point: rotate in 4D, project to 3D, project to the
 * screen.
 *
 * `radius` is half the drawing area, so `x`/`y` come back as pixel offsets from
 * its centre. `out`/`scratch` let a renderer run this over a few thousand points
 * a frame without allocating anything — the same discipline the navigation
 * globe's cage follows.
 */
export function projectPoint(
  point: Vec4,
  rotation: Rotation4,
  radius: number,
  scratch?: Vec4,
): Projected {
  const rotated = rotate4(point, rotation, scratch);
  const three = project4to3(rotated);
  const screen = project3to2(three, Z_DISTANCE, radius);
  return {
    x: screen.x,
    // NEGATED, once, here: canvas y grows downward and the data's y axis grows
    // upward, so a point with more of whatever `y` is bound to has to be drawn
    // HIGHER. Doing it in the pipeline rather than at each draw site is what
    // keeps the tesseract frame and the cloud in the same space — flipping only
    // the points would slide the data off the ruler it is measured against.
    y: -screen.y,
    depth: three.z,
    scale: three.scale * screen.scale,
    w: rotated.w,
  };
}

/* -------------------------------------------------------------------------- */
/* The tesseract                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The 16 vertices of a unit tesseract, at every combination of ±1.
 *
 * Drawn as the *frame* the data sits inside. Without it the cloud is a shapeless
 * fog and the fourth dimension is invisible — you cannot see that a rotation is
 * happening in `xw` unless something with known, rigid structure is being
 * rotated alongside the points. The tesseract is the ruler.
 */
export const TESSERACT_VERTICES: readonly Vec4[] = (() => {
  const out: Vec4[] = [];
  for (let i = 0; i < 16; i++) {
    out.push({
      x: i & 1 ? 1 : -1,
      y: i & 2 ? 1 : -1,
      z: i & 4 ? 1 : -1,
      w: i & 8 ? 1 : -1,
    });
  }
  return out;
})();

/**
 * Its 32 edges: two vertices are joined exactly when their indices differ in a
 * single bit, i.e. when they differ in exactly one coordinate.
 *
 * Derived rather than typed out, because a hand-written edge list with one entry
 * wrong is a shape that is subtly not a tesseract and nobody can tell by
 * looking.
 */
export const TESSERACT_EDGES: readonly [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let a = 0; a < 16; a++) {
    for (let bit = 0; bit < 4; bit++) {
      const b = a ^ (1 << bit);
      if (b > a) out.push([a, b]);
    }
  }
  return out;
})();

/**
 * Which of the four coordinates an edge runs along — 0 = x … 3 = w.
 *
 * The renderer colours edges by this, so the `w` edges (the ones connecting the
 * "inner" cube to the "outer" one) are visually distinct from the twenty-four
 * ordinary ones. That is what makes the inside-out rotation legible instead of
 * merely busy.
 */
export function edgeAxis(edge: readonly [number, number]): 0 | 1 | 2 | 3 {
  const diff = edge[0] ^ edge[1];
  return (diff === 1 ? 0 : diff === 2 ? 1 : diff === 4 ? 2 : 3) as 0 | 1 | 2 | 3;
}

/* -------------------------------------------------------------------------- */
/* Putting the ledger into R⁴                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The measures a 4D axis can be bound to.
 *
 * Six of them for four axes, chosen by the viewer, which is what makes the view
 * an instrument rather than a picture: the same cloud under a different binding
 * answers a different question. They are all *per grid cell* — a
 * (month × category) bucket — because that is the shape the stats payload
 * carries and the same grid the 3D terrain and the globe are drawn from.
 */
export const HYPER_MEASURES = [
  'time',
  'category',
  'count',
  'principal',
  'accrued',
  'average',
] as const;
export type HyperMeasure = (typeof HYPER_MEASURES)[number];

/** One cell of the (month × category) grid, reduced to its six measures. */
export interface HyperDatum {
  /** Normalised to `[-1, 1]` in the same order as {@link HYPER_MEASURES}. */
  measures: Record<HyperMeasure, number>;
  /** Palette slot — the category index, so colour survives every rebinding. */
  categoryIndex: number;
  /** Everything the tooltip needs, carried along unnormalised. */
  label: { startMs: number; category: string; count: number; principalCents: number; accruedCents: number };
}

/**
 * Map a datum onto R⁴ under an axis binding.
 *
 * Trivial by design: all the work of normalising happened once when the data was
 * built, so switching an axis is a re-read of a record rather than a re-scan of
 * the ledger, and a slider drag stays at frame rate.
 */
export function toVec4(
  datum: HyperDatum,
  binding: { x: HyperMeasure; y: HyperMeasure; z: HyperMeasure; w: HyperMeasure },
): Vec4 {
  return {
    x: datum.measures[binding.x],
    y: datum.measures[binding.y],
    z: datum.measures[binding.z],
    w: datum.measures[binding.w],
  };
}

/**
 * Normalise a value into `[-1, 1]` against a domain, log-first when asked.
 *
 * Money and counts on this page span orders of magnitude, so a linear
 * normalisation puts the entire cloud in one corner of the tesseract and leaves
 * the rest of the volume empty — the same reason the histogram's buckets are
 * log-spaced. A degenerate domain (every value identical) maps to the centre
 * rather than dividing by zero.
 */
export function normalise(value: number, min: number, max: number, log = false): number {
  // The degenerate check comes FIRST, before the log branch's floors get a
  // chance to invent a range that is not there: `max(10, max)` would turn a
  // one-valued dimension into a real interval and pin every point to its
  // extreme, which reads as "all of these are the minimum" rather than as
  // "this axis does not distinguish them".
  if (max <= min) return 0;
  if (log) {
    const lo = Math.log10(Math.max(1, min));
    const hi = Math.log10(Math.max(10, max));
    if (hi <= lo) return 0;
    return ((Math.log10(Math.max(1, value)) - lo) / (hi - lo)) * 2 - 1;
  }
  return ((value - min) / (max - min)) * 2 - 1;
}

/**
 * Turn the shared (month × category) grid into a 4D point cloud.
 *
 * Empty cells are dropped rather than plotted at the origin: an empty bucket is
 * an absence of debt, and a point at the centre of the tesseract asserts the
 * opposite — that there is a thing there, of average everything. The 3D terrain
 * *does* keep them (a hole in a surface is meaningful), which is exactly why
 * each view densifies the grid its own way rather than sharing one flattening.
 *
 * `atMs` enters through the accrued measure, so the cloud's shape keeps drifting
 * while it is watched: the older buckets pull further along their axis as their
 * compounding runs ahead of the newer ones.
 */
export function buildHyperData(frame: GridFrame, atMs: number): HyperDatum[] {
  const categoryCount = Math.max(1, frame.categories.length);
  const monthCount = Math.max(1, frame.months.length);

  /* Pass 1 — the raw measures, plus what range each one actually occupies. */
  interface Raw {
    categoryIndex: number;
    raw: Record<HyperMeasure, number>;
    label: HyperDatum['label'];
  }
  const raws: Raw[] = [];
  for (let i = 0; i < frame.cells.length; i++) {
    const cell = frame.cells[i]!;
    if (cell.count === 0) continue;
    const categoryIndex = CATEGORY_ORDER.indexOf(cell.category);
    const accrued = valueNow(cell, atMs);
    raws.push({
      categoryIndex: categoryIndex < 0 ? CATEGORY_ORDER.length - 1 : categoryIndex,
      raw: {
        time: Math.floor(i / categoryCount),
        category: categoryIndex < 0 ? categoryCount - 1 : categoryIndex,
        count: cell.count,
        principal: cell.principalCents,
        accrued,
        average: cell.principalCents / Math.max(1, cell.count),
      },
      label: {
        startMs: cell.startMs,
        category: cell.category,
        count: cell.count,
        principalCents: cell.principalCents,
        accruedCents: accrued,
      },
    });
  }

  /**
   * Pass 2 — normalise each measure against the range **the cloud actually
   * occupies**, not against an absolute floor.
   *
   * This is the difference between a scatter plot and a smudge. Normalising
   * money against `[1 cent, the maximum]` sounds principled and puts every point
   * in the top fifth of the axis, because the buckets are all within an order of
   * magnitude of each other and none of them is anywhere near a cent. The
   * tesseract then contains one dense clot and a great deal of empty volume, and
   * the fourth dimension — whose only channels are size and brightness — carries
   * no visible variation at all.
   *
   * Against the observed extent, the same data fills the cube and the
   * differences between buckets become the thing you can see, which is the
   * entire job of the view.
   */
  const measures = HYPER_MEASURES;
  const extent = {} as Record<HyperMeasure, { min: number; max: number }>;
  for (const measure of measures) {
    let min = Infinity;
    let max = -Infinity;
    for (const item of raws) {
      const value = item.raw[measure];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    extent[measure] = raws.length === 0 ? { min: 0, max: 0 } : { min, max };
  }

  // `time` and `category` are positional indices, so they are normalised over
  // the whole axis rather than over the occupied part: a month with nothing in
  // it is still a month, and squeezing it out would make the time axis lie.
  extent.time = { min: 0, max: Math.max(0, monthCount - 1) };
  extent.category = { min: 0, max: Math.max(0, categoryCount - 1) };

  /** Money and counts stay log-scaled; the two positional axes are linear. */
  const isLog = (measure: HyperMeasure) => measure !== 'time' && measure !== 'category';

  return raws.map((item) => ({
    categoryIndex: item.categoryIndex,
    measures: Object.fromEntries(
      measures.map((measure) => [
        measure,
        normalise(item.raw[measure], extent[measure].min, extent[measure].max, isLog(measure)),
      ]),
    ) as Record<HyperMeasure, number>,
    label: item.label,
  }));
}

/** The binding the panel opens with — the one that best shows the archive's shape. */
export const DEFAULT_BINDING: {
  x: HyperMeasure;
  y: HyperMeasure;
  z: HyperMeasure;
  w: HyperMeasure;
} = { x: 'time', y: 'accrued', z: 'category', w: 'count' };

/**
 * Default rotation rates, in radians per second.
 *
 * Only the three `w` planes turn on their own, and slowly. The ordinary planes
 * are left at rest so the cloud keeps a stable "up" while the fourth dimension
 * is what is visibly moving — a shape tumbling in all six planes at once is
 * indistinguishable from noise, which defeats the entire point of drawing it.
 */
export const DEFAULT_RATES: Partial<Rotation4> = { xw: 0.19, yw: 0.11, zw: 0.07 };
