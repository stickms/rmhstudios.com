/**
 * Portal geometry, clean-room from the game's public behaviour: a portal is a
 * 64 × 112 unit rectangle on a surface, facing out of it. Two linked portals
 * form one passage: whatever enters the front of one leaves the front of the
 * other, turned so that "into portal A" becomes "out of portal B".
 *
 * Each portal has an orthonormal frame — forward (out of the surface), left
 * and up, the columns of the Source rotation matrix of its angles. The
 * passage maps a point by expressing it in A's frame, turning it half a
 * revolution about A's up axis (so A's front becomes B's back and vice versa:
 * a point just behind A comes out just in front of B) and placing that local
 * point in B's frame. Directions and velocities use the same rotation without
 * the translation, so speed is conserved exactly ("speedy thing goes in,
 * speedy thing comes out"); orientations compose with it.
 */

import { vec3, type Vec3 } from '../../tf2-game/core/vec';
import { anglesFromMat, matFromAngles, matMul, quatFromMat, quatMul, type Quat } from '../math';

/** Half the portal's width and height (64 × 112 units). */
export const PORTAL_HALF_WIDTH = 32;
export const PORTAL_HALF_HEIGHT = 56;

/** An oriented portal rectangle. */
export interface PortalFrame {
  /** Centre, on the surface. */
  origin: Vec3;
  /** Rotation matrix (row-major 3×3; columns forward, left, up). */
  m: Float64Array;
}

export function frameFromAngles(origin: Vec3, angles: Vec3): PortalFrame {
  const m = new Float64Array(9);
  matFromAngles(angles, m);
  return { origin: { x: origin.x, y: origin.y, z: origin.z }, m };
}

/** Frame from a surface normal (forward) and an up direction (made orthogonal to it). */
export function frameFromNormalUp(origin: Vec3, forward: Vec3, upHint: Vec3): PortalFrame {
  const f = norm({ ...forward });
  // up ⟂ f
  const d = upHint.x * f.x + upHint.y * f.y + upHint.z * f.z;
  const u = norm({ x: upHint.x - f.x * d, y: upHint.y - f.y * d, z: upHint.z - f.z * d });
  // left = up × forward
  const l = { x: u.y * f.z - u.z * f.y, y: u.z * f.x - u.x * f.z, z: u.x * f.y - u.y * f.x };
  const m = new Float64Array([f.x, l.x, u.x, f.y, l.y, u.y, f.z, l.z, u.z]);
  return { origin: { x: origin.x, y: origin.y, z: origin.z }, m };
}

export function frameAngles(frame: PortalFrame, out: Vec3 = vec3()): Vec3 {
  return anglesFromMat(frame.m, out);
}

export const frameForward = (fr: PortalFrame, out: Vec3 = vec3()): Vec3 => {
  out.x = fr.m[0];
  out.y = fr.m[3];
  out.z = fr.m[6];
  return out;
};
export const frameLeft = (fr: PortalFrame, out: Vec3 = vec3()): Vec3 => {
  out.x = fr.m[1];
  out.y = fr.m[4];
  out.z = fr.m[7];
  return out;
};
export const frameUp = (fr: PortalFrame, out: Vec3 = vec3()): Vec3 => {
  out.x = fr.m[2];
  out.y = fr.m[5];
  out.z = fr.m[8];
  return out;
};

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= l;
  v.y /= l;
  v.z /= l;
  return v;
}

/** The passage from portal A to portal B: a rotation `r` and translation `t` (p' = r·p + t). */
export interface PortalTransform {
  /** Row-major 3×3. */
  r: Float64Array;
  t: Vec3;
}

/** Half a turn about the local up axis: (x, y, z) → (−x, −y, z). */
const HALF_TURN = new Float64Array([-1, 0, 0, 0, -1, 0, 0, 0, 1]);

/** r = B · H · Aᵀ; t = oB − r·oA. */
export function portalTransform(a: PortalFrame, b: PortalFrame, out?: PortalTransform): PortalTransform {
  const res = out ?? { r: new Float64Array(9), t: vec3() };
  const at = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) at[i * 3 + j] = a.m[j * 3 + i];
  const bh = new Float64Array(9);
  matMul(b.m, HALF_TURN, bh);
  matMul(bh, at, res.r);
  const r = res.r;
  res.t.x = b.origin.x - (r[0] * a.origin.x + r[1] * a.origin.y + r[2] * a.origin.z);
  res.t.y = b.origin.y - (r[3] * a.origin.x + r[4] * a.origin.y + r[5] * a.origin.z);
  res.t.z = b.origin.z - (r[6] * a.origin.x + r[7] * a.origin.y + r[8] * a.origin.z);
  return res;
}

export function transformPoint(tr: PortalTransform, p: Vec3, out: Vec3 = vec3()): Vec3 {
  const r = tr.r;
  const x = r[0] * p.x + r[1] * p.y + r[2] * p.z + tr.t.x;
  const y = r[3] * p.x + r[4] * p.y + r[5] * p.z + tr.t.y;
  const z = r[6] * p.x + r[7] * p.y + r[8] * p.z + tr.t.z;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Directions and velocities (no translation): length is preserved exactly up to rounding. */
export function transformVector(tr: PortalTransform, v: Vec3, out: Vec3 = vec3()): Vec3 {
  const r = tr.r;
  const x = r[0] * v.x + r[1] * v.y + r[2] * v.z;
  const y = r[3] * v.x + r[4] * v.y + r[5] * v.z;
  const z = r[6] * v.x + r[7] * v.y + r[8] * v.z;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Euler angles through the passage (the orientation matrix composed with r). */
export function transformAngles(tr: PortalTransform, angles: Vec3, out: Vec3 = vec3()): Vec3 {
  const m = new Float64Array(9);
  matFromAngles(angles, m);
  matMul(tr.r, m, m);
  return anglesFromMat(m, out);
}

/** A quaternion orientation through the passage. */
export function transformQuat(tr: PortalTransform, q: Quat, out: Quat): Quat {
  const rq = quatFromMat(tr.r, { x: 0, y: 0, z: 0, w: 1 });
  return quatMul(rq, q, out);
}

/** Signed distance of a point in front of the portal plane. */
export function planeDistance(fr: PortalFrame, p: Vec3): number {
  return (p.x - fr.origin.x) * fr.m[0] + (p.y - fr.origin.y) * fr.m[3] + (p.z - fr.origin.z) * fr.m[6];
}

/** The point's coordinates along the portal's left and up axes. */
export function planeCoords(fr: PortalFrame, p: Vec3): { left: number; up: number } {
  const dx = p.x - fr.origin.x;
  const dy = p.y - fr.origin.y;
  const dz = p.z - fr.origin.z;
  return { left: dx * fr.m[1] + dy * fr.m[4] + dz * fr.m[7], up: dx * fr.m[2] + dy * fr.m[5] + dz * fr.m[8] };
}

/** Whether a point's projection lies inside the rectangle (shrunk by `margin`). */
export function withinRect(fr: PortalFrame, p: Vec3, margin = 0): boolean {
  const c = planeCoords(fr, p);
  return Math.abs(c.left) <= PORTAL_HALF_WIDTH - margin && Math.abs(c.up) <= PORTAL_HALF_HEIGHT - margin;
}

/**
 * Where a segment crosses the portal from its front to its back inside the
 * rectangle: the fraction along the segment, or −1.
 */
export function segmentEntersPortal(fr: PortalFrame, start: Vec3, end: Vec3, margin = 0): number {
  const d0 = planeDistance(fr, start);
  const d1 = planeDistance(fr, end);
  if (!(d0 >= 0 && d1 < 0)) return -1;
  const t = d0 / (d0 - d1);
  const px = start.x + (end.x - start.x) * t;
  const py = start.y + (end.y - start.y) * t;
  const pz = start.z + (end.z - start.z) * t;
  return withinRect(fr, { x: px, y: py, z: pz }, margin) ? t : -1;
}

/** Whether two portals' rectangles overlap (same plane, both rectangles), for placement. */
export function rectsOverlap(a: PortalFrame, b: PortalFrame): boolean {
  // Different planes don't overlap.
  const dn = a.m[0] * b.m[0] + a.m[3] * b.m[3] + a.m[6] * b.m[6];
  if (dn < 0.99) return false;
  if (Math.abs(planeDistance(a, b.origin)) > 2) return false;
  // Separating axis on the plane: a's left/up, b's left/up.
  const corners = (f: PortalFrame): Vec3[] => {
    const out: Vec3[] = [];
    for (const sl of [-1, 1])
      for (const su of [-1, 1])
        out.push({
          x: f.origin.x + f.m[1] * sl * PORTAL_HALF_WIDTH + f.m[2] * su * PORTAL_HALF_HEIGHT,
          y: f.origin.y + f.m[4] * sl * PORTAL_HALF_WIDTH + f.m[5] * su * PORTAL_HALF_HEIGHT,
          z: f.origin.z + f.m[7] * sl * PORTAL_HALF_WIDTH + f.m[8] * su * PORTAL_HALF_HEIGHT,
        });
    return out;
  };
  const ca = corners(a);
  const cb = corners(b);
  const axes: Vec3[] = [frameLeft(a), frameUp(a), frameLeft(b), frameUp(b)];
  for (const ax of axes) {
    let amin = Infinity;
    let amax = -Infinity;
    let bmin = Infinity;
    let bmax = -Infinity;
    for (const c of ca) {
      const d = c.x * ax.x + c.y * ax.y + c.z * ax.z;
      amin = Math.min(amin, d);
      amax = Math.max(amax, d);
    }
    for (const c of cb) {
      const d = c.x * ax.x + c.y * ax.y + c.z * ax.z;
      bmin = Math.min(bmin, d);
      bmax = Math.max(bmax, d);
    }
    if (amax <= bmin + 0.01 || bmax <= amin + 0.01) return false;
  }
  return true;
}
