import type { World } from '../world';
import { canStand } from './collision';

/** Tiles per second. A tile is ~4 m, so a walk is a brisk 6 m/s stroll-trot and a run a sprint; chosen for feel. */
export const WALK_SPEED = 1.6;
export const RUN_SPEED = 3.0;
/** Units/s² — about 0.15 s from standing to a walk, so starts and stops feel soft, never instant. */
const ACCEL = 11;
/** Turning rate constant (1/s) for the exponential approach to the heading. */
const TURN_RATE = 14;

export interface AvatarState {
  x: number;
  z: number;
  /** Direction faced: 0 faces +z, increasing toward +x (so forward = (sin yaw, cos yaw)). */
  yaw: number;
  /** Current ground speed, units/s. */
  speed: number;
}

/** Desired movement in WORLD space (the caller rotates stick/keys by the camera); length ≤ 1. */
export interface MoveInput {
  x: number;
  z: number;
  run: boolean;
}

const wrapPi = (a: number) => {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r < -Math.PI) r += 2 * Math.PI;
  return r;
};

export function stepAvatar(world: World, s: AvatarState, input: MoveInput, dtMs: number): AvatarState {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? Math.min(dtMs, 100) / 1000 : 0;
  if (dt === 0) return s;
  let ix = Number.isFinite(input.x) ? input.x : 0;
  let iz = Number.isFinite(input.z) ? input.z : 0;
  const mag = Math.hypot(ix, iz);
  if (mag > 1) {
    ix /= mag;
    iz /= mag;
  }
  const m = Math.min(1, mag);
  const target = m * (input.run ? RUN_SPEED : WALK_SPEED);
  const speed = s.speed + Math.max(-ACCEL * dt, Math.min(ACCEL * dt, target - s.speed));

  let yaw = s.yaw;
  if (m > 0.05) {
    const heading = Math.atan2(ix, iz);
    yaw = wrapPi(yaw + wrapPi(heading - yaw) * (1 - Math.exp(-TURN_RATE * dt)));
  }

  // Move along the way we are facing (so a sharp turn curves), one axis at a time so we slide along walls.
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const fromX = Math.round(s.x);
  const fromZ = Math.round(s.z);
  let x = s.x;
  let z = s.z;
  const dx = fx * speed * dt;
  const dz = fz * speed * dt;
  const stuck = !canStand(world, s.x, s.z, fromX, fromZ);
  if (canStand(world, x + dx, z, fromX, fromZ, stuck)) x += dx;
  if (canStand(world, x, z + dz, fromX, fromZ, stuck)) z += dz;
  const moved = Math.hypot(x - s.x, z - s.z) / dt;
  return { x, z, yaw, speed: Math.min(speed, moved + 0.001) };
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How much of each locomotion clip to play at this speed; always sums to 1, so clips crossfade smoothly. */
export function locomotionBlend(speed: number): { idle: number; walk: number; run: number } {
  const v = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const moving = smoothstep(0.1, 0.9, v);
  const running = smoothstep(WALK_SPEED + 0.2, RUN_SPEED - 0.2, v);
  return { idle: 1 - moving, walk: moving * (1 - running), run: moving * running };
}
