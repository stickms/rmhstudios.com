/**
 * Convex brushes: from a box or half-space planes to side polygons, axial and edge bevels,
 * and Source's world-aligned texture axes. Pure maths, no engine imports.
 */
import type { BrushContents, BrushSource, Face, Vec3 } from './types';

/** Outward-facing half-space: inside is `nx*x + ny*y + nz*z <= d`. */
export interface Plane3 {
  nx: number;
  ny: number;
  nz: number;
  d: number;
}

export interface BrushSide {
  plane: Plane3;
  /** Texture placement (bevels carry the brush's first face). */
  face: Face;
  /** Clockwise about the plane normal (Source winding); null for bevels. */
  poly: Vec3[] | null;
  bevel: boolean;
}

export interface CompiledBrush {
  /** Non-bevel sides first (every one has a polygon), then bevels. */
  sides: BrushSide[];
  mins: Vec3;
  maxs: Vec3;
  /** CONTENTS_* bits. */
  contents: number;
  /** Where it came from, for error messages. */
  label: string;
}

/** CONTENTS_* values (lib/tf2-game/core/constants.ts), duplicated to keep this module engine-free. */
export const CONTENTS_BITS: Record<BrushContents, number> = {
  solid: 0x1,
  window: 0x2,
  water: 0x20,
  playerclip: 0x10000,
  ladder: 0x20000000,
};

const BIG = 65536;
const CLIP_EPS = 0.01;
const MIN_AREA = 0.01;

const BOX_FACES = [
  { name: 'top', n: [0, 0, 1] },
  { name: 'bottom', n: [0, 0, -1] },
  { name: 'north', n: [0, 1, 0] },
  { name: 'south', n: [0, -1, 0] },
  { name: 'east', n: [1, 0, 0] },
  { name: 'west', n: [-1, 0, 0] },
] as const;

/** Source's baseaxis table (vbsp textures.cpp): normal, s axis, t axis. */
const BASE_AXIS: ReadonlyArray<readonly [number[], number[], number[]]> = [
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, -1, 0],
  ], // floor
  [
    [0, 0, -1],
    [1, 0, 0],
    [0, -1, 0],
  ], // ceiling
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
  ], // west wall
  [
    [-1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
  ], // east wall
  [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ], // south wall
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ], // north wall
];

/** Source's TextureAxisFromPlane: the world-aligned s/t axes of the dominant-axis projection. */
export function textureAxes(nx: number, ny: number, nz: number): { s: Vec3; t: Vec3 } {
  let best = 0;
  let bestAxis = 0;
  for (let i = 0; i < 6; i++) {
    const b = BASE_AXIS[i][0];
    const dot = nx * b[0] + ny * b[1] + nz * b[2];
    if (dot > best) {
      best = dot;
      bestAxis = i;
    }
  }
  const [, s, t] = BASE_AXIS[bestAxis];
  return { s: { x: s[0], y: s[1], z: s[2] }, t: { x: t[0], y: t[1], z: t[2] } };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** Polygon area (Newell) and its normal direction sum. */
export function polygonArea(poly: Vec3[]): number {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return Math.hypot(x, y, z) / 2;
}

/** A huge polygon on the plane, wound clockwise about its normal. */
function baseWinding(p: Plane3): Vec3[] {
  // Pick the axis the normal is least aligned with to build the basis.
  const ax = Math.abs(p.nx);
  const ay = Math.abs(p.ny);
  const az = Math.abs(p.nz);
  const up: Vec3 =
    az <= ax && az <= ay
      ? { x: 0, y: 0, z: 1 }
      : ay <= ax
        ? { x: 0, y: 1, z: 0 }
        : { x: 1, y: 0, z: 0 };
  const n: Vec3 = { x: p.nx, y: p.ny, z: p.nz };
  let u = cross(up, n);
  const ul = Math.hypot(u.x, u.y, u.z);
  u = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
  const v = cross(n, u); // u × v = n
  const o: Vec3 = { x: n.x * p.d, y: n.y * p.d, z: n.z * p.d };
  const at = (a: number, b: number): Vec3 => ({
    x: o.x + (u.x * a + v.x * b) * BIG,
    y: o.y + (u.y * a + v.y * b) * BIG,
    z: o.z + (u.z * a + v.z * b) * BIG,
  });
  // Counter-clockwise about n is (-,-) (+,-) (+,+) (-,+); reverse for clockwise.
  return [at(-1, -1), at(-1, 1), at(1, 1), at(1, -1)];
}

/** Sutherland-Hodgman: keeps the part with `n·p - d <= eps`. */
function clipPolygon(poly: Vec3[], c: Plane3, eps: number): Vec3[] {
  const out: Vec3[] = [];
  const n = poly.length;
  const dist = poly.map((p) => c.nx * p.x + c.ny * p.y + c.nz * p.z - c.d);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const di = dist[i];
    const dj = dist[j];
    const inI = di <= eps;
    const inJ = dj <= eps;
    if (inI) out.push(poly[i]);
    if (inI !== inJ) {
      const t = di / (di - dj);
      const a = poly[i];
      const b = poly[j];
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  // Drop repeated points.
  const clean: Vec3[] = [];
  for (const p of out) {
    const last = clean[clean.length - 1];
    if (
      last &&
      Math.abs(last.x - p.x) < 1e-4 &&
      Math.abs(last.y - p.y) < 1e-4 &&
      Math.abs(last.z - p.z) < 1e-4
    )
      continue;
    clean.push(p);
  }
  if (clean.length > 1) {
    const a = clean[0];
    const b = clean[clean.length - 1];
    if (Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4 && Math.abs(a.z - b.z) < 1e-4)
      clean.pop();
  }
  return clean;
}

function normalisePlane(nx: number, ny: number, nz: number, dist: number, label: string): Plane3 {
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 1e-9) || !Number.isFinite(len)) throw new Error(`${label}: plane with a zero normal`);
  return { nx: nx / len, ny: ny / len, nz: nz / len, d: dist / len };
}

function samePlane(a: Plane3, b: Plane3): boolean {
  return a.nx * b.nx + a.ny * b.ny + a.nz * b.nz > 1 - 1e-9 && Math.abs(a.d - b.d) < CLIP_EPS;
}

/** Builds a convex brush from a source brush. Throws on degenerate brushes. */
export function buildBrush(src: BrushSource, label: string): CompiledBrush {
  const raw: { plane: Plane3; face: Face }[] = [];
  const dflt: Face = { material: src.material };
  if (src.box) {
    const { min, max } = src.box;
    if (!(max.x > min.x && max.y > min.y && max.z > min.z)) {
      throw new Error(
        `${label}: box has no volume (${JSON.stringify(min)} .. ${JSON.stringify(max)})`,
      );
    }
    for (const f of BOX_FACES) {
      const [x, y, z] = f.n;
      const d =
        x > 0 ? max.x : x < 0 ? -min.x : y > 0 ? max.y : y < 0 ? -min.y : z > 0 ? max.z : -min.z;
      raw.push({ plane: { nx: x, ny: y, nz: z, d }, face: src.faces?.[f.name] ?? dflt });
    }
  } else if (src.planes) {
    if (src.planes.length < 4) throw new Error(`${label}: a plane brush needs at least 4 planes`);
    for (const p of src.planes) {
      raw.push({
        plane: normalisePlane(p.normal.x, p.normal.y, p.normal.z, p.dist, label),
        face: p.face ?? dflt,
      });
    }
  } else {
    throw new Error(`${label}: brush has neither box nor planes`);
  }

  if (src.box) return boxBrush(src, raw, label);

  // Drop duplicate planes (keep the first).
  const uniq: typeof raw = [];
  for (const r of raw) if (!uniq.some((u) => samePlane(u.plane, r.plane))) uniq.push(r);

  const sides: BrushSide[] = [];
  for (let i = 0; i < uniq.length; i++) {
    let poly = baseWinding(uniq[i].plane);
    for (let j = 0; j < uniq.length && poly.length >= 3; j++) {
      if (j !== i) poly = clipPolygon(poly, uniq[j].plane, CLIP_EPS);
    }
    if (poly.length < 3 || polygonArea(poly) < MIN_AREA) continue;
    sides.push({ plane: uniq[i].plane, face: uniq[i].face, poly, bevel: false });
  }
  if (sides.length < 4)
    throw new Error(
      `${label}: brush is not a closed convex solid (only ${sides.length} real sides)`,
    );

  const mins = { x: Infinity, y: Infinity, z: Infinity };
  const maxs = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const s of sides) {
    for (const p of s.poly!) {
      mins.x = Math.min(mins.x, p.x);
      mins.y = Math.min(mins.y, p.y);
      mins.z = Math.min(mins.z, p.z);
      maxs.x = Math.max(maxs.x, p.x);
      maxs.y = Math.max(maxs.y, p.y);
      maxs.z = Math.max(maxs.z, p.z);
    }
  }
  if (
    !Number.isFinite(mins.x + maxs.x + mins.y + maxs.y + mins.z + maxs.z) ||
    Math.max(maxs.x - mins.x, maxs.y - mins.y, maxs.z - mins.z) > BIG / 2
  ) {
    throw new Error(`${label}: brush is unbounded`);
  }

  addBevels(sides, mins, maxs);
  return { sides, mins, maxs, contents: CONTENTS_BITS[src.contents ?? 'solid'], label };
}

/** Fast path: the six sides of an AABB, wound clockwise about their outward normals. No bevels are needed. */
function boxBrush(
  src: BrushSource,
  raw: { plane: Plane3; face: Face }[],
  label: string,
): CompiledBrush {
  const { min, max } = src.box!;
  const lo = [min.x, min.y, min.z];
  const hi = [max.x, max.y, max.z];
  const sides: BrushSide[] = raw.map((r) => {
    const a = r.plane.nx !== 0 ? 0 : r.plane.ny !== 0 ? 1 : 2;
    const positive = r.plane.nx + r.plane.ny + r.plane.nz > 0;
    const b = (a + 1) % 3;
    const c = (a + 2) % 3;
    const at = positive ? hi[a] : lo[a];
    const corners = positive
      ? [
          [lo[b], hi[c]],
          [hi[b], hi[c]],
          [hi[b], lo[c]],
          [lo[b], lo[c]],
        ]
      : [
          [lo[b], lo[c]],
          [hi[b], lo[c]],
          [hi[b], hi[c]],
          [lo[b], hi[c]],
        ];
    const poly = corners.map(([u, v]) => {
      const p = [0, 0, 0];
      p[a] = at;
      p[b] = u;
      p[c] = v;
      return { x: p[0], y: p[1], z: p[2] };
    });
    return { plane: r.plane, face: r.face, poly, bevel: false };
  });
  return {
    sides,
    mins: { ...min },
    maxs: { ...max },
    contents: CONTENTS_BITS[src.contents ?? 'solid'],
    label,
  };
}

/**
 * Source's AddBrushBevels: axial planes at the bounds wherever a side does not already supply
 * one, then edge bevels (an edge cross an axis) for every non-axial edge, so a swept box meets
 * sloped edges exactly. Bevel sides are skipped by point traces.
 */
function addBevels(sides: BrushSide[], mins: Vec3, maxs: Vec3): void {
  const real = sides.slice();
  const first = real[0].face;
  const has = (p: Plane3): boolean => sides.some((s) => samePlane(s.plane, p));
  const push = (p: Plane3): void => {
    sides.push({ plane: p, face: first, poly: null, bevel: true });
  };
  // Axial.
  const axial: Plane3[] = [
    { nx: 1, ny: 0, nz: 0, d: maxs.x },
    { nx: -1, ny: 0, nz: 0, d: -mins.x },
    { nx: 0, ny: 1, nz: 0, d: maxs.y },
    { nx: 0, ny: -1, nz: 0, d: -mins.y },
    { nx: 0, ny: 0, nz: 1, d: maxs.z },
    { nx: 0, ny: 0, nz: -1, d: -mins.z },
  ];
  for (const p of axial) if (!has(p)) push(p);

  // Edges.
  const verts: Vec3[] = [];
  for (const s of real) for (const p of s.poly!) verts.push(p);
  for (const s of real) {
    const w = s.poly!;
    for (let j = 0; j < w.length; j++) {
      const a = w[j];
      const b = w[(j + 1) % w.length];
      const e = sub(b, a);
      const el = Math.hypot(e.x, e.y, e.z);
      if (el < 1e-6) continue;
      const dir = { x: e.x / el, y: e.y / el, z: e.z / el };
      if (Math.abs(dir.x) > 1 - 1e-6 || Math.abs(dir.y) > 1 - 1e-6 || Math.abs(dir.z) > 1 - 1e-6)
        continue; // axial edge
      for (let axis = 0; axis < 3; axis++) {
        for (const sign of [-1, 1]) {
          const ax: Vec3 = {
            x: axis === 0 ? sign : 0,
            y: axis === 1 ? sign : 0,
            z: axis === 2 ? sign : 0,
          };
          const n = cross(dir, ax);
          const nl = Math.hypot(n.x, n.y, n.z);
          if (nl < 0.5) continue;
          const p: Plane3 = { nx: n.x / nl, ny: n.y / nl, nz: n.z / nl, d: 0 };
          p.d = p.nx * a.x + p.ny * a.y + p.nz * a.z;
          if (has(p)) continue;
          let cuts = false;
          for (const v of verts) {
            if (p.nx * v.x + p.ny * v.y + p.nz * v.z - p.d > 0.1) {
              cuts = true;
              break;
            }
          }
          if (!cuts) push(p);
        }
      }
    }
  }
}

/** True when `p` is inside (or on) every non-bevel plane of the brush. */
export function brushContainsPoint(
  b: CompiledBrush,
  x: number,
  y: number,
  z: number,
  eps = 1e-3,
): boolean {
  for (const s of b.sides) {
    if (s.bevel) continue;
    if (s.plane.nx * x + s.plane.ny * y + s.plane.nz * z - s.plane.d > eps) return false;
  }
  return true;
}
