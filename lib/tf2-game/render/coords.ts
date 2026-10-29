/**
 * Source ↔ three.js coordinates. Source is inches, Z up, right-handed (x forward,
 * y left); the renderer is metres, Y up. The mapping (x, y, z) → (y, z, x) · 0.01905
 * is the one the loadout's GLBs and particles already use (lib/tf2-loadout/particles
 * `sourceToGl`), so models and effects drop in unchanged. It is an even permutation,
 * so handedness (and therefore winding) is preserved.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';

/** Metres per Source unit (1 inch). */
export const SOURCE_UNIT = 0.01905;

/** Source point (inches) → three position (metres). */
export function srcToThree(x: number, y: number, z: number, out: Vector3): Vector3 {
  return out.set(y * SOURCE_UNIT, z * SOURCE_UNIT, x * SOURCE_UNIT);
}

/** Source direction → three direction (no scale). */
export function srcDirToThree(x: number, y: number, z: number, out: Vector3): Vector3 {
  return out.set(y, z, x);
}

/** three position (metres) → Source point (inches). */
export function threeToSrc(v: Vector3, out: { x: number; y: number; z: number }) {
  out.x = v.z / SOURCE_UNIT;
  out.y = v.x / SOURCE_UNIT;
  out.z = v.y / SOURCE_UNIT;
  return out;
}

const D2R = Math.PI / 180;

/**
 * SDK: AngleVectors — forward, right, up of [pitch, yaw, roll] (degrees), Source space.
 * Each out array is xyz.
 */
export function angleVectors(
  pitch: number,
  yaw: number,
  roll: number,
  forward: number[] | Float64Array,
  right?: number[] | Float64Array,
  up?: number[] | Float64Array,
): void {
  const sp = Math.sin(pitch * D2R);
  const cp = Math.cos(pitch * D2R);
  const sy = Math.sin(yaw * D2R);
  const cy = Math.cos(yaw * D2R);
  const sr = Math.sin(roll * D2R);
  const cr = Math.cos(roll * D2R);
  forward[0] = cp * cy;
  forward[1] = cp * sy;
  forward[2] = -sp;
  if (right) {
    right[0] = -1 * sr * sp * cy + -1 * cr * -sy;
    right[1] = -1 * sr * sp * sy + -1 * cr * cy;
    right[2] = -1 * sr * cp;
  }
  if (up) {
    up[0] = cr * sp * cy + -sr * -sy;
    up[1] = cr * sp * sy + -sr * cy;
    up[2] = cr * cp;
  }
}

const fwd = [0, 0, 0];
const rgt = [0, 0, 0];
const upv = [0, 0, 0];
const ax = new Vector3();
const ay = new Vector3();
const az = new Vector3();
const basis = new Matrix4();

/** The three.js camera orientation looking along Source angles [pitch, yaw, roll]. */
export function sourceAnglesToCameraQuaternion(
  pitch: number,
  yaw: number,
  roll: number,
  out: Quaternion,
): Quaternion {
  angleVectors(pitch, yaw, roll, fwd, rgt, upv);
  srcDirToThree(rgt[0], rgt[1], rgt[2], ax);
  srcDirToThree(upv[0], upv[1], upv[2], ay);
  srcDirToThree(-fwd[0], -fwd[1], -fwd[2], az);
  basis.makeBasis(ax, ay, az);
  return out.setFromRotationMatrix(basis);
}

/**
 * The model→world matrix (three space) of something placed at a Source origin with
 * Source angles (SDK: AngleMatrix — columns forward, left, up) and a uniform scale,
 * whose geometry is already in three's axes and metres (GLBs, brush models converted
 * with srcToThree).
 */
export function sourceTransformToMatrix(
  origin: { x: number; y: number; z: number },
  angles: { x: number; y: number; z: number },
  scale: number,
  out: Matrix4,
): Matrix4 {
  angleVectors(angles.x, angles.y, angles.z, fwd, rgt, upv);
  // Source rotation columns: forward, left (= −right), up. In three axes the source
  // basis vector e_x maps to three e_z, e_y → e_x, e_z → e_y, so three column for
  // three-axis k is the converted image of the matching source axis.
  // three x-axis (source y) → image of source left; three y (source z) → up; three z (source x) → forward.
  const lx = -rgt[0];
  const ly = -rgt[1];
  const lz = -rgt[2];
  // Columns in three space: convert each source vector (a, b, c) → (b, c, a).
  out.set(
    ly * scale, upv[1] * scale, fwd[1] * scale, origin.y * SOURCE_UNIT,
    lz * scale, upv[2] * scale, fwd[2] * scale, origin.z * SOURCE_UNIT,
    lx * scale, upv[0] * scale, fwd[0] * scale, origin.x * SOURCE_UNIT,
    0, 0, 0, 1,
  );
  return out;
}

/**
 * Like sourceTransformToMatrix, for geometry that keeps Source's axes (metres): the
 * model channel's static (unskinned) props store MDL model-space positions × 0.01905
 * without the axis swap. three = P · (R · v + origin), P: Source (x, y, z) → (y, z, x).
 */
export function sourceTransformToMatrixSrcAxes(
  origin: { x: number; y: number; z: number },
  angles: { x: number; y: number; z: number },
  scale: number,
  out: Matrix4,
): Matrix4 {
  angleVectors(angles.x, angles.y, angles.z, fwd, rgt, upv);
  // R columns: forward, left (−right), up; row k of P·R is source row (k+1) % 3.
  out.set(
    fwd[1] * scale, -rgt[1] * scale, upv[1] * scale, origin.y * SOURCE_UNIT,
    fwd[2] * scale, -rgt[2] * scale, upv[2] * scale, origin.z * SOURCE_UNIT,
    fwd[0] * scale, -rgt[0] * scale, upv[0] * scale, origin.x * SOURCE_UNIT,
    0, 0, 0, 1,
  );
  return out;
}
