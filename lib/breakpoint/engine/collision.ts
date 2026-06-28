// ============================================================
// BREAKPOINT — collision + raycast helpers (lightweight, no physics lib)
// ============================================================
import type { Vec3 } from '../types';
import { SOLID_BOXES as MAP_SOLID, type Box, ARENA } from '../map';
import { PLAYER_RADIUS, STEP_HEIGHT } from '../constants';

/** Temporary solid boxes (deployable walls). The engine maintains expiry and
 *  swaps the array; collision/raycast read it live. */
export let DYNAMIC_BOXES: Box[] = [];
export function setDynamicBoxes(boxes: Box[]): void { DYNAMIC_BOXES = boxes; }

function allSolids(): Box[] {
  return DYNAMIC_BOXES.length ? MAP_SOLID.concat(DYNAMIC_BOXES) : MAP_SOLID;
}

/** Smoke clouds that block line-of-sight. Engine swaps this each tick. */
export let SMOKES: { x: number; y: number; z: number; r: number }[] = [];
export function setSmokes(s: { x: number; y: number; z: number; r: number }[]): void { SMOKES = s; }

/** Resolve a capsule (treated as a vertical cylinder of given radius) against
 *  all solid boxes. Mutates and returns the corrected horizontal position.
 *  Simple axis-separated push-out — robust for axis-aligned boxes. */
export function resolveHorizontal(pos: Vec3, radius = PLAYER_RADIUS): Vec3 {
  // Clamp to arena
  pos.x = Math.max(ARENA.minX + radius, Math.min(ARENA.maxX - radius, pos.x));
  pos.z = Math.max(ARENA.minZ + radius, Math.min(ARENA.maxZ - radius, pos.z));

  for (const b of allSolids()) {
    // only collide if vertically overlapping (we're roughly at feet..head)
    const feet = pos.y;
    const head = pos.y + 1.8;
    if (b.cy + b.hy < feet || b.cy - b.hy > head) continue;

    const minX = b.cx - b.hx - radius;
    const maxX = b.cx + b.hx + radius;
    const minZ = b.cz - b.hz - radius;
    const maxZ = b.cz + b.hz + radius;
    if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
      // push out along the least-penetrating axis
      const penLeft = pos.x - minX;
      const penRight = maxX - pos.x;
      const penDown = pos.z - minZ;
      const penUp = maxZ - pos.z;
      const minPen = Math.min(penLeft, penRight, penDown, penUp);
      if (minPen === penLeft) pos.x = minX;
      else if (minPen === penRight) pos.x = maxX;
      else if (minPen === penDown) pos.z = minZ;
      else pos.z = maxZ;
    }
  }
  return pos;
}

/** Top surface height of any box you can stand on at (x,z), else 0 (ground).
 *  `fromY` is the actor's current feet height: a box only counts as ground if
 *  its top is at most STEP_HEIGHT above the feet, so geometry overhead (a
 *  bridge/header) or tall cover no longer snaps the actor up onto it. Callers
 *  that just want the highest surface (FX placement) can omit `fromY`. */
export function groundHeightAt(x: number, z: number, radius = PLAYER_RADIUS, fromY = Infinity): number {
  let h = 0;
  const reach = fromY + STEP_HEIGHT;
  for (const b of allSolids()) {
    const top = b.cy + b.hy;
    if (top > reach) continue; // too high to step onto (overhead / tall wall)
    if (x > b.cx - b.hx - radius && x < b.cx + b.hx + radius &&
        z > b.cz - b.hz - radius && z < b.cz + b.hz + radius) {
      h = Math.max(h, top);
    }
  }
  return h;
}

export interface RayHit {
  t: number;        // distance along ray
  point: Vec3;
  box: Box;
}

/** Ray vs all solid boxes — returns nearest hit within maxT, or null. */
export function raycastBoxes(origin: Vec3, dir: Vec3, maxT: number): RayHit | null {
  let best: RayHit | null = null;
  for (const b of allSolids()) {
    const hit = rayBox(origin, dir, b, maxT);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

function rayBox(o: Vec3, d: Vec3, b: Box, maxT: number): RayHit | null {
  const minX = b.cx - b.hx, maxX = b.cx + b.hx;
  const minY = b.cy - b.hy, maxY = b.cy + b.hy;
  const minZ = b.cz - b.hz, maxZ = b.cz + b.hz;

  let tmin = 0, tmax = maxT;
  for (const [oi, di, lo, hi] of [
    [o.x, d.x, minX, maxX] as const,
    [o.y, d.y, minY, maxY] as const,
    [o.z, d.z, minZ, maxZ] as const,
  ]) {
    if (Math.abs(di) < 1e-8) {
      if (oi < lo || oi > hi) return null;
    } else {
      let t1 = (lo - oi) / di;
      let t2 = (hi - oi) / di;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  if (tmin < 0 || tmin > maxT) return null;
  return { t: tmin, point: { x: o.x + d.x * tmin, y: o.y + d.y * tmin, z: o.z + d.z * tmin }, box: b };
}

/** Ray vs a sphere (used for hit detection on body/head). Returns t or null. */
export function raySphere(o: Vec3, d: Vec3, c: Vec3, r: number, maxT: number): number | null {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  if (t < 0 || t > maxT) return null;
  return t;
}

/** Ray vs vertical capsule (body cylinder). Approximate via the cylinder's
 *  closest-point; good enough for an arcade FPS. */
export function rayCapsule(o: Vec3, d: Vec3, base: Vec3, height: number, r: number, maxT: number): number | null {
  // Treat as infinite cylinder on Y then clamp the hit's y to [base, base+height]
  const dx = d.x, dz = d.z;
  const ox = o.x - base.x, oz = o.z - base.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return null;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxT) return null;
  const y = o.y + d.y * t;
  if (y < base.y || y > base.y + height) return null;
  return t;
}

export function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Line-of-sight between two points (eye height), blocked by solid boxes. */
export function hasLineOfSight(from: Vec3, to: Vec3): boolean {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return true;
  const dir = { x: dx / len, y: dy / len, z: dz / len };
  const hit = raycastBoxes(from, dir, len - 0.1);
  if (hit) return false;
  // Smokes block sight too
  for (const s of SMOKES) {
    if (raySphere(from, dir, s, s.r, len - 0.1) !== null) return false;
  }
  return true;
}
