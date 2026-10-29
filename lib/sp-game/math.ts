/**
 * Rotation helpers in Source conventions (Z up, angles [pitch, yaw, roll] in
 * degrees): quaternions and 3×3 matrices whose columns are forward, left, up
 * (SDK: mathlib AngleMatrix / AngleQuaternion / MatrixAngles). Shared by the
 * physics wrapper (Rapier quaternions), portals and parenting.
 */

import type { Vec3 } from '../tf2-game/core/vec';

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** SDK: AngleQuaternion. */
export function quatFromAngles(a: Vec3, out: Quat = { x: 0, y: 0, z: 0, w: 1 }): Quat {
  const sy = Math.sin(a.y * D2R * 0.5);
  const cy = Math.cos(a.y * D2R * 0.5);
  const sp = Math.sin(a.x * D2R * 0.5);
  const cp = Math.cos(a.x * D2R * 0.5);
  const sr = Math.sin(a.z * D2R * 0.5);
  const cr = Math.cos(a.z * D2R * 0.5);
  out.x = sr * cp * cy - cr * sp * sy;
  out.y = cr * sp * cy + sr * cp * sy;
  out.z = cr * cp * sy - sr * sp * cy;
  out.w = cr * cp * cy + sr * sp * sy;
  return out;
}

/** Row-major 3×3 from a quaternion (columns: forward, left, up). */
export function matFromQuat(q: Quat, m: Float64Array | number[]): void {
  const { x, y, z, w } = q;
  m[0] = 1 - 2 * (y * y + z * z);
  m[1] = 2 * (x * y - w * z);
  m[2] = 2 * (x * z + w * y);
  m[3] = 2 * (x * y + w * z);
  m[4] = 1 - 2 * (x * x + z * z);
  m[5] = 2 * (y * z - w * x);
  m[6] = 2 * (x * z - w * y);
  m[7] = 2 * (y * z + w * x);
  m[8] = 1 - 2 * (x * x + y * y);
}

/** SDK: AngleMatrix (row-major; columns forward, left, up). */
export function matFromAngles(a: Vec3, m: Float64Array | number[]): void {
  const sy = Math.sin(a.y * D2R);
  const cy = Math.cos(a.y * D2R);
  const sp = Math.sin(a.x * D2R);
  const cp = Math.cos(a.x * D2R);
  const sr = Math.sin(a.z * D2R);
  const cr = Math.cos(a.z * D2R);
  m[0] = cp * cy;
  m[3] = cp * sy;
  m[6] = -sp;
  m[1] = sr * sp * cy + cr * -sy;
  m[4] = sr * sp * sy + cr * cy;
  m[7] = sr * cp;
  m[2] = cr * sp * cy + -sr * -sy;
  m[5] = cr * sp * sy + -sr * cy;
  m[8] = cr * cp;
}

/** SDK: MatrixAngles. */
export function anglesFromMat(m: ArrayLike<number>, out: Vec3): Vec3 {
  const fx = m[0];
  const fy = m[3];
  const fz = m[6];
  const lx = m[1];
  const ly = m[4];
  const lz = m[7];
  const uz = m[8];
  const xy = Math.sqrt(fx * fx + fy * fy);
  if (xy > 0.001) {
    out.y = Math.atan2(fy, fx) * R2D;
    out.x = Math.atan2(-fz, xy) * R2D;
    out.z = Math.atan2(lz, uz) * R2D;
  } else {
    out.y = Math.atan2(-lx, ly) * R2D;
    out.x = Math.atan2(-fz, xy) * R2D;
    out.z = 0;
  }
  return out;
}

const scratchM = new Float64Array(9);

export function anglesFromQuat(q: Quat, out: Vec3): Vec3 {
  matFromQuat(q, scratchM);
  return anglesFromMat(scratchM, out);
}

/** out = M · v. */
export function matMulVec(m: ArrayLike<number>, v: Vec3, out: Vec3): Vec3 {
  const x = m[0] * v.x + m[1] * v.y + m[2] * v.z;
  const y = m[3] * v.x + m[4] * v.y + m[5] * v.z;
  const z = m[6] * v.x + m[7] * v.y + m[8] * v.z;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** out = Mᵀ · v (the inverse rotation). */
export function matTMulVec(m: ArrayLike<number>, v: Vec3, out: Vec3): Vec3 {
  const x = m[0] * v.x + m[3] * v.y + m[6] * v.z;
  const y = m[1] * v.x + m[4] * v.y + m[7] * v.z;
  const z = m[2] * v.x + m[5] * v.y + m[8] * v.z;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** out = A · B (row-major 3×3). */
export function matMul(a: ArrayLike<number>, b: ArrayLike<number>, out: Float64Array | number[]): void {
  const r = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  for (let k = 0; k < 9; k++) out[k] = r[k];
}

/** Rotates v by q. */
export function quatRotate(q: Quat, v: Vec3, out: Vec3): Vec3 {
  const { x, y, z, w } = q;
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  const rx = v.x + w * tx + (y * tz - z * ty);
  const ry = v.y + w * ty + (z * tx - x * tz);
  const rz = v.z + w * tz + (x * ty - y * tx);
  out.x = rx;
  out.y = ry;
  out.z = rz;
  return out;
}

/** a ⊗ b. */
export function quatMul(a: Quat, b: Quat, out: Quat): Quat {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
  return out;
}

export function quatFromMat(m: ArrayLike<number>, out: Quat): Quat {
  const tr = m[0] + m[4] + m[8];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    out.w = 0.25 * s;
    out.x = (m[7] - m[5]) / s;
    out.y = (m[2] - m[6]) / s;
    out.z = (m[3] - m[1]) / s;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    out.w = (m[7] - m[5]) / s;
    out.x = 0.25 * s;
    out.y = (m[1] + m[3]) / s;
    out.z = (m[2] + m[6]) / s;
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    out.w = (m[2] - m[6]) / s;
    out.x = (m[1] + m[3]) / s;
    out.y = 0.25 * s;
    out.z = (m[5] + m[7]) / s;
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    out.w = (m[3] - m[1]) / s;
    out.x = (m[2] + m[6]) / s;
    out.y = (m[5] + m[7]) / s;
    out.z = 0.25 * s;
  }
  return out;
}

export const finiteVec = (v: Vec3): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
