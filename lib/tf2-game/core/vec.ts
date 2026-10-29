/**
 * Vector math for the TF2 simulation. Everything is in Source units (1 unit =
 * 1 inch = 0.01905 m), Z up, and angles are degrees in Source order
 * [pitch, yaw, roll] — the same conventions as the SDK so ported formulas read
 * the same. Hot paths take an `out` argument so a tick allocates nothing.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copy(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

/** out = a + b * s (the SDK's VectorMA). */
export function ma(out: Vec3, a: Vec3, s: number, b: Vec3): Vec3 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}

/** out = a + (b - a) * t */
export function lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export function cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export const length = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const length2D = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y);
export const lengthSqr = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distanceSqr(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/** Normalizes in place and returns the original length (VectorNormalize). */
export function normalize(a: Vec3): number {
  const len = length(a);
  if (len > 0) {
    const inv = 1 / len;
    a.x *= inv;
    a.y *= inv;
    a.z *= inv;
  } else {
    a.x = a.y = a.z = 0;
  }
  return len;
}

export const equals = (a: Vec3, b: Vec3, eps = 0): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;

export const isZero = (a: Vec3): boolean => a.x === 0 && a.y === 0 && a.z === 0;

export function get(a: Vec3, axis: 0 | 1 | 2): number {
  return axis === 0 ? a.x : axis === 1 ? a.y : a.z;
}

export function setAxis(a: Vec3, axis: 0 | 1 | 2, v: number): void {
  if (axis === 0) a.x = v;
  else if (axis === 1) a.y = v;
  else a.z = v;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Euler angles in degrees, Source order: x = pitch, y = yaw, z = roll. */
export type QAngle = Vec3;

/** The SDK's AngleVectors: forward/right/up from [pitch, yaw, roll]. */
export function angleVectors(angles: QAngle, forward?: Vec3, right?: Vec3, up?: Vec3): void {
  const sy = Math.sin(angles.y * DEG2RAD);
  const cy = Math.cos(angles.y * DEG2RAD);
  const sp = Math.sin(angles.x * DEG2RAD);
  const cp = Math.cos(angles.x * DEG2RAD);
  const sr = Math.sin(angles.z * DEG2RAD);
  const cr = Math.cos(angles.z * DEG2RAD);
  if (forward) set(forward, cp * cy, cp * sy, -sp);
  if (right) set(right, -1 * sr * sp * cy + -1 * cr * -sy, -1 * sr * sp * sy + -1 * cr * cy, -1 * sr * cp);
  if (up) set(up, cr * sp * cy + -sr * -sy, cr * sp * sy + -sr * cy, cr * cp);
}

/** The SDK's VectorAngles (no roll). */
export function vectorAngles(forward: Vec3, out: QAngle): QAngle {
  let yaw: number;
  let pitch: number;
  if (forward.y === 0 && forward.x === 0) {
    yaw = 0;
    pitch = forward.z > 0 ? 270 : 90;
  } else {
    yaw = Math.atan2(forward.y, forward.x) * RAD2DEG;
    if (yaw < 0) yaw += 360;
    const tmp = Math.sqrt(forward.x * forward.x + forward.y * forward.y);
    pitch = Math.atan2(-forward.z, tmp) * RAD2DEG;
    if (pitch < 0) pitch += 360;
  }
  return set(out, pitch, yaw, 0);
}

/** Wraps an angle into (-180, 180]. */
export function angleNormalize(a: number): number {
  a %= 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

/** Signed shortest difference b - a in degrees. */
export const angleDiff = (b: number, a: number): number => angleNormalize(b - a);

export const deg2rad = (d: number): number => d * DEG2RAD;
export const rad2deg = (r: number): number => r * RAD2DEG;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The SDK's RemapValClamped. */
export function remapClamped(val: number, a: number, b: number, c: number, d: number): number {
  if (a === b) return val >= b ? d : c;
  const t = clamp((val - a) / (b - a), 0, 1);
  return c + (d - c) * t;
}

/** The SDK's SimpleSplineRemapValClamped curve (3t² − 2t³). */
export function simpleSpline(t: number): number {
  const s = t * t;
  return 3 * s - 2 * s * t;
}
