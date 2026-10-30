/**
 * CS:GO movement on the shared `playerMove` (lib/tf2-game/sim/movement.ts — CGameMovement's port):
 * CS:GO's convars and hulls as `MoveParams`, and the CS rules around it that the shared movement
 * reads from the player each tick — the per-weapon max speed (items_game `max player speed`, `… alt`
 * scoped), walking, tagging (the flinch slow), and stamina. Clean-room: every number names its
 * public source; nothing comes from CS:GO's code.
 *
 * Pure functions over plain numbers, so the host and a predicting client run them identically.
 */

import type { MoveParams } from '../tf2-game/sim/movement-types';
import {
  PLAYER_FALL_PUNCH_THRESHOLD,
  PLAYER_MAX_SAFE_FALL_SPEED,
  PLAYER_MIN_BOUNCE_SPEED,
} from '../tf2-game/sim/movement';
import type { PlayerHull } from '../tf2-game/sim/player';

// ─── Convars (VDC "List of CS:GO Cvars", their default values) ────────────────────────────────

/** sv_gravity 800. */
export const CS_SV_GRAVITY = 800;
/** sv_friction 5.2. */
export const CS_SV_FRICTION = 5.2;
/** sv_stopspeed 80. */
export const CS_SV_STOPSPEED = 80;
/** sv_accelerate 5.5 (competitive; casual servers ran 5.5 too since 2017). */
export const CS_SV_ACCELERATE = 5.5;
/** sv_airaccelerate 12. */
export const CS_SV_AIRACCELERATE = 12;
/** sv_maxspeed 320: no weapon can push a player past it. */
export const CS_SV_MAXSPEED = 320;
/** sv_maxvelocity 3500, sv_stepsize 18 (the engine defaults). */
export const CS_SV_MAXVELOCITY = 3500;
export const CS_SV_STEPSIZE = 18;
/**
 * The jump: CS:GO's measured jump apex is 57 units (the community's "jump height 57" — the reason
 * 56-unit boxes are jumpable), so the impulse is √(2 · sv_gravity · 57) ≈ 301.993.
 */
export const CS_JUMP_HEIGHT = 57;
export const CS_JUMP_IMPULSE = Math.sqrt(2 * CS_SV_GRAVITY * CS_JUMP_HEIGHT);
/**
 * sv_enablebunnyhopping 0: a ground jump leaves with at most 1.1 × the player's max speed (the
 * community's measurement of CS:GO's cap; TF2 caps at 1.2).
 */
export const CS_BUNNYJUMP_MAX_SPEED_FACTOR = 1.1;
/** Crouched players move at 34 % of their speed (the CS:GO wiki: "crouch-walking at 34 %"). */
export const CS_DUCK_SPEED_FRACTION = 0.34;
/** Shift-walking: 52 % of the weapon's speed (the CS:GO wiki's walking speeds, e.g. 250 → 130). */
export const CS_WALK_SPEED_FRACTION = 0.52;

// ─── Stamina (VDC cvars: sv_staminamax, sv_staminajumpcost, sv_staminalandcost, sv_staminarecoveryrate) ──

/** sv_staminamax 80: the most stamina penalty a player can carry. */
export const SV_STAMINAMAX = 80;
/** sv_staminajumpcost 0.08: the penalty a jump adds, as a share of the jump's impulse. */
export const SV_STAMINAJUMPCOST = 0.08;
/** sv_staminalandcost 0.05: the penalty a landing adds, as a share of the landing speed. */
export const SV_STAMINALANDCOST = 0.05;
/** sv_staminarecoveryrate 60: the penalty recovered per second. */
export const SV_STAMINARECOVERYRATE = 60;

// ─── Hulls and eyes (VDC "CS:GO Player": 32 × 32 × 72, crouched 54; eyes 64 / 46) ──────────

export const CS_PLAYER_HULL: PlayerHull = Object.freeze({
  min: Object.freeze({ x: -16, y: -16, z: 0 }),
  max: Object.freeze({ x: 16, y: 16, z: 72 }),
  duckMin: Object.freeze({ x: -16, y: -16, z: 0 }),
  duckMax: Object.freeze({ x: 16, y: 16, z: 54 }),
});
export const CS_VIEW_Z = 64;
export const CS_DUCK_VIEW_Z = 46;

/** CS:GO's movement on the shared playerMove. */
export const CS_MOVE_PARAMS: Readonly<MoveParams> = Object.freeze({
  gravity: CS_SV_GRAVITY,
  sv_friction: CS_SV_FRICTION,
  sv_stopspeed: CS_SV_STOPSPEED,
  sv_accelerate: CS_SV_ACCELERATE,
  sv_airaccelerate: CS_SV_AIRACCELERATE,
  sv_maxvelocity: CS_SV_MAXVELOCITY,
  sv_stepsize: CS_SV_STEPSIZE,
  maxSpeedCap: CS_SV_MAXSPEED,
  jumpImpulse: CS_JUMP_IMPULSE,
  hullMin: CS_PLAYER_HULL.min,
  hullMax: CS_PLAYER_HULL.max,
  duckHullMin: CS_PLAYER_HULL.duckMin,
  duckHullMax: CS_PLAYER_HULL.duckMax,
  duckViewZ: CS_DUCK_VIEW_Z,
  viewZ: CS_VIEW_Z,
  // The base engine's duck timing (shareddefs.h TIME_TO_DUCK / TIME_TO_UNDUCK, non-TF build: 0.4 / 0.2)
  // is slower than CS:GO's measured ~0.2 s crouch; CS:GO's own value is used.
  timeToDuck: 0.2,
  timeToUnduck: 0.2,
  maxSafeFallSpeed: PLAYER_MAX_SAFE_FALL_SPEED,
  minBounceSpeed: PLAYER_MIN_BOUNCE_SPEED,
  fallPunchThreshold: PLAYER_FALL_PUNCH_THRESHOLD,
  waterJumpForward: 24,
  waterJumpUp: 256,
  // Base CGameMovement rules: crouch-jumping allowed, no backpedal clamp, no air-duck count.
  tfRules: false,
  hl2JumpBoost: false,
  duckSpeedFraction: CS_DUCK_SPEED_FRACTION,
  bunnyJumpMaxSpeedFactor: CS_BUNNYJUMP_MAX_SPEED_FACTOR,
});

// ─── Stamina ────────────────────────────────────────────────────────────────────────────────

/**
 * The stamina penalty as a speed / jump multiplier: (100 − stamina) / 100. (Clean-room model of
 * the documented cvars: the penalty is a percentage taken off the player's speed and jump.)
 */
export const staminaScale = (stamina: number): number => Math.max(0, (100 - stamina) / 100);

/** A ground jump costs sv_staminajumpcost × the impulse. */
export const staminaAfterJump = (stamina: number, impulse = CS_JUMP_IMPULSE): number =>
  Math.min(SV_STAMINAMAX, stamina + SV_STAMINAJUMPCOST * impulse);

/** A landing costs sv_staminalandcost × the landing speed. */
export const staminaAfterLand = (stamina: number, fallSpeed: number): number =>
  Math.min(SV_STAMINAMAX, stamina + SV_STAMINALANDCOST * Math.max(0, fallSpeed));

/** Recovers sv_staminarecoveryrate per second. */
export const staminaRecover = (stamina: number, dt: number): number =>
  Math.max(0, stamina - SV_STAMINARECOVERYRATE * dt);

// ─── Speed ──────────────────────────────────────────────────────────────────────────────────

/**
 * The player's max speed this tick: the active weapon's (`max player speed`, `… alt` while
 * scoped), shift-walking at 52 %, the tagging slow (`velocityModifier`, 0…1) and the stamina
 * penalty, never above sv_maxspeed. Crouching is the movement's own 34 % (CS_MOVE_PARAMS).
 */
export function csMaxSpeed(
  weaponSpeed: number,
  walking: boolean,
  velocityModifier: number,
  stamina: number,
): number {
  let s = Math.min(weaponSpeed, CS_SV_MAXSPEED);
  if (walking) s *= CS_WALK_SPEED_FRACTION;
  s *= Math.max(0, Math.min(1, velocityModifier));
  s *= staminaScale(stamina);
  return s;
}

/**
 * Tagging recovery: the flinch slow (`flinch velocity modifier large/small` from the weapon data)
 * wears off at this rate per second (community measurement: a tagged player is back to full speed
 * within about a second).
 */
export const VELOCITY_MODIFIER_RECOVERY = 1.0;

/**
 * Fall damage, the engine's rule (multiplay_gamerules FlPlayerFallDamage, the public SDK): past
 * PLAYER_MAX_SAFE_FALL_SPEED (580), 100 damage per (PLAYER_FATAL_FALL_SPEED 1024 − 580) of speed.
 */
export const PLAYER_FATAL_FALL_SPEED = 1024;
export const csFallDamage = (fallSpeed: number): number =>
  fallSpeed <= PLAYER_MAX_SAFE_FALL_SPEED
    ? 0
    : (fallSpeed - PLAYER_MAX_SAFE_FALL_SPEED) *
      (100 / (PLAYER_FATAL_FALL_SPEED - PLAYER_MAX_SAFE_FALL_SPEED));
