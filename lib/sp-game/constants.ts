/**
 * Game constants for the single-player layer: Half-Life 2 (SDK: hl2_player.cpp,
 * gamerules.cpp g_DefaultViewVectors, shareddefs.h HL2 block, gamemovement.cpp)
 * and Portal (clean-room: public behaviour and the Valve Developer Community
 * entity documentation — no Portal game code is used).
 *
 * Both run on sv_gravity 600 and the base CGameMovement rules, through the
 * shared movement port (lib/tf2-game/sim/movement.ts) with `MoveParams`.
 */

import type { MoveParams } from '../tf2-game/sim/movement-types';

export type SpGame = 'hl2' | 'portal';

/** sv_gravity in Half-Life 2 and Portal. */
export const SP_GRAVITY = 600;

/**
 * CGameMovement::CheckJumpButton: with g_bMovementOptimizations (on in every
 * shipped build) HL2 uses 160 ("approx. 21 units"); the exact formula would be
 * sqrt(2 × 600 × 21) ≈ 158.75.
 */
export const HL2_JUMP_IMPULSE = 160;
/** GAMEMOVEMENT_JUMP_HEIGHT (gamemovement.h). */
export const GAMEMOVEMENT_JUMP_HEIGHT = 21;

/** hl2_walkspeed / hl2_normspeed / hl2_sprintspeed (hl2_player.cpp). */
export const HL2_WALK_SPEED = 150;
export const HL2_NORM_SPEED = 190;
export const HL2_SPRINT_SPEED = 320;

/**
 * Portal's player speeds. Portal ships no sprint (+speed does nothing without
 * the HEV suit); the normal speed of 175 and the +walk speed of 150 are from
 * public documentation of the game's defaults, not from its code.
 */
export const PORTAL_NORM_SPEED = 175;
export const PORTAL_WALK_SPEED = 150;

/** shareddefs.h (HL2 block). */
export const PLAYER_FATAL_FALL_SPEED = 922.5;
export const PLAYER_MAX_SAFE_FALL_SPEED = 526.5;
export const PLAYER_MIN_BOUNCE_SPEED = 173;
export const PLAYER_FALL_PUNCH_THRESHOLD = 303;
/** DAMAGE_FOR_FALL_SPEED: damage per unit/s past the safe speed (CSingleplayRules::FlPlayerFallDamage). */
export const DAMAGE_FOR_FALL_SPEED = 100 / (PLAYER_FATAL_FALL_SPEED - PLAYER_MAX_SAFE_FALL_SPEED);

/** g_DefaultViewVectors (gamerules.cpp). */
export const HL2_VIEW_Z = 64;
export const HL2_HULL_MIN = Object.freeze({ x: -16, y: -16, z: 0 });
export const HL2_HULL_MAX = Object.freeze({ x: 16, y: 16, z: 72 });
export const HL2_DUCK_HULL_MIN = Object.freeze({ x: -16, y: -16, z: 0 });
export const HL2_DUCK_HULL_MAX = Object.freeze({ x: 16, y: 16, z: 36 });
export const HL2_DUCK_VIEW_Z = 28;
export const HL2_DEAD_VIEW_Z = 14;

/** Movement for Half-Life 2 single player. */
export const HL2_MOVE_PARAMS: Readonly<MoveParams> = Object.freeze({
  gravity: SP_GRAVITY,
  sv_friction: 4,
  sv_stopspeed: 100,
  sv_accelerate: 10,
  sv_airaccelerate: 10,
  sv_maxvelocity: 3500,
  sv_stepsize: 18,
  /** sv_maxspeed. */
  maxSpeedCap: 320,
  jumpImpulse: HL2_JUMP_IMPULSE,
  hullMin: HL2_HULL_MIN,
  hullMax: HL2_HULL_MAX,
  duckHullMin: HL2_DUCK_HULL_MIN,
  duckHullMax: HL2_DUCK_HULL_MAX,
  duckViewZ: HL2_DUCK_VIEW_Z,
  viewZ: HL2_VIEW_Z,
  /** shareddefs.h, non-TF build. */
  timeToDuck: 0.4,
  timeToUnduck: 0.2,
  maxSafeFallSpeed: PLAYER_MAX_SAFE_FALL_SPEED,
  minBounceSpeed: PLAYER_MIN_BOUNCE_SPEED,
  fallPunchThreshold: PLAYER_FALL_PUNCH_THRESHOLD,
  /** CGameMovement::CheckWaterJump. */
  waterJumpForward: 24,
  waterJumpUp: 256,
  tfRules: false,
  hl2JumpBoost: true,
});

/**
 * Portal moves like Half-Life 2 (same engine branch, same convars) without the
 * single-player jump boost — documented community behaviour is that Portal
 * removed the accelerated back-hop.
 */
export const PORTAL_MOVE_PARAMS: Readonly<MoveParams> = Object.freeze({
  ...HL2_MOVE_PARAMS,
  hl2JumpBoost: false,
});

/** Suit power (hl2_player.cpp): drains per second and the recharge rate. */
export const SUITPOWER_CHARGE_RATE = 12.5;
export const SUIT_SPRINT_DRAIN = 12.5;
export const SUIT_FLASHLIGHT_DRAIN = 2.222;
export const SUITPOWER_BEGIN_RECHARGE_DELAY = 0.5;
/** Can't start a sprint below this much power (CHL2_Player::StartSprinting: 10). */
export const SUIT_SPRINT_MIN_POWER = 10;

/** CPlayerPickupController / PlayerPickupObject: the heaviest object a hand can lift. */
export const PLAYER_MAX_LIFT_MASS = 35;
/**
 * Portal: the player carries the 40 kg weighted storage cube by hand from the
 * first chamber (observable behaviour), so the limit is above it.
 */
export const PORTAL_MAX_LIFT_MASS = 85;
/** player_throwforce. */
export const PLAYER_THROW_FORCE = 1000;
/** PLAYER_USE_RADIUS-ish reach of +use (CBasePlayer::FindUseEntity traces 1024 but accepts within this). */
export const PLAYER_USE_RANGE = 80;

/** Damage types (shareddefs.h DMG_*), the subset these maps use. */
export const DMG_GENERIC = 0;
export const DMG_CRUSH = 1 << 0;
export const DMG_BULLET = 1 << 1;
export const DMG_SLASH = 1 << 2;
export const DMG_BURN = 1 << 3;
export const DMG_FALL = 1 << 5;
export const DMG_BLAST = 1 << 6;
export const DMG_CLUB = 1 << 7;
export const DMG_SHOCK = 1 << 8;
export const DMG_DROWN = 1 << 14;
export const DMG_RADIATION = 1 << 18;
export const DMG_DISSOLVE = 1 << 20;

/** The player's entity id (slot 1, like a listen server's first client). */
export const PLAYER_ENTITY_ID = 1;
