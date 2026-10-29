/**
 * Convex point sets → plane sets for brush-style tracing.
 *
 * `convexHull` is an incremental 3D hull (tetrahedron seed, then each point
 * replaces the faces it sees with a fan to the horizon). `hullPlanes` turns
 * the hull into outward planes, merges coplanar faces and adds the bevel
 * planes a box sweep needs — the six axial planes and the edge × axis planes
 * that touch the hull — the same set vbsp adds to brushes
 * (SDK: utils/vbsp's AddBrushBevels). Bevel planes are flagged so point
 * traces can skip them, as the engine skips brush bevels for rays.
 */

export interface ConvexHull {
  /** Hull vertices (subset of the input), xyz. */
  points: Float64Array;
  /** Outward triangles over `points` (counter-clockwise seen from outside). */
  triangles: Int32Array;
}

export interface PlaneSet {
  /** nx, ny, nz, d per plane: inside is n·p − d ≤ 0. */
  planes: Float64Array;
  /** 1 for bevel planes. */
  bevel: Uint8Array;
  count: number;
}

const EPS_MERGE_POINT = 1e-3;

/** Incremental convex hull. Returns null for degenerate (flat/linear/empty) input. */
export function convexHull(input: ArrayLike<number>): ConvexHull | null {
  // Dedupe points.
  const pts: number[] = [];
  for (let i = 0; i + 2 < input.length; i += 3) {
    const x = input[i];
    const y = input[i + 1];
    const z = input[i + 2];
    let dup = false;
    for (let j = 0; j < pts.length; j += 3) {
      if (
        Math.abs(pts[j] - x) < EPS_MERGE_POINT &&
        Math.abs(pts[j + 1] - y) < EPS_MERGE_POINT &&
        Math.abs(pts[j + 2] - z) < EPS_MERGE_POINT
      ) {
        dup = true;
        break;
      }
    }
    if (!dup) pts.push(x, y, z);
  }
  const n = pts.length / 3;
  if (n < 4) return null;
  const P = (i: number, k: number) => pts[i * 3 + k];

  // Scale-relative epsilon.
  let extent = 0;
  for (let i = 0; i < pts.length; i++) extent = Math.max(extent, Math.abs(pts[i]));
  const eps = Math.max(1e-9, extent * 1e-7) * 10;

  // Seed tetrahedron: farthest pair along the axis with the widest spread, etc.
  let i0 = 0;
  let i1 = 0;
  let bestSpread = -1;
  for (let k = 0; k < 3; k++) {
    let lo = 0;
    let hi = 0;
    for (let i = 1; i < n; i++) {
      if (P(i, k) < P(lo, k)) lo = i;
      if (P(i, k) > P(hi, k)) hi = i;
    }
    const spread = P(hi, k) - P(lo, k);
    if (spread > bestSpread) {
      bestSpread = spread;
      i0 = lo;
      i1 = hi;
    }
  }
  if (bestSpread <= eps) return null;
  // Farthest from the line i0–i1.
  const lx = P(i1, 0) - P(i0, 0);
  const ly = P(i1, 1) - P(i0, 1);
  const lz = P(i1, 2) - P(i0, 2);
  let i2 = -1;
  let best = eps * eps;
  for (let i = 0; i < n; i++) {
    const vx = P(i, 0) - P(i0, 0);
    const vy = P(i, 1) - P(i0, 1);
    const vz = P(i, 2) - P(i0, 2);
    const cx = vy * lz - vz * ly;
    const cy = vz * lx - vx * lz;
    const cz = vx * ly - vy * lx;
    const d = cx * cx + cy * cy + cz * cz;
    if (d > best) {
      best = d;
      i2 = i;
    }
  }
  if (i2 < 0) return null;
  // Farthest from the plane i0 i1 i2.
  const ax = P(i2, 0) - P(i0, 0);
  const ay = P(i2, 1) - P(i0, 1);
  const az = P(i2, 2) - P(i0, 2);
  let pnx = ly * az - lz * ay;
  let pny = lz * ax - lx * az;
  let pnz = lx * ay - ly * ax;
  const pl = Math.hypot(pnx, pny, pnz);
  pnx /= pl;
  pny /= pl;
  pnz /= pl;
  let i3 = -1;
  best = eps;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(
      (P(i, 0) - P(i0, 0)) * pnx + (P(i, 1) - P(i0, 1)) * pny + (P(i, 2) - P(i0, 2)) * pnz,
    );
    if (d > best) {
      best = d;
      i3 = i;
    }
  }
  if (i3 < 0) return null;

  // Faces as flat arrays.
  const fa: number[] = [];
  const fb: number[] = [];
  const fc: number[] = [];
  const fn: number[] = []; // nx ny nz d
  const alive: boolean[] = [];
  const addFace = (a: number, b: number, c: number) => {
    const ux = P(b, 0) - P(a, 0);
    const uy = P(b, 1) - P(a, 1);
    const uz = P(b, 2) - P(a, 2);
    const vx = P(c, 0) - P(a, 0);
    const vy = P(c, 1) - P(a, 1);
    const vz = P(c, 2) - P(a, 2);
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    fa.push(a);
    fb.push(b);
    fc.push(c);
    fn.push(nx, ny, nz, nx * P(a, 0) + ny * P(a, 1) + nz * P(a, 2));
    alive.push(true);
  };
  // Orient the seed so faces point away from its centroid.
  const cx = (P(i0, 0) + P(i1, 0) + P(i2, 0) + P(i3, 0)) / 4;
  const cy = (P(i0, 1) + P(i1, 1) + P(i2, 1) + P(i3, 1)) / 4;
  const cz = (P(i0, 2) + P(i1, 2) + P(i2, 2) + P(i3, 2)) / 4;
  const seed = [
    [i0, i1, i2],
    [i0, i3, i1],
    [i1, i3, i2],
    [i2, i3, i0],
  ];
  for (const [a, b, c] of seed) {
    addFace(a, b, c);
    const f = fa.length - 1;
    if (fn[f * 4] * cx + fn[f * 4 + 1] * cy + fn[f * 4 + 2] * cz - fn[f * 4 + 3] > 0) {
      // Flip.
      fa.pop();
      fb.pop();
      fc.pop();
      fn.length -= 4;
      alive.pop();
      addFace(a, c, b);
    }
  }

  const used = new Uint8Array(n);
  used[i0] = used[i1] = used[i2] = used[i3] = 1;
  const visible: number[] = [];
  const edgeSet = new Map<number, number>();
  for (let p = 0; p < n; p++) {
    if (used[p]) continue;
    const px = P(p, 0);
    const py = P(p, 1);
    const pz = P(p, 2);
    visible.length = 0;
    for (let f = 0; f < fa.length; f++) {
      if (!alive[f]) continue;
      if (fn[f * 4] * px + fn[f * 4 + 1] * py + fn[f * 4 + 2] * pz - fn[f * 4 + 3] > eps)
        visible.push(f);
    }
    if (visible.length === 0) continue;
    used[p] = 1;
    // Horizon: directed edges of visible faces whose reverse is not in a visible face.
    edgeSet.clear();
    for (const f of visible) {
      edgeSet.set(fa[f] * n + fb[f], f);
      edgeSet.set(fb[f] * n + fc[f], f);
      edgeSet.set(fc[f] * n + fa[f], f);
    }
    for (const f of visible) alive[f] = false;
    for (const key of edgeSet.keys()) {
      const a = Math.floor(key / n);
      const b = key - a * n;
      if (!edgeSet.has(b * n + a)) addFace(a, b, p);
    }
  }

  // Compact.
  const index = new Int32Array(n).fill(-1);
  const outPts: number[] = [];
  const tris: number[] = [];
  for (let f = 0; f < fa.length; f++) {
    if (!alive[f]) continue;
    for (const v of [fa[f], fb[f], fc[f]]) {
      if (index[v] < 0) {
        index[v] = outPts.length / 3;
        outPts.push(P(v, 0), P(v, 1), P(v, 2));
      }
      tris.push(index[v]);
    }
  }
  if (tris.length < 12) return null;
  return { points: new Float64Array(outPts), triangles: new Int32Array(tris) };
}

const NORMAL_EPS = 1e-4;
const DIST_EPS = 0.01;

function hasPlane(planes: number[], nx: number, ny: number, nz: number, d: number): boolean {
  for (let i = 0; i < planes.length; i += 4) {
    if (
      Math.abs(planes[i] - nx) < NORMAL_EPS &&
      Math.abs(planes[i + 1] - ny) < NORMAL_EPS &&
      Math.abs(planes[i + 2] - nz) < NORMAL_EPS &&
      Math.abs(planes[i + 3] - d) < DIST_EPS
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Hull → outward planes (coplanar faces merged) + bevels. Every plane is
 * pushed out so all hull points lie on or behind it.
 */
export function hullPlanes(hull: ConvexHull): PlaneSet {
  const pts = hull.points;
  const np = pts.length / 3;
  const planes: number[] = [];
  const bevel: number[] = [];
  const maxOut = (nx: number, ny: number, nz: number): number => {
    let m = -Infinity;
    for (let i = 0; i < np; i++) {
      const v = nx * pts[i * 3] + ny * pts[i * 3 + 1] + nz * pts[i * 3 + 2];
      if (v > m) m = v;
    }
    return m;
  };
  const tris = hull.triangles;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    const ux = pts[b] - pts[a];
    const uy = pts[b + 1] - pts[a + 1];
    const uz = pts[b + 2] - pts[a + 2];
    const vx = pts[c] - pts[a];
    const vy = pts[c + 1] - pts[a + 1];
    const vz = pts[c + 2] - pts[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    nx /= l;
    ny /= l;
    nz /= l;
    // Snap near-axial normals (keeps axial bevel detection exact).
    if (Math.abs(nx) > 1 - 1e-6) [nx, ny, nz] = [Math.sign(nx), 0, 0];
    else if (Math.abs(ny) > 1 - 1e-6) [nx, ny, nz] = [0, Math.sign(ny), 0];
    else if (Math.abs(nz) > 1 - 1e-6) [nx, ny, nz] = [0, 0, Math.sign(nz)];
    const d = maxOut(nx, ny, nz);
    if (!hasPlane(planes, nx, ny, nz, d)) {
      planes.push(nx, ny, nz, d);
      bevel.push(0);
    }
  }
  // Axial bevels.
  for (let k = 0; k < 3; k++) {
    for (const s of [-1, 1]) {
      const nx = k === 0 ? s : 0;
      const ny = k === 1 ? s : 0;
      const nz = k === 2 ? s : 0;
      const d = maxOut(nx, ny, nz);
      if (!hasPlane(planes, nx, ny, nz, d)) {
        planes.push(nx, ny, nz, d);
        bevel.push(1);
      }
    }
  }
  // Edge bevels: planes containing a hull edge and an axis, with the hull behind.
  const seen = new Set<number>();
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const ia = tris[t + e];
      const ib = tris[t + ((e + 1) % 3)];
      const key = Math.min(ia, ib) * np + Math.max(ia, ib);
      if (seen.has(key)) continue;
      seen.add(key);
      let ex = pts[ib * 3] - pts[ia * 3];
      let ey = pts[ib * 3 + 1] - pts[ia * 3 + 1];
      let ez = pts[ib * 3 + 2] - pts[ia * 3 + 2];
      const el = Math.hypot(ex, ey, ez);
      if (el < 0.5) continue;
      ex /= el;
      ey /= el;
      ez /= el;
      for (let k = 0; k < 3; k++) {
        // edge × axis
        let nx = k === 0 ? 0 : k === 1 ? -ez : ey;
        let ny = k === 0 ? ez : k === 1 ? 0 : -ex;
        let nz = k === 0 ? -ey : k === 1 ? ex : 0;
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 0.5) continue; // edge nearly parallel to the axis
        nx /= nl;
        ny /= nl;
        nz /= nl;
        for (const s of [1, -1]) {
          const sx = nx * s;
          const sy = ny * s;
          const sz = nz * s;
          const d = sx * pts[ia * 3] + sy * pts[ia * 3 + 1] + sz * pts[ia * 3 + 2];
          if (maxOut(sx, sy, sz) > d + 0.01) continue; // not a supporting plane
          if (!hasPlane(planes, sx, sy, sz, d)) {
            planes.push(sx, sy, sz, d);
            bevel.push(1);
          }
        }
      }
    }
  }
  return { planes: new Float64Array(planes), bevel: new Uint8Array(bevel), count: bevel.length };
}

/** Points of an axis-aligned box. */
export function boxPoints(
  mins: { x: number; y: number; z: number },
  maxs: { x: number; y: number; z: number },
): Float64Array {
  const out = new Float64Array(24);
  let o = 0;
  for (let i = 0; i < 8; i++) {
    out[o++] = i & 1 ? maxs.x : mins.x;
    out[o++] = i & 2 ? maxs.y : mins.y;
    out[o++] = i & 4 ? maxs.z : mins.z;
  }
  return out;
}
