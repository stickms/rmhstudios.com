/**
 * The **loft** — one station × ring grid, shared by everything on this site that
 * is drawn as glass over a wireframe cage.
 *
 * The RMH family of cars lofts a car body along a straight axis; RMH Fashion
 * lofts a sleeve along the curve of an arm. They are the same surface: a run of
 * cross-sections, each a superellipse in its own plane, stitched into a grid
 * whose ring lines read as parallels and whose length-lines read as meridians —
 * the navigation globe's topology, told what shape to be.
 *
 * Sharing it is not tidiness. The ripple is the reason: `lib/fluid`'s
 * `rippleWave` wants an arc distance in radians, and this builder gives every
 * vertex a **ray** from a chosen origin, so the angle between two rays is that
 * distance. Give a body and everything it is wearing the SAME ray origin and one
 * poke sends one wave across all of them, because they are one surface as far as
 * the wave is concerned.
 *
 * Nothing here imports three.js, React or the DOM, so the geometry is testable
 * on its own — which is the only reason a mistake in it is ever cheap to find.
 */

/** A station's own plane: where it sits, and which way is "across" and "up". */
export interface LoftStation {
  /** Centre of the section, in model space. */
  centre: readonly [number, number, number];
  /** Unit vector spanning the section's width. Must be perpendicular to `up`. */
  right: readonly [number, number, number];
  /** Unit vector spanning the section's height. */
  up: readonly [number, number, number];
  /** Half-extent along `right`. 0 closes the surface to a point (a pole). */
  halfRight: number;
  /** Half-extent along `up`. */
  halfUp: number;
  /**
   * Superellipse exponent. 2 is an ellipse; larger squares the section off.
   * Below 2 the shape inverts into a four-pointed star, so it is clamped.
   */
  round: number;
  /**
   * **Tumblehome** — how much narrower the section is at its crown than at its
   * waist, as a fraction of `halfRight`. 0 is slab-sided.
   *
   * It is what makes a car read as a car rather than a lozenge (the greenhouse
   * is a narrowing, not a height), and what gives a shoulder its slope.
   */
  crown: number;
}

export interface CageTiers {
  /** The four cardinal length-lines: the body's own equator and prime meridian. */
  major: Uint32Array;
  /** The station rings. */
  parallel: Uint32Array;
  /** The remaining length-lines. */
  minor: Uint32Array;
}

export interface LoftGrid {
  stations: number;
  samples: number;
  /** `stations * samples * 3`, in model units. */
  positions: Float32Array;
  /** Outward unit normals of the rest pose. */
  normals: Float32Array;
  /** Unit vector from the ray origin to each vertex — the ripple's coordinate. */
  rays: Float32Array;
  /** Distance from the ray origin to each vertex, so a swell scales with it. */
  radii: Float32Array;
  indices: Uint32Array;
  cage: CageTiers;
  /** Middle of the bounding box. */
  centre: [number, number, number];
  /** Half-extents of the bounding box. */
  half: [number, number, number];
}

export interface LoftOptions {
  /** Points around each section. Divisible by four, so the major lines are exact. */
  samples?: number;
  /** Every Nth station gets a drawn ring. */
  ringEvery?: number;
  /** Every Nth ring sample gets a drawn length-line. */
  meridianEvery?: number;
  /**
   * Where the ripple's angles are measured from. Defaults to the grid's own
   * bounding-box centre; pass a shared origin to make several lofts behave as
   * ONE surface under a wave (a figure and the clothes on it).
   */
  rayOrigin?: readonly [number, number, number];
}

export const DEFAULT_SAMPLES = 36;
const DEFAULT_RING_EVERY = 4;
const DEFAULT_MERIDIAN_EVERY = 3;

/* ── Frames ───────────────────────────────────────────────────────────────── */

type Vec3 = [number, number, number];

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * An orthonormal frame for a section standing across `tangent`.
 *
 * The reference axis is the one LEAST aligned with the tangent, because a fixed
 * reference degenerates exactly where most of a human figure lives: a torso and
 * a leg run straight up, so crossing them with world-up gives a zero vector and
 * the section collapses to nothing. Legs take their width from world-z; a foot,
 * which runs forward, takes it from world-y.
 */
export function frameFor(tangent: readonly [number, number, number]): { right: Vec3; up: Vec3 } {
  const t = unit([tangent[0], tangent[1], tangent[2]]);
  const ref: Vec3 = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  const right = unit(cross(ref, t));
  return { right, up: unit(cross(t, right)) };
}

/* ── Monotone cubic interpolation ─────────────────────────────────────────── */

/**
 * A Fritsch–Carlson monotone cubic through `(xs, ys)`, as an evaluator.
 *
 * `xs` must be strictly ascending. Outside the range the value is clamped to the
 * end knot rather than extrapolated.
 *
 * Monotone rather than Catmull-Rom on purpose: a Catmull-Rom through a body that
 * is widest at one station overshoots on the way in, so the widest point of the
 * shape becomes a number nobody wrote down. This cannot overshoot, so what the
 * data says is the widest point IS the widest point.
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
    return (
      ys[i] * (2 * t3 - 3 * t2 + 1) +
      m[i] * h[i] * (t3 - 2 * t2 + t) +
      ys[i + 1] * (-2 * t3 + 3 * t2) +
      m[i + 1] * h[i] * (t3 - t2)
    );
  };
}

/**
 * Signed `|v|^e` — the superellipse's one primitive.
 *
 * `Math.pow` of a negative base is NaN, so the sign is taken out and put back.
 * Doing that inline in a sampling loop is where a surface silently becomes a
 * surface of NaNs and the whole object disappears with no error at all.
 */
export function signedPow(v: number, e: number): number {
  const a = Math.abs(v);
  if (a < 1e-9) return 0;
  return Math.sign(v) * Math.pow(a, e);
}

/* ── The loft ─────────────────────────────────────────────────────────────── */

/** Cached per (stations, samples, ringEvery, meridianEvery) — topology is shape-independent. */
const TOPOLOGY = new Map<string, { indices: Uint32Array; cage: CageTiers }>();

/**
 * Stitch `stations` into a closed grid.
 *
 * The ring wraps; the station axis does not. A station with `halfRight: 0` and
 * `halfUp: 0` collapses to a point, which is how a surface is closed off into a
 * pole — the place every length-line converges, exactly as on a globe.
 */
export function loft(stations: readonly LoftStation[], options: LoftOptions = {}): LoftGrid {
  const samples = options.samples ?? DEFAULT_SAMPLES;
  const count = stations.length;
  if (count < 2) throw new Error('a loft needs at least two stations');
  if (samples % 4 !== 0) throw new Error('samples must be divisible by four');

  const positions = new Float32Array(count * samples * 3);
  const normals = new Float32Array(count * samples * 3);
  const rays = new Float32Array(count * samples * 3);
  const radii = new Float32Array(count * samples);

  const cos = new Float64Array(samples);
  const sin = new Float64Array(samples);
  for (let r = 0; r < samples; r++) {
    // Sample 0 is the near-side waist, so a quarter turn is the crown and a half
    // turn the far side — which is what makes the major-line indices exact.
    const theta = (r / samples) * Math.PI * 2;
    cos[r] = Math.cos(theta);
    sin[r] = Math.sin(theta);
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let s = 0; s < count; s++) {
    const st = stations[s];
    const e = 2 / Math.max(2, st.round);
    const crown = Math.max(0, st.crown);
    const [cx, cy, cz] = st.centre;
    const [rx, ry, rz] = st.right;
    const [ux, uy, uz] = st.up;

    for (let r = 0; r < samples; r++) {
      const i = (s * samples + r) * 3;
      const up = signedPow(sin[r], e);
      // Tumblehome, on a square law so the pull-in happens over the crown rather
      // than all the way up from the waist.
      const taper = up > 0 ? 1 - crown * up * up : 1;
      const across = st.halfRight * signedPow(cos[r], e) * taper;
      const rise = st.halfUp * up;

      const x = cx + rx * across + ux * rise;
      const y = cy + ry * across + uy * rise;
      const z = cz + rz * across + uz * rise;
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
  const origin = options.rayOrigin ?? centre;

  for (let v = 0; v < count * samples; v++) {
    const i = v * 3;
    const dx = positions[i] - origin[0];
    const dy = positions[i + 1] - origin[1];
    const dz = positions[i + 2] - origin[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    rays[i] = dx / len;
    rays[i + 1] = dy / len;
    rays[i + 2] = dz / len;
    radii[v] = len;
  }

  computeNormals(positions, rays, normals, count, samples);

  const key = `${count}|${samples}|${options.ringEvery ?? DEFAULT_RING_EVERY}|${options.meridianEvery ?? DEFAULT_MERIDIAN_EVERY}`;
  let topology = TOPOLOGY.get(key);
  if (!topology) {
    topology = {
      indices: buildIndices(count, samples),
      cage: buildCage(
        count,
        samples,
        options.ringEvery ?? DEFAULT_RING_EVERY,
        options.meridianEvery ?? DEFAULT_MERIDIAN_EVERY,
      ),
    };
    TOPOLOGY.set(key, topology);
  }

  return {
    stations: count,
    samples,
    positions,
    normals,
    rays,
    radii,
    indices: topology.indices,
    cage: topology.cage,
    centre,
    half,
  };
}

/**
 * Outward normals from the grid's own tangents.
 *
 * Central differences along the station and ring axes; the ring axis wraps and
 * the station axis clamps at the ends, where the ring tangent collapses. A
 * degenerate cross product there falls back to the vertex's ray, which on a
 * closed surface points the way the normal would.
 */
function computeNormals(
  positions: Float32Array,
  rays: Float32Array,
  out: Float32Array,
  stations: number,
  samples: number,
): void {
  const at = (s: number, r: number, k: number) =>
    positions[(s * samples + ((r + samples) % samples)) * 3 + k];

  for (let s = 0; s < stations; s++) {
    const sPrev = Math.max(0, s - 1);
    const sNext = Math.min(stations - 1, s + 1);
    for (let r = 0; r < samples; r++) {
      const i = (s * samples + r) * 3;
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
        // The winding flips between the two sides of the surface, so the cross
        // product is only outward half the time. The ray settles it.
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

function buildIndices(stations: number, samples: number): Uint32Array {
  const out = new Uint32Array((stations - 1) * samples * 6);
  let o = 0;
  for (let s = 0; s < stations - 1; s++) {
    for (let r = 0; r < samples; r++) {
      const r1 = (r + 1) % samples;
      const a = s * samples + r;
      const b = s * samples + r1;
      const c = (s + 1) * samples + r;
      const d = (s + 1) * samples + r1;
      out[o++] = a;
      out[o++] = c;
      out[o++] = b;
      out[o++] = b;
      out[o++] = c;
      out[o++] = d;
    }
  }
  return out;
}

function buildCage(
  stations: number,
  samples: number,
  ringEvery: number,
  meridianEvery: number,
): CageTiers {
  // The four samples the major lines run along: near waist, crown, far waist,
  // keel. `samples` is divisible by four, so these are exact rather than nearest.
  const majorSamples = new Set([0, samples / 4, samples / 2, (3 * samples) / 4]);

  const major: number[] = [];
  const minor: number[] = [];
  const parallel: number[] = [];

  for (let r = 0; r < samples; r++) {
    const isMajor = majorSamples.has(r);
    if (!isMajor && r % meridianEvery !== 0) continue;
    const bucket = isMajor ? major : minor;
    for (let s = 0; s < stations - 1; s++) {
      bucket.push(s * samples + r, (s + 1) * samples + r);
    }
  }

  for (let s = 0; s < stations; s += ringEvery) {
    for (let r = 0; r < samples; r++) {
      parallel.push(s * samples + r, s * samples + ((r + 1) % samples));
    }
  }

  return {
    major: Uint32Array.from(major),
    parallel: Uint32Array.from(parallel),
    minor: Uint32Array.from(minor),
  };
}

/**
 * Concatenate several grids into one.
 *
 * A garment is rarely one surface — a coat is a torso, a skirt of it over the
 * thighs, and two sleeves. Drawn separately that is five meshes per layer per
 * pass, and a dressed figure becomes a few hundred draw calls. Merged, a whole
 * coat is one, and it can still take one colour because a colour is what a
 * garment has, not what a sleeve has.
 *
 * The ray fields are carried through unchanged rather than recomputed, so a
 * merged grid keeps whatever shared ripple origin its parts were built with.
 */
export function mergeGrids(grids: readonly LoftGrid[]): LoftGrid | null {
  if (grids.length === 0) return null;
  if (grids.length === 1) return grids[0];

  let vertices = 0;
  let triangles = 0;
  const tiers: (keyof CageTiers)[] = ['major', 'parallel', 'minor'];
  const cageLengths: Record<string, number> = { major: 0, parallel: 0, minor: 0 };
  for (const g of grids) {
    vertices += g.radii.length;
    triangles += g.indices.length;
    for (const tier of tiers) cageLengths[tier] += g.cage[tier].length;
  }

  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const rays = new Float32Array(vertices * 3);
  const radii = new Float32Array(vertices);
  const indices = new Uint32Array(triangles);
  const cage: CageTiers = {
    major: new Uint32Array(cageLengths.major),
    parallel: new Uint32Array(cageLengths.parallel),
    minor: new Uint32Array(cageLengths.minor),
  };

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let v = 0;
  let tri = 0;
  const tierAt: Record<string, number> = { major: 0, parallel: 0, minor: 0 };

  for (const g of grids) {
    positions.set(g.positions, v * 3);
    normals.set(g.normals, v * 3);
    rays.set(g.rays, v * 3);
    radii.set(g.radii, v);
    for (let i = 0; i < g.indices.length; i++) indices[tri + i] = g.indices[i] + v;
    tri += g.indices.length;
    for (const tier of tiers) {
      const src = g.cage[tier];
      for (let i = 0; i < src.length; i++) cage[tier][tierAt[tier] + i] = src[i] + v;
      tierAt[tier] += src.length;
    }
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], g.centre[k] - g.half[k]);
      max[k] = Math.max(max[k], g.centre[k] + g.half[k]);
    }
    v += g.radii.length;
  }

  return {
    // A merged grid is no longer a rectangular lattice, so the station and
    // sample counts describe nothing and are reported as zero rather than as a
    // number somebody might index with.
    stations: 0,
    samples: 0,
    positions,
    normals,
    rays,
    radii,
    indices,
    cage,
    centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    half: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
  };
}
