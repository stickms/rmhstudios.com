/**
 * The hall loft — how a {@link HallSpec} becomes a surface.
 *
 * A datacenter hall is a box, and a box is where the interesting claim is: the
 * RMH family of cars, RMH Fashion's figure and the navigation globe are all one
 * closed genus-0 surface, and this had to join them rather than be a stack of
 * rectangles that merely looks like a building. So the hall is lofted through
 * the same `lib/loft/grid.ts` every other surface on this site uses, with both
 * ends closed to poles — which makes it, in the exact sense `topologyOf`
 * measures, a sphere. `__tests__/hall-hull.test.ts` is the arithmetic.
 *
 * "A box that is a sphere" is not a pun. Genus is what survives bending: the
 * hall has no door punched through it, no duct running in one wall and out the
 * other, and no handle — and each of those would be a hole, which is the one
 * thing that would stop it being the same surface as the globe. The squareness
 * comes from the superellipse exponent, not from the topology.
 *
 * Nothing here imports three.js, React or the DOM: the geometry is testable on
 * its own, and the wireframe below is projected in plain arithmetic so a page
 * can draw the hall without shipping a renderer to do it.
 */

import { loft, monotoneSpline, type LoftGrid, type LoftStation } from '@/lib/loft/grid';

/** What a hall is, in the numbers a facilities drawing would carry. */
export interface HallSpec {
  /** Along the cold aisle, in metres. */
  length: number;
  /** Across, in metres. */
  width: number;
  /** Slab to roof, in metres. */
  height: number;
  /**
   * Superellipse exponent at the body. 2 is an ellipse; 5–7 reads as a
   * building. It squares the section off without changing what the surface is.
   */
  square: number;
  /**
   * Roof taper as a fraction of the half-width — the loft's `crown`. A hall's
   * plant deck is narrower than its floor, which is what stops the section
   * reading as an extruded rectangle.
   */
  pitch: number;
}

/**
 * Rings along the aisle. 26 puts one roughly every 3.5 m on a 90 m hall — close
 * enough that the ribs read as bays, far enough that the whole thing is a few
 * hundred polylines rather than a few thousand.
 */
export const HALL_STATIONS = 26;
/** Points around each section. Divisible by four (see the loft). */
export const HALL_SAMPLES = 24;

/**
 * The length profile, as a fraction of full section.
 *
 * Zero at both ends — that is the pole, and the whole topological claim — but
 * it reaches full within a twentieth of the length, so the ends read as gables
 * rather than as the cones a linear taper would give. Monotone, so the widest
 * point of a hall is a number somebody wrote down rather than an overshoot.
 */
const PROFILE_T = [0, 0.018, 0.06, 0.5, 0.94, 0.982, 1] as const;
const PROFILE_V = [0, 0.88, 1, 1, 1, 0.88, 0] as const;

const profile = monotoneSpline([...PROFILE_T], [...PROFILE_V]);

/** The hall's cross-sections, poles included. */
export function hallStations(spec: HallSpec): LoftStation[] {
  const out: LoftStation[] = [];
  for (let i = 0; i < HALL_STATIONS; i++) {
    const t = i / (HALL_STATIONS - 1);
    // Exactly zero at the ends: a profile that merely rounds to zero leaves a
    // ring of distinct points where the pole should be, and the surface is then
    // a tube with two tiny mouths rather than a sphere.
    const p = i === 0 || i === HALL_STATIONS - 1 ? 0 : Math.max(0, profile(t));
    out.push({
      centre: [(t - 0.5) * spec.length, 0, 0],
      right: [0, 0, 1],
      up: [0, 1, 0],
      halfRight: (spec.width / 2) * p,
      halfUp: (spec.height / 2) * p,
      round: spec.square,
      crown: spec.pitch,
    });
  }
  return out;
}

/** The hall as one closed surface. */
export function hallHull(spec: HallSpec): LoftGrid {
  return loft(hallStations(spec), {
    samples: HALL_SAMPLES,
    ringEvery: 4,
    meridianEvery: 3,
  });
}

/* ── Projection ───────────────────────────────────────────────────────────── */

/** One drawn line of the cage, ready for an SVG `points` attribute. */
export interface HallWire {
  /** A ring around the hall (a bay), a line along it, or one of the four majors. */
  kind: 'bay' | 'run' | 'major';
  points: string;
  /** 0 furthest from the eye, 1 nearest. The page fades the far side with it. */
  depth: number;
}

export interface HallWireframe {
  wires: HallWire[];
  viewBox: string;
  /** Metres per viewBox unit, so a caller can label the drawing honestly. */
  scale: number;
}

export interface ProjectOptions {
  /** Turn about the vertical axis, radians. */
  yaw?: number;
  /** Tilt above the horizon, radians. */
  pitch?: number;
  /** Width of the returned viewBox. Height follows from the projection. */
  width?: number;
  /** Every Nth station gets a bay ring. */
  bayEvery?: number;
  /** Every Nth sample gets a run line. */
  runEvery?: number;
  /** Slack around the geometry, in viewBox units, so strokes are not clipped. */
  pad?: number;
}

/**
 * Orthographic, from one fixed direction.
 *
 * The site's glass answers a static sun and nothing tracks the cursor
 * (design-language §5.1.1), so the hall is drawn from a decided angle rather
 * than an interactive one. Orthographic rather than perspective because this is
 * a facilities drawing: parallel lines in the hall stay parallel on the page,
 * which is the whole convention a general arrangement is read under.
 */
export function hallWireframe(spec: HallSpec, options: ProjectOptions = {}): HallWireframe {
  const yaw = options.yaw ?? -0.62;
  const pitch = options.pitch ?? 0.34;
  const width = options.width ?? 1000;
  const bayEvery = options.bayEvery ?? 3;
  const runEvery = options.runEvery ?? 3;

  const grid = hallHull(spec);
  const { positions, stations, samples } = grid;

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // Screen x/y plus a depth along the view direction, for one model point.
  const project = (v: number): [number, number, number] => {
    const x = positions[v * 3] - grid.centre[0];
    const y = positions[v * 3 + 1] - grid.centre[1];
    const z = positions[v * 3 + 2] - grid.centre[2];
    const rx = x * cy + z * sy;
    const rz = -x * sy + z * cy;
    return [rx, y * cp - rz * sp, y * sp + rz * cp];
  };

  const flat: [number, number, number][] = [];
  for (let v = 0; v < positions.length / 3; v++) flat.push(project(v));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minD = Infinity;
  let maxD = -Infinity;
  for (const [px, py, pd] of flat) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
    minD = Math.min(minD, pd);
    maxD = Math.max(maxD, pd);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const spanD = maxD - minD || 1;
  // A stroke sits astride its path, so a viewBox fitted exactly to the geometry
  // clips the outermost line down its centre. The pad is in viewBox units and
  // is generous enough for the majors' width at any sane render size.
  const pad = options.pad ?? 12;
  const k = (width - pad * 2) / spanX;
  const height = spanY * k + pad * 2;

  const at = (v: number): [number, number, number] => {
    const [px, py, pd] = flat[v];
    // SVG y grows downward; the model's does not.
    return [pad + (px - minX) * k, height - pad - (py - minY) * k, (pd - minD) / spanD];
  };

  const wires: HallWire[] = [];
  const emit = (kind: HallWire['kind'], vs: number[]) => {
    let depth = 0;
    let points = '';
    for (const v of vs) {
      const [px, py, pd] = at(v);
      depth += pd;
      points += `${points ? ' ' : ''}${px.toFixed(1)},${py.toFixed(1)}`;
    }
    wires.push({ kind, points, depth: depth / vs.length });
  };

  // Bays: a ring at every Nth station, poles excluded — a ring there is one
  // point repeated `samples` times, which draws nothing and reads as a stray
  // dot at whatever stroke width it is given.
  for (let s = 1; s < stations - 1; s++) {
    if (s % bayEvery !== 0 && s !== 1 && s !== stations - 2) continue;
    const ring: number[] = [];
    for (let r = 0; r <= samples; r++) ring.push(s * samples + (r % samples));
    emit('bay', ring);
  }

  // Runs: a line along the hall at every Nth sample. The four cardinals — the
  // eaves, the ridge and the two waists — are the majors, exactly as the cage
  // names them, so the drawing has the same three ink tiers as the glass.
  const majors = new Set([0, samples / 4, samples / 2, (3 * samples) / 4]);
  for (let r = 0; r < samples; r++) {
    if (!majors.has(r) && r % runEvery !== 0) continue;
    const run: number[] = [];
    for (let s = 0; s < stations; s++) run.push(s * samples + r);
    emit(majors.has(r) ? 'major' : 'run', run);
  }

  return {
    wires,
    viewBox: `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`,
    scale: spanX / (width - pad * 2),
  };
}
