/**
 * The globe's geometry — where the cards sit on the sphere, and where that puts
 * them on screen.
 *
 * Pure and DOM-free so the projection can be tested against
 * {@link unrotateSphere}, which is the inverse this whole file has to agree
 * with: a gesture arrives in view space and is carried back into the sphere's
 * own body space by that function, while everything drawn goes the other way.
 * If the two ever disagree, a card lands under your finger and a different one
 * lights up.
 *
 * ## Slots, not cards
 *
 * The seven directions are fixed and indexed by BOARD POSITION. A slot's card
 * changes when a set is claimed and the board refills; the slot does not move.
 * Pinning the direction to the card instead would re-scatter the sphere on
 * every claim — you would turn toward a card and arrive at nothing, which is
 * the one thing a globe you navigate by memory must never do.
 */

import { unrotateSphere } from '@/lib/fluid';
import { BOARD_SIZE } from './cards';

/** A unit vector in the sphere's own space. x right, y **down**, z to the viewer. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * CSS perspective, in sphere radii, used by both the projection and the
 * inverse. 3.1 is the radial globe's value and it is the reason the two read as
 * the same object: the amount of "over the horizon" you can see is entirely
 * this number.
 */
export const GLOBE_PERSPECTIVE = 3.1;

/**
 * Degrees of turn per pixel dragged. Matches the radial navigator, so a flick
 * that spins that globe once spins this one once.
 */
export const ROT_PER_PX = 0.45;

/**
 * How far the sphere may be tilted before the rubber band takes over. Past this
 * a pole would swing to the front, where the cards around it crowd into a point.
 */
export const PITCH_LIMIT = 58;

/**
 * Latitude spread of the seven slots, as a fraction of a full hemisphere.
 *
 * A plain Fibonacci sphere puts its first and last points on the poles, which
 * are the two places on a pitch-limited globe you cannot bring to the front.
 * Squeezing the band to ±0.62 keeps every slot inside the reachable belt while
 * still looking scattered rather than ringed.
 */
const LATITUDE_SPREAD = 0.62;

/** The golden angle — the spiral that keeps successive slots far apart. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * `count` evenly-scattered directions on the sphere, deterministic and stable.
 *
 * Deterministic matters twice over: the slot a card sits in has to be the same
 * on every render, and the same in two browsers racing the same deal.
 */
export function slotDirections(count: number = BOARD_SIZE): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const y = LATITUDE_SPREAD * (1 - (2 * i + 1) / count);
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * GOLDEN_ANGLE;
    out.push({ x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring });
  }
  return out;
}

/** The seven slots of a full board, computed once. */
export const SLOT_DIRECTIONS: readonly Vec3[] = slotDirections();

/**
 * Body space → view space: yaw about the (downward) Y axis, then pitch about X.
 *
 * Exactly the rotation {@link unrotateSphere} undoes, in exactly that order.
 */
export function rotateToView(n: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const d = Math.PI / 180;
  const cy = Math.cos(yawDeg * d);
  const sy = Math.sin(yawDeg * d);
  const cp = Math.cos(pitchDeg * d);
  const sp = Math.sin(pitchDeg * d);
  const x1 = n.x * cy + n.z * sy;
  const z1 = -n.x * sy + n.z * cy;
  return { x: x1, y: n.y * cp - z1 * sp, z: n.y * sp + z1 * cp };
}

/** Foreshortening applied at depth `z`. Near face grows, far face shrinks. */
export function depthScale(z: number, perspective: number = GLOBE_PERSPECTIVE): number {
  return perspective / (perspective - z * 0.5);
}

export interface Placement {
  /** Pixels from the stage centre. */
  left: number;
  top: number;
  /** Perspective scale to draw the card at. */
  scale: number;
  /** View-space depth, −1 (far) … 1 (near). */
  depth: number;
}

/** Where a view-space direction lands on a stage of the given radius. */
export function place(v: Vec3, radius: number, perspective: number = GLOBE_PERSPECTIVE): Placement {
  const k = depthScale(v.z, perspective);
  return { left: v.x * radius * k, top: v.y * radius * k, scale: k, depth: v.z };
}

/**
 * The yaw and pitch that bring `n` to the front of the sphere.
 *
 * Used by the keyboard path: tabbing to a card turns the globe until that card
 * faces you, so the focus ring and the picture agree about which card is being
 * talked about.
 */
export function faceFrontAngles(n: Vec3): { yaw: number; pitch: number } {
  const deg = 180 / Math.PI;
  // Yaw so the slot's x component vanishes and it sits on the z axis.
  let yaw = Math.atan2(-n.x, n.z);
  const z1 = -n.x * Math.sin(yaw) + n.z * Math.cos(yaw);
  // atan2 lands on the axis; a negative z means it landed on the far side.
  if (z1 < 0) yaw += Math.PI;
  const z2 = -n.x * Math.sin(yaw) + n.z * Math.cos(yaw);
  const pitch = Math.atan2(n.y, z2);
  return { yaw: yaw * deg, pitch: pitch * deg };
}

/** Fold a yaw into −180…180 so a turn past the seam is still the short way round. */
export function wrapDegrees(a: number): number {
  const wrapped = (((a + 180) % 360) + 360) % 360;
  return wrapped - 180;
}

export { unrotateSphere };
