/**
 * The car loft — how a {@link CarBodySpec} becomes a surface.
 *
 * The grid itself is not built here. `lib/loft/grid.ts` owns the station × ring
 * loft, because a car body and a coat sleeve are the same surface with different
 * stations, and a second copy of that code is a second place for the ripple's
 * coordinates to drift. What lives here is everything CAR-specific: turning a
 * section list into stations along a straight axis, the running gear, and the
 * side elevation the picker and the no-WebGL fallback both draw.
 *
 * ## Why the sections read as they do
 *
 * `t` walks the body from nose to tail; the loft lays it out along −x so that +x
 * is the front. Sections are interpolated with a monotone cubic, so the widest
 * point of a car is a number somebody actually wrote down. The nose and tail
 * close to points, which makes them the poles every length-line converges on —
 * the navigation globe's topology, wearing a car.
 */

import {
  DEFAULT_SAMPLES,
  loft,
  monotoneSpline,
  type LoftGrid,
  type LoftStation,
} from '@/lib/loft/grid';
import { FLEET_HEIGHT, FLEET_RADIUS } from './cars';
import type { CarBodySpec, HullSection, RotorSpec } from './cars';

/**
 * Cross-sections lofted through the body, poles included. 44 puts a ring roughly
 * every 11 cm on a 4.6 m car — fine enough to read as a curve, coarse enough
 * that the whole hull is a few thousand vertices.
 */
export const STATIONS = 44;
/** Points around each section. Divisible by four (see the loft). */
export const SAMPLES = DEFAULT_SAMPLES;

/** The car's grid is the shared loft's grid; the alias is for readability. */
export type HullGrid = LoftGrid;

/* ── Section interpolation ────────────────────────────────────────────────── */

interface SectionSplines {
  halfWidth: (t: number) => number;
  top: (t: number) => number;
  floor: (t: number) => number;
  round: (t: number) => number;
  crown: (t: number) => number;
}

const SPLINE_CACHE = new WeakMap<CarBodySpec, SectionSplines>();

function splinesFor(spec: CarBodySpec): SectionSplines {
  const hit = SPLINE_CACHE.get(spec);
  if (hit) return hit;
  const ts = spec.sections.map((s) => s.t);
  const built: SectionSplines = {
    halfWidth: monotoneSpline(
      ts,
      spec.sections.map((s) => s.halfWidth),
    ),
    top: monotoneSpline(
      ts,
      spec.sections.map((s) => s.top),
    ),
    floor: monotoneSpline(
      ts,
      spec.sections.map((s) => s.floor),
    ),
    round: monotoneSpline(
      ts,
      spec.sections.map((s) => s.round),
    ),
    crown: monotoneSpline(
      ts,
      spec.sections.map((s) => s.crown),
    ),
  };
  SPLINE_CACHE.set(spec, built);
  return built;
}

/** The interpolated cross-section of `spec` at `t` (0 = nose, 1 = tail). */
export function sectionAt(spec: CarBodySpec, t: number): HullSection {
  const s = splinesFor(spec);
  return {
    t,
    halfWidth: Math.max(0, s.halfWidth(t)),
    top: s.top(t),
    floor: s.floor(t),
    round: Math.max(2, s.round(t)),
    crown: Math.max(0, s.crown(t)),
  };
}

/** Loft `spec` into a station × ring grid. Pure: same spec in, same arrays out. */
export function buildHull(spec: CarBodySpec): HullGrid {
  const splines = splinesFor(spec);
  const stations: LoftStation[] = [];
  for (let s = 0; s < STATIONS; s++) {
    const t = s / (STATIONS - 1);
    const top = splines.top(t);
    const floor = splines.floor(t);
    stations.push({
      // +x is the nose and `t` walks nose → tail, so the body is laid out from
      // +length/2 down to −length/2 and stays centred on the origin in x.
      centre: [spec.length * (0.5 - t), (top + floor) / 2, 0],
      right: [0, 0, 1],
      up: [0, 1, 0],
      halfRight: Math.max(0, splines.halfWidth(t)),
      halfUp: Math.max(0, (top - floor) / 2),
      round: Math.max(2, splines.round(t)),
      crown: Math.max(0, splines.crown(t)),
    });
  }
  return loft(stations, { samples: SAMPLES });
}

/* ── Running gear ─────────────────────────────────────────────────────────── */

export interface RingSet {
  /** Line-segment vertex pairs, already expanded — no index buffer. */
  positions: Float32Array;
}

/** Samples around a drawn wheel or rotor circle. */
const CIRCLE_SAMPLES = 28;

/**
 * The wheels, as wire circles.
 *
 * Two concentric rings joined by spokes, standing in the x–y plane at the axle's
 * lateral offset — the cheapest thing that reads as a wheel from any angle, and
 * the only thing that would still read as one when the body it belongs to is
 * transparent. An axle with `halfTrack: 0` gets a single wheel on the centreline,
 * which is how the bike is built.
 */
export function buildWheels(spec: CarBodySpec): RingSet {
  const pts: number[] = [];
  const ring = (cx: number, cy: number, z: number, radius: number) => {
    for (let i = 0; i < CIRCLE_SAMPLES; i++) {
      const a0 = (i / CIRCLE_SAMPLES) * Math.PI * 2;
      const a1 = ((i + 1) / CIRCLE_SAMPLES) * Math.PI * 2;
      pts.push(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, z);
      pts.push(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, z);
    }
  };
  const spokes = (cx: number, cy: number, z: number, radius: number) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push(cx + Math.cos(a) * radius * 0.28, cy + Math.sin(a) * radius * 0.28, z);
      pts.push(cx + Math.cos(a) * radius * 0.96, cy + Math.sin(a) * radius * 0.96, z);
    }
  };

  for (const axle of spec.axles) {
    const x = spec.length * (0.5 - axle.t);
    const y = axle.radius;
    const sides: number[] = axle.halfTrack === 0 ? [0] : [axle.halfTrack, -axle.halfTrack];
    for (const z of sides) {
      ring(x, y, z, axle.radius);
      ring(x, y, z, axle.radius * 0.58);
      spokes(x, y, z, axle.radius);
    }
  }
  return { positions: Float32Array.from(pts) };
}

/** Where a wheel's centre sits, so the renderer can place and spin it. */
export function wheelCentres(spec: CarBodySpec): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (const axle of spec.axles) {
    const x = spec.length * (0.5 - axle.t);
    const sides = axle.halfTrack === 0 ? [0] : [axle.halfTrack, -axle.halfTrack];
    for (const z of sides) out.push({ x, y: axle.radius, z });
  }
  return out;
}

/**
 * The main rotor, as a wire disc: the rim, the blades, and the mast that carries
 * them.
 *
 * Built around the ORIGIN rather than at the mast: an object spins about its own
 * position, so a disc baked at x = 2.2 would orbit the nose instead of turning.
 * {@link rotorHub} says where to stand it.
 */
export function buildRotor(rotor: RotorSpec, mast: number): RingSet {
  const pts: number[] = [];
  // The mast, drawn down from the hub to the roof of the pod. Without it the
  // disc reads as a separate object hanging in the air above a fuselage.
  pts.push(0, 0, 0, 0, -Math.max(0, mast), 0);
  for (let i = 0; i < CIRCLE_SAMPLES * 2; i++) {
    const a0 = (i / (CIRCLE_SAMPLES * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (CIRCLE_SAMPLES * 2)) * Math.PI * 2;
    pts.push(Math.cos(a0) * rotor.radius, 0, Math.sin(a0) * rotor.radius);
    pts.push(Math.cos(a1) * rotor.radius, 0, Math.sin(a1) * rotor.radius);
  }
  for (let b = 0; b < rotor.blades; b++) {
    const a = (b / rotor.blades) * Math.PI * 2;
    pts.push(0, 0, 0);
    pts.push(Math.cos(a) * rotor.radius, 0, Math.sin(a) * rotor.radius);
  }
  return { positions: Float32Array.from(pts) };
}

/** Where the rotor mast stands, and how far it drops to the fuselage below it. */
export function rotorHub(
  rotor: RotorSpec,
  spec: CarBodySpec,
): { x: number; y: number; mast: number } {
  return {
    x: spec.length * (0.5 - rotor.t),
    y: rotor.y,
    mast: Math.max(0, rotor.y - sectionAt(spec, rotor.t).top),
  };
}

/* ── The side elevation ──────────────────────────────────────────────────────
   The same spec, drawn flat. Two consumers, both of which must work with no GPU
   at all: the fleet picker's thumbnails (seven WebGL contexts on one page would
   be absurd, and browsers cap the count anyway) and the stage's own fallback.

   Derived from the SAME sections as the hull, so a silhouette can never drift
   from the body it stands in for — change a roofline and both move. */

/** SVG user space: model x, and y flipped so the ground is 0 and up is negative. */
export interface Silhouette {
  /** A closed `d` for the body outline: the crown nose→tail, the floor back. */
  outline: string;
  wheels: { cx: number; cy: number; r: number }[];
  /** The rotor disc, edge-on: a horizontal line through the mast. */
  rotor: { x1: number; x2: number; y: number; mastY: number; mastX: number } | null;
  /** The body's own bounding box, for a per-vehicle `viewBox`. */
  box: { x: number; y: number; width: number; height: number };
}

/** Points along each of the two profile curves. */
const PROFILE_SAMPLES = 60;

export function buildSilhouette(spec: CarBodySpec): Silhouette {
  const splines = splinesFor(spec);
  const crown: string[] = [];
  const floor: string[] = [];
  let minY = 0;
  let maxY = 0;

  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const t = i / (PROFILE_SAMPLES - 1);
    const x = round3(spec.length * (0.5 - t));
    const top = round3(-splines.top(t));
    const bottom = round3(-splines.floor(t));
    crown.push(`${x},${top}`);
    floor.push(`${x},${bottom}`);
    minY = Math.min(minY, top, bottom);
    maxY = Math.max(maxY, top, bottom);
  }

  const outline = `M${crown.join('L')}L${floor.reverse().join('L')}Z`;

  const wheels = wheelCentres(spec).map((w, i) => ({
    cx: round3(w.x),
    cy: round3(-w.y),
    // `wheelCentres` walks the axles in order, two entries per axle unless the
    // axle is a centreline one — so the radius comes from the axle the entry
    // belongs to rather than from its own index.
    r: round3(spec.axles[axleIndexOf(spec, i)].radius),
  }));
  for (const w of wheels) {
    minY = Math.min(minY, w.cy - w.r);
    maxY = Math.max(maxY, w.cy + w.r);
  }

  let rotor: Silhouette['rotor'] = null;
  if (spec.rotor) {
    const hub = rotorHub(spec.rotor, spec);
    rotor = {
      x1: round3(hub.x - spec.rotor.radius),
      x2: round3(hub.x + spec.rotor.radius),
      y: round3(-hub.y),
      mastX: round3(hub.x),
      mastY: round3(-splines.top(spec.rotor.t)),
    };
    minY = Math.min(minY, rotor.y);
  }

  const x = round3(-spec.length / 2);
  return {
    outline,
    wheels,
    rotor,
    box: { x, y: round3(minY), width: round3(spec.length), height: round3(maxY - minY) },
  };
}

/** Which axle the nth entry of {@link wheelCentres} came from. */
function axleIndexOf(spec: CarBodySpec, entry: number): number {
  let seen = 0;
  for (let a = 0; a < spec.axles.length; a++) {
    seen += spec.axles[a].halfTrack === 0 ? 1 : 2;
    if (entry < seen) return a;
  }
  return spec.axles.length - 1;
}

/** Three decimals is a tenth of a millimetre — plenty, and it halves the markup. */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * A `viewBox` that frames the WHOLE fleet at one scale, so seven silhouettes
 * drawn with it are seven vehicles you can actually compare.
 */
export const FLEET_VIEW_BOX = `${-FLEET_RADIUS} ${-FLEET_HEIGHT} ${FLEET_RADIUS * 2} ${FLEET_HEIGHT}`;
