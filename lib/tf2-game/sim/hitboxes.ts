/**
 * Player hitboxes for hitscan (CBaseAnimating::TestHitboxes /
 * CTFPlayer::TraceAttack's hit group). The real game traces the model's
 * animated hitbox set (bones × .mdl hitbox boxes); the server here has no
 * skeletons, so each class gets a hand-tuned set of oriented boxes in the
 * player's local frame (x forward, y left, z up from the feet), rotated by
 * the eye yaw, with a crouched variant. Sizes follow the shipped models'
 * proportions: the head box sits just above the class eye height (the
 * thing headshots care about), the torso splits into chest and stomach,
 * and arms and legs flank it.
 *
 * Traces allocate nothing: the boxes are static tables and the ray is
 * transformed into each box's frame on the fly.
 */

import {
  HITGROUP_CHEST,
  HITGROUP_HEAD,
  HITGROUP_LEFTARM,
  HITGROUP_LEFTLEG,
  HITGROUP_RIGHTARM,
  HITGROUP_RIGHTLEG,
  HITGROUP_STOMACH,
} from '../core/types';
import {
  TF_CLASS_COUNT,
  TF_CLASS_DEMOMAN,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_SOLDIER,
  VEC_DUCK_VIEW_Z,
} from '../core/constants';
import type { Vec3 } from '../core/vec';
import { classEyeHeight } from './class-speeds';

export interface Hitbox {
  group: number;
  /** Centre in the player's local frame. */
  cx: number;
  cy: number;
  cz: number;
  /** Half extents. */
  hx: number;
  hy: number;
  hz: number;
}

/** Torso width multiplier per class (heavy and soldier/demo are broader). */
const WIDTH: readonly number[] = [1, 0.9, 0.95, 1.05, 1.05, 1, 1.35, 1, 0.95, 1];

function buildSet(eye: number, width: number, crouched: boolean): Hitbox[] {
  const w = width;
  const head = crouched ? eye + 2 : eye + 3;
  const neck = head - 7;
  const hip = crouched ? eye * 0.5 : eye * 0.47;
  const waist = crouched ? eye * 0.68 : eye * 0.64;
  const legHalf = hip * 0.5;
  return [
    { group: HITGROUP_HEAD, cx: 1, cy: 0, cz: head, hx: 6.5, hy: 6, hz: 7 },
    { group: HITGROUP_CHEST, cx: 0, cy: 0, cz: (waist + neck) * 0.5, hx: 8 * w, hy: 11 * w, hz: (neck - waist) * 0.5 },
    { group: HITGROUP_STOMACH, cx: 0, cy: 0, cz: (hip + waist) * 0.5, hx: 7 * w, hy: 10 * w, hz: (waist - hip) * 0.5 },
    {
      group: HITGROUP_LEFTARM,
      cx: 2,
      cy: 15 * w,
      cz: (hip + neck) * 0.5,
      hx: 4,
      hy: 4 * w,
      hz: (neck - hip) * 0.5,
    },
    {
      group: HITGROUP_RIGHTARM,
      cx: 2,
      cy: -15 * w,
      cz: (hip + neck) * 0.5,
      hx: 4,
      hy: 4 * w,
      hz: (neck - hip) * 0.5,
    },
    { group: HITGROUP_LEFTLEG, cx: crouched ? 4 : 0, cy: 6 * w, cz: legHalf, hx: 5, hy: 4.5 * w, hz: legHalf },
    { group: HITGROUP_RIGHTLEG, cx: crouched ? 4 : 0, cy: -6 * w, cz: legHalf, hx: 5, hy: 4.5 * w, hz: legHalf },
  ];
}

const STANDING: Hitbox[][] = [];
const CROUCHED: Hitbox[][] = [];
for (let c = 0; c < TF_CLASS_COUNT; c++) {
  const w = WIDTH[c] ?? 1;
  STANDING.push(buildSet(classEyeHeight(c), w, false));
  // Crouched eye height is VEC_DUCK_VIEW for everyone; taller classes fold a little lower.
  const tall = c === TF_CLASS_HEAVYWEAPONS || c === TF_CLASS_SOLDIER || c === TF_CLASS_DEMOMAN ? 1 : 0;
  CROUCHED.push(buildSet(VEC_DUCK_VIEW_Z + tall, w, true));
}

/** The hitbox set for a class and stance. */
export function hitboxSet(classIndex: number, ducked: boolean): readonly Hitbox[] {
  const c = classIndex > 0 && classIndex < TF_CLASS_COUNT ? classIndex : 0;
  return ducked ? CROUCHED[c] : STANDING[c];
}

export interface HitboxTraceResult {
  fraction: number;
  group: number;
  /** Surface normal in world space. */
  normal: Vec3;
}

export const createHitboxTraceResult = (): HitboxTraceResult => ({
  fraction: 1,
  group: 0,
  normal: { x: 0, y: 0, z: 0 },
});

/**
 * Traces the segment start→end against a player's hitboxes. The player
 * stands at `origin` facing `yaw` degrees. Returns true and fills `out`
 * with the nearest hit when the segment touches any box. A start point
 * inside a box hits it at fraction 0.
 */
export function traceHitboxes(
  origin: Vec3,
  yaw: number,
  classIndex: number,
  ducked: boolean,
  start: Vec3,
  end: Vec3,
  out: HitboxTraceResult,
): boolean {
  const rad = (yaw * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // Ray into the player's local frame: rotate by −yaw.
  const sx = start.x - origin.x;
  const sy = start.y - origin.y;
  const ex = end.x - origin.x;
  const ey = end.y - origin.y;
  const lsx = sx * c + sy * s;
  const lsy = -sx * s + sy * c;
  const lsz = start.z - origin.z;
  const ldx = ex * c + ey * s - lsx;
  const ldy = -ex * s + ey * c - lsy;
  const ldz = end.z - origin.z - lsz;

  const boxes = hitboxSet(classIndex, ducked);
  let best = 2;
  let bestGroup = 0;
  let bestAxis = 0;
  let bestSign = 0;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    let tmin = 0;
    let tmax = 1;
    let axis = -1;
    let sign = 0;
    let miss = false;
    for (let a = 0; a < 3 && !miss; a++) {
      const o = a === 0 ? lsx - b.cx : a === 1 ? lsy - b.cy : lsz - b.cz;
      const d = a === 0 ? ldx : a === 1 ? ldy : ldz;
      const h = a === 0 ? b.hx : a === 1 ? b.hy : b.hz;
      if (Math.abs(d) < 1e-9) {
        if (o < -h || o > h) miss = true;
        continue;
      }
      const inv = 1 / d;
      let t1 = (-h - o) * inv;
      let t2 = (h - o) * inv;
      let sgn = -1;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
        sgn = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = a;
        sign = sgn;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) miss = true;
    }
    if (miss) continue;
    if (tmin < best) {
      best = tmin;
      bestGroup = b.group;
      bestAxis = axis;
      bestSign = sign;
    }
  }
  if (best > 1) return false;
  out.fraction = best;
  out.group = bestGroup;
  // Local normal → world (rotate by +yaw).
  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (bestAxis === 0) nx = bestSign;
  else if (bestAxis === 1) ny = bestSign;
  else if (bestAxis === 2) nz = bestSign;
  out.normal.x = nx * c - ny * s;
  out.normal.y = nx * s + ny * c;
  out.normal.z = nz;
  return true;
}
