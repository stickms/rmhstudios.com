/**
 * Swept axis-aligned box against a convex plane set — the brush clip of the
 * classic BSP trace (CM_ClipBoxToBrush), used for the dynamic physics props a
 * player bumps into and stands on. Each plane is pushed out by the box's
 * support along its normal; the trace keeps DIST_EPSILON off the surface;
 * bevel planes are skipped for point traces like the engine skips brush bevels
 * for rays. Writes into `out` only when it hits closer than `out.fraction`.
 */

import type { TraceResult } from '../../tf2-game/core/types';
import type { Vec3 } from '../../tf2-game/core/vec';

const DIST_EPSILON = 0.03125;

/** Returns true when `out` was updated. */
export function clipBoxToPlaneSet(
  planes: Float64Array,
  bevel: Uint8Array,
  count: number,
  start: Vec3,
  end: Vec3,
  mins: Vec3,
  maxs: Vec3,
  entity: number,
  contents: number,
  surfaceName: string,
  out: TraceResult,
): boolean {
  const isPoint = mins.x === 0 && mins.y === 0 && mins.z === 0 && maxs.x === 0 && maxs.y === 0 && maxs.z === 0;
  let enterFrac = -1;
  let leaveFrac = 1;
  let startOut = false;
  let getOut = false;
  let hit = -1;
  for (let i = 0; i < count; i++) {
    if (isPoint && bevel[i]) continue;
    const nx = planes[i * 4];
    const ny = planes[i * 4 + 1];
    const nz = planes[i * 4 + 2];
    let dist = planes[i * 4 + 3];
    if (!isPoint) {
      // Push the plane out by the box corner that leads along the normal.
      const ox = nx < 0 ? maxs.x : mins.x;
      const oy = ny < 0 ? maxs.y : mins.y;
      const oz = nz < 0 ? maxs.z : mins.z;
      dist -= nx * ox + ny * oy + nz * oz;
    }
    const d1 = start.x * nx + start.y * ny + start.z * nz - dist;
    const d2 = end.x * nx + end.y * ny + end.z * nz - dist;
    if (d2 > 0) getOut = true;
    if (d1 > 0) startOut = true;
    if (d1 > 0 && (d2 >= DIST_EPSILON || d2 >= d1)) return false;
    if (d1 <= 0 && d2 <= 0) continue;
    if (d1 > d2) {
      const f = (d1 - DIST_EPSILON) / (d1 - d2);
      if (f > enterFrac) {
        enterFrac = f;
        hit = i;
      }
    } else {
      const f = (d1 + DIST_EPSILON) / (d1 - d2);
      if (f < leaveFrac) leaveFrac = f;
    }
  }
  if (!startOut) {
    out.startSolid = true;
    if (!getOut) out.allSolid = true;
    out.fraction = 0;
    out.entity = entity;
    out.contents = contents;
    out.endPos.x = start.x;
    out.endPos.y = start.y;
    out.endPos.z = start.z;
    return true;
  }
  if (hit >= 0 && enterFrac < leaveFrac && enterFrac > -1 && enterFrac < out.fraction) {
    const f = enterFrac < 0 ? 0 : enterFrac;
    out.fraction = f;
    out.endPos.x = start.x + (end.x - start.x) * f;
    out.endPos.y = start.y + (end.y - start.y) * f;
    out.endPos.z = start.z + (end.z - start.z) * f;
    out.plane.normal.x = planes[hit * 4];
    out.plane.normal.y = planes[hit * 4 + 1];
    out.plane.normal.z = planes[hit * 4 + 2];
    out.plane.dist = planes[hit * 4 + 3];
    out.entity = entity;
    out.contents = contents;
    out.surfaceFlags = 0;
    out.surfaceName = surfaceName;
    out.hitGroup = 0;
    return true;
  }
  return false;
}

/** Swept box against an axis-aligned box (the box Minkowski-expanded by the hull). Returns true when `out` was updated. */
export function clipBoxToAabb(
  bmin: Vec3,
  bmax: Vec3,
  start: Vec3,
  end: Vec3,
  mins: Vec3,
  maxs: Vec3,
  entity: number,
  contents: number,
  out: TraceResult,
): boolean {
  const lo = [bmin.x - maxs.x, bmin.y - maxs.y, bmin.z - maxs.z];
  const hi = [bmax.x - mins.x, bmax.y - mins.y, bmax.z - mins.z];
  const s = [start.x, start.y, start.z];
  const e = [end.x, end.y, end.z];
  let enterFrac = -1;
  let leaveFrac = 1;
  let startOut = false;
  let getOut = false;
  let hitAxis = -1;
  let hitSign = 0;
  for (let plane = 0; plane < 6; plane++) {
    const axis = plane >> 1;
    const positive = (plane & 1) === 0;
    let d1: number;
    let d2: number;
    if (positive) {
      d1 = s[axis] - hi[axis];
      d2 = e[axis] - hi[axis];
    } else {
      d1 = lo[axis] - s[axis];
      d2 = lo[axis] - e[axis];
    }
    if (d2 > 0) getOut = true;
    if (d1 > 0) startOut = true;
    if (d1 > 0 && (d2 >= DIST_EPSILON || d2 >= d1)) return false;
    if (d1 <= 0 && d2 <= 0) continue;
    if (d1 > d2) {
      const f = (d1 - DIST_EPSILON) / (d1 - d2);
      if (f > enterFrac) {
        enterFrac = f;
        hitAxis = axis;
        hitSign = positive ? 1 : -1;
      }
    } else {
      const f = (d1 + DIST_EPSILON) / (d1 - d2);
      if (f < leaveFrac) leaveFrac = f;
    }
  }
  if (!startOut) {
    out.startSolid = true;
    if (!getOut) out.allSolid = true;
    out.fraction = 0;
    out.entity = entity;
    out.contents = contents;
    out.endPos.x = start.x;
    out.endPos.y = start.y;
    out.endPos.z = start.z;
    return true;
  }
  if (hitAxis >= 0 && enterFrac < leaveFrac && enterFrac > -1 && enterFrac < out.fraction) {
    const f = enterFrac < 0 ? 0 : enterFrac;
    out.fraction = f;
    out.endPos.x = start.x + (end.x - start.x) * f;
    out.endPos.y = start.y + (end.y - start.y) * f;
    out.endPos.z = start.z + (end.z - start.z) * f;
    out.plane.normal.x = hitAxis === 0 ? hitSign : 0;
    out.plane.normal.y = hitAxis === 1 ? hitSign : 0;
    out.plane.normal.z = hitAxis === 2 ? hitSign : 0;
    out.plane.dist = hitSign > 0 ? hi[hitAxis] : -lo[hitAxis];
    out.entity = entity;
    out.contents = contents;
    out.surfaceFlags = 0;
    out.surfaceName = '';
    out.hitGroup = 0;
    return true;
  }
  return false;
}
