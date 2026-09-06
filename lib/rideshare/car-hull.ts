/**
 * The loft — how a {@link CarBodySpec} becomes a surface.
 *
 * One builder for the whole fleet, and no three.js in sight: this module turns a
 * list of cross-sections into plain typed arrays (positions, normals, triangle
 * indices, and the three tiers of wireframe the cage is drawn in). The renderer
 * wraps those in buffers; the tests read them directly.
 *
 * ## Why it is a grid, and why that grid is the globe's
 *
 * The surface is sampled as a **station × ring grid**: `STATIONS` cross-sections
 * from nose to tail, `SAMPLES` points around each. That is the same topology as
 * the navigation globe's cage — the ring lines are its parallels, the lines
 * running the length of the body are its meridians, and the nose and tail, where
 * every meridian converges, are its poles. A car in this fleet is a sphere that
 * has been told what shape to be.
 *
 * Sharing the topology is what lets the ripple be shared too. `lib/fluid`'s
 * {@link rippleWave} wants an arc distance in radians, and this builder hands
 * every vertex a **ray** — the unit vector from the middle of the body out to it
 * — so the angle between two rays is that distance, exactly as it is on a ball.
 * The wave that travels over the globe and the wave that travels over a car are
 * then not "the same idea", they are the same function with the same constants.
 *
 * ## Interpolation
 *
 * Sections are interpolated with a **monotone cubic** (Fritsch–Carlson), not a
 * Catmull-Rom. The difference is visible: a Catmull-Rom through a body that is
 * widest at the B-pillar overshoots on the way in, so the hull bulges wider than
 * any section the fleet actually declares, and the widest point of the car is a
 * number nobody wrote down. Monotone cubic cannot overshoot, so what the data
 * says is the widest point IS the widest point.
 */

import { FLEET_HEIGHT, FLEET_RADIUS } from './cars';
import type { CarBodySpec, HullSection, RotorSpec } from './cars';

/**
 * Cross-sections lofted through the body, poles included.
 *
 * 44 puts a ring roughly every 11 cm on a 4.6 m car — fine enough that the
 * silhouette reads as a curve rather than a fold, and coarse enough that the
 * whole hull (with its three cage tiers) is a few thousand vertices.
 */
export const STATIONS = 44;
/**
 * Points around each section. **Divisible by four**, so the waistline, the roof
 * centreline and the keel land on exact samples and the cage's major lines can
 * be indexed rather than approximated.
 */
export const SAMPLES = 36;

/** Every Nth station gets a drawn ring — the cage's parallels. */
const RING_EVERY = 4;
/** Every Nth ring sample gets a drawn length-line — the cage's meridians. */
const MERIDIAN_EVERY = 3;

export interface CageTiers {
  /** The waistline, roof centreline and keel: the body's own equator + prime meridian. */
  major: Uint32Array;
  /** The station rings. */
  parallel: Uint32Array;
  /** The remaining length-lines. */
  minor: Uint32Array;
}

export interface HullGrid {
  stations: number;
  samples: number;
  /** `stations * samples * 3` — the rest pose, in metres, ground at y = 0. */
  positions: Float32Array;
  /** Outward unit normals of the rest pose. */
  normals: Float32Array;
  /** Unit vector from {@link centre} to each vertex — the ripple's coordinate. */
  rays: Float32Array;
  /** Distance from {@link centre} to each vertex, so a swell scales with it. */
  radii: Float32Array;
  indices: Uint32Array;
  cage: CageTiers;
  /** Middle of the body's bounding box: where a ripple's angles are measured from. */
  centre: [number, number, number];
  /** Half-extents of the bounding box, in metres. */
  half: [number, number, number];
}

/* ── Monotone cubic interpolation ─────────────────────────────────────────── */

/**
 * A Fritsch–Carlson monotone cubic through `(xs, ys)`, as an evaluator.
 *
 * `xs` must be strictly ascending. Outside the range the value is clamped to the
 * end knot rather than extrapolated — a section list defines a body between its
 * nose and its tail and says nothing about what is beyond either.
 */
export function monotoneSpline(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => ys[0];

  const h = new Float64Array(n - 1);
  const delta = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    delta[i] = (ys[i + 1] - ys[i]) / h[i];
  }

  const m = new Float64Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // A sign change (or a flat) is a local extremum: pin the slope to zero so
    // the curve turns around exactly at the knot instead of sailing past it.
    if (delta[i - 1] * delta[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }

  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    // Hermite basis.
    return (
      ys[i] * (2 * t3 - 3 * t2 + 1) +
      m[i] * h[i] * (t3 - 2 * t2 + t) +
      ys[i + 1] * (-2 * t3 + 3 * t2) +
      m[i + 1] * h[i] * (t3 - t2)
    );
  };
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

/**
 * Signed `|v|^e` — the superellipse's one primitive.
 *
 * `Math.pow` of a negative base is NaN, so the sign is taken out and put back;
 * doing that inline in the sampling loop is where a hull silently becomes a hull
 * of NaNs and the whole car disappears.
 */
function signedPow(v: number, e: number): number {
  const a = Math.abs(v);
  if (a < 1e-9) return 0;
  return Math.sign(v) * Math.pow(a, e);
}

/* ── The loft ─────────────────────────────────────────────────────────────── */

/** Loft `spec` into a station × ring grid. Pure: same spec in, same arrays out. */
export function buildHull(spec: CarBodySpec): HullGrid {
  const splines = splinesFor(spec);
  const count = STATIONS * SAMPLES;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const rays = new Float32Array(count * 3);
  const radii = new Float32Array(count);

  const cos = new Float64Array(SAMPLES);
  const sin = new Float64Array(SAMPLES);
  for (let r = 0; r < SAMPLES; r++) {
    // Sample 0 is the near-side waistline, so a quarter turn is the crown and a
    // half turn the far side — which is what makes the major-line indices below
    // exact rather than nearest-neighbour.
    const theta = (r / SAMPLES) * Math.PI * 2;
    cos[r] = Math.cos(theta);
    sin[r] = Math.sin(theta);
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let s = 0; s < STATIONS; s++) {
    const t = s / (STATIONS - 1);
    // +x is the nose, and `t` walks nose → tail, so the body is laid out from
    // +length/2 down to −length/2 and stays centred on the origin in x.
    const x = spec.length * (0.5 - t);
    const halfWidth = Math.max(0, splines.halfWidth(t));
    const top = splines.top(t);
    const floor = splines.floor(t);
    const mid = (top + floor) / 2;
    const yr = Math.max(0, (top - floor) / 2);
    const e = 2 / Math.max(2, splines.round(t));
    const crown = Math.max(0, splines.crown(t));

    for (let r = 0; r < SAMPLES; r++) {
      const i = (s * SAMPLES + r) * 3;
      const up = signedPow(sin[r], e);
      const y = mid + yr * up;
      // Tumblehome: the section keeps its full width at the waist and loses
      // `crown` of it by the roofline, on a square law so the pull-in happens
      // over the greenhouse rather than all the way up from the sill.
      const taper = up > 0 ? 1 - crown * up * up : 1;
      const z = halfWidth * signedPow(cos[r], e) * taper;
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = z;
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
    }
  }

  const centre: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const half: [number, number, number] = [
    (max[0] - min[0]) / 2,
    (max[1] - min[1]) / 2,
    (max[2] - min[2]) / 2,
  ];

  for (let v = 0; v < count; v++) {
    const i = v * 3;
    const dx = positions[i] - centre[0];
    const dy = positions[i + 1] - centre[1];
    const dz = positions[i + 2] - centre[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    rays[i] = dx / len;
    rays[i + 1] = dy / len;
    rays[i + 2] = dz / len;
    radii[v] = len;
  }

  computeNormals(positions, rays, normals);

  return {
    stations: STATIONS,
    samples: SAMPLES,
    positions,
    normals,
    rays,
    radii,
    indices: buildIndices(),
    cage: buildCage(),
    centre,
    half,
  };
}

/**
 * Outward normals from the grid's own tangents.
 *
 * The two tangents are central differences along the station and ring axes; the
 * ring axis wraps and the station axis clamps at the poles, where the ring
 * tangent collapses. A degenerate cross product there falls back to the vertex's
 * ray, which on a closed hull points the same way the normal would.
 */
function computeNormals(positions: Float32Array, rays: Float32Array, out: Float32Array): void {
  const at = (s: number, r: number, k: number) =>
    positions[(s * SAMPLES + ((r + SAMPLES) % SAMPLES)) * 3 + k];

  for (let s = 0; s < STATIONS; s++) {
    const sPrev = Math.max(0, s - 1);
    const sNext = Math.min(STATIONS - 1, s + 1);
    for (let r = 0; r < SAMPLES; r++) {
      const i = (s * SAMPLES + r) * 3;
      const ax = at(sNext, r, 0) - at(sPrev, r, 0);
      const ay = at(sNext, r, 1) - at(sPrev, r, 1);
      const az = at(sNext, r, 2) - at(sPrev, r, 2);
      const bx = at(s, r + 1, 0) - at(s, r - 1, 0);
      const by = at(s, r + 1, 1) - at(s, r - 1, 1);
      const bz = at(s, r + 1, 2) - at(s, r - 1, 2);
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-7) {
        nx = rays[i];
        ny = rays[i + 1];
        nz = rays[i + 2];
      } else {
        nx /= len;
        ny /= len;
        nz /= len;
        // The winding of the grid flips between the body's two sides, so the
        // cross product is only outward half the time. The ray settles it.
        if (nx * rays[i] + ny * rays[i + 1] + nz * rays[i + 2] < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
      }
      out[i] = nx;
      out[i + 1] = ny;
      out[i + 2] = nz;
    }
  }
}

/** Triangles for the whole grid. Topology is the same for every body. */
let INDICES: Uint32Array | null = null;
function buildIndices(): Uint32Array {
  if (INDICES) return INDICES;
  const quads = (STATIONS - 1) * SAMPLES;
  const out = new Uint32Array(quads * 6);
  let o = 0;
  for (let s = 0; s < STATIONS - 1; s++) {
    for (let r = 0; r < SAMPLES; r++) {
      const r1 = (r + 1) % SAMPLES;
      const a = s * SAMPLES + r;
      const b = s * SAMPLES + r1;
      const c = (s + 1) * SAMPLES + r;
      const d = (s + 1) * SAMPLES + r1;
      out[o++] = a;
      out[o++] = c;
      out[o++] = b;
      out[o++] = b;
      out[o++] = c;
      out[o++] = d;
    }
  }
  INDICES = out;
  return out;
}

/** The three cage tiers. Topology is the same for every body, so it is built once. */
let CAGE: CageTiers | null = null;
function buildCage(): CageTiers {
  if (CAGE) return CAGE;
  // The four samples the major lines run along: waistline near, crown, waistline
  // far, keel. SAMPLES is divisible by four so these are exact.
  const majorSamples = new Set([0, SAMPLES / 4, SAMPLES / 2, (3 * SAMPLES) / 4]);

  const major: number[] = [];
  const minor: number[] = [];
  const parallel: number[] = [];

  for (let r = 0; r < SAMPLES; r++) {
    const isMajor = majorSamples.has(r);
    if (!isMajor && r % MERIDIAN_EVERY !== 0) continue;
    const bucket = isMajor ? major : minor;
    for (let s = 0; s < STATIONS - 1; s++) {
      bucket.push(s * SAMPLES + r, (s + 1) * SAMPLES + r);
    }
  }

  for (let s = 0; s < STATIONS; s += RING_EVERY) {
    for (let r = 0; r < SAMPLES; r++) {
      parallel.push(s * SAMPLES + r, s * SAMPLES + ((r + 1) % SAMPLES));
    }
  }

  CAGE = {
    major: Uint32Array.from(major),
    parallel: Uint32Array.from(parallel),
    minor: Uint32Array.from(minor),
  };
  return CAGE;
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
 * A wheel is two concentric rings (tyre and rim) joined by spokes, standing in
 * the x–y plane at the axle's lateral offset — the cheapest thing that reads as
 * a wheel from any angle, and the only thing that would still read as one when
 * the body it belongs to is transparent. An axle with `halfTrack: 0` gets a
 * single wheel on the centreline, which is how the bike is built.
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

/** Where a wheel's centre sits, so the renderer can spin it in place. */
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
 * them. Drawn flat in the x–z plane so the renderer can spin it about y.
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
   The same spec, drawn flat. Two consumers, both of which need to work with no
   GPU at all: the fleet picker's thumbnails (seven of them on one page — seven
   WebGL contexts would be absurd, and browsers cap the count anyway) and the
   stage's own fallback when WebGL is unavailable or the context is lost.

   It is derived from the SAME sections as the hull, so a silhouette can never
   drift from the body it stands in for — change a roofline and both move. */

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
