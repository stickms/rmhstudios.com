/**
 * Per-class movement numbers and the stock TF2 max-speed rules.
 *
 * Base speeds and health come from the shipped class scripts
 * (tf/tf2_misc_dir.vpk → scripts/playerclasses/<class>.ctx, ICE-decoded with the
 * TF key: "speed_max", "health_max"). Eye heights are g_TFClassViewVectors in
 * tf_gamerules.cpp, read by CTFPlayer::GetClassEyeHeight. The crouched eye
 * height is the same 45 units for every class (g_TFViewVectors VEC_DUCK_VIEW).
 */

import {
  TF_CLASS_COUNT,
  TF_CLASS_DEMOMAN,
  TF_CLASS_ENGINEER,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_CLASS_UNDEFINED,
} from '../core/constants';
import { remapClamped } from '../core/vec';

/** scripts/playerclasses/*.ctx "speed_max", indexed by ETFClass. */
export const CLASS_MAX_SPEED: readonly number[] = [
  0, // undefined
  400, // scout
  300, // sniper
  240, // soldier
  280, // demoman
  320, // medic
  230, // heavy
  300, // pyro
  320, // spy
  300, // engineer
];

/** scripts/playerclasses/*.ctx "health_max" (fall damage scales with it). */
export const CLASS_MAX_HEALTH: readonly number[] = [0, 125, 125, 200, 175, 150, 300, 175, 125, 125];

/** g_TFClassViewVectors[class].z — standing eye height above the feet. */
export const CLASS_EYE_HEIGHT: readonly number[] = [72, 65, 75, 68, 68, 75, 75, 68, 75, 68];

/** VEC_VIEW (g_TFViewVectors), used for an undefined class. */
export const VEC_VIEW_Z = 72;
/** VEC_DEAD_VIEWHEIGHT. */
export const VEC_DEAD_VIEW_Z = 14;
/**
 * TF_MAX_SPEED in tf_gamemovement.cpp: 400 × 1.3. CTFGameMovement::ProcessMovement
 * caps every player's movement speed here (a shield charge raises it to 750).
 */
export const TF_MAX_SPEED = 400 * 1.3;
/** tf_max_charge_speed. */
export const TF_MAX_CHARGE_SPEED = 750;
/** tf_whip_speed_increase (Disciplinary Action, TF_COND_SPEED_BOOST). */
export const TF_WHIP_SPEED_INCREASE = 105;
/** tf_spy_max_cloaked_speed — 999, i.e. no cap. */
export const TF_SPY_MAX_CLOAKED_SPEED = 999;

const validClass = (c: number): boolean => c > TF_CLASS_UNDEFINED && c < TF_CLASS_COUNT;

export const classMaxSpeed = (classIndex: number): number =>
  validClass(classIndex) ? (CLASS_MAX_SPEED[classIndex] ?? 0) : 0;

export const classMaxHealth = (classIndex: number): number =>
  validClass(classIndex) ? (CLASS_MAX_HEALTH[classIndex] ?? 0) : 0;

/** CTFPlayer::GetClassEyeHeight (model scale 1). */
export const classEyeHeight = (classIndex: number): number =>
  validClass(classIndex) ? (CLASS_EYE_HEIGHT[classIndex] ?? VEC_VIEW_Z) : VEC_VIEW_Z;

/** What TeamFortress_CalculateMaxSpeed reads, reduced to stock (non-MvM, non-Mannpower) play. */
export interface MaxSpeedInput {
  classIndex: number;
  /** IsObserver(); `observerRoaming` when in OBS_MODE_ROAMING. */
  isObserver?: boolean;
  observerRoaming?: boolean;
  /** CanPlayerMove() — false during a frozen round restart / match countdown. */
  canMove?: boolean;
  /** TF_COND_DISGUISED: the class disguised as (0 = not disguised). */
  disguiseClass?: number;
  /** Spy cloaked (IsStealthed): disguise speed limits do not apply. */
  stealthed?: boolean;
  /** TF_COND_AIMING: sniper scoped / bow drawn / minigun spun up. */
  aiming?: boolean;
  /** The aiming weapon is the Huntsman (160 instead of 80). */
  aimingWithBow?: boolean;
  /** mult_player_aiming_movespeed. */
  aimingSpeedMult?: number;
  /** TF_COND_SPEED_BOOST (server only in the SDK). */
  speedBoost?: boolean;
  /** Bonus time after a round: the winners run 110 %, the losers 90 %. */
  teamWin?: 'none' | 'winner' | 'loser';
  /** Active weapon's GetSpeedMod() (e.g. 1 for stock). */
  weaponSpeedMod?: number;
  /** Demoman: GetSwordSpeedMod() of an owned sword (Eyelander heads). */
  swordSpeedMod?: number;
  /** TF_COND_SHIELD_CHARGE (Demoman). */
  shieldCharging?: boolean;
  /** Engineer carrying a building: 90 %. */
  carryingObject?: boolean;
  /** IsLoserStateStunned; `stunByTrigger` softens it to 75 %. */
  loserStunned?: boolean;
  stunByTrigger?: boolean;
  /** mult_player_movespeed (× shield-required variant when a shield is equipped). */
  moveSpeedMult?: number;
  /** Medic healing someone: their max speed (or 750 when a Quick-Fix follows a charge). */
  healTargetMaxSpeed?: number;
  /** mult_player_movespeed_active. */
  activeWeaponSpeedMult?: number;
  /** Heavy TF_COND_ENERGY_BUFF (Buffalo Steak): ×1.3 capped at 135 % base. */
  heavyEnergyBuff?: boolean;
  /** Scout with the Baby Face's Blaster: hype 0…100 → ×1…1.45. */
  babyFaceHype?: number;
}

/**
 * SDK: CTFPlayer::TeamFortress_CalculateMaxSpeed — the value the game stores in
 * `MoveState.maxSpeed` whenever a speed-affecting condition or weapon changes.
 */
export function calculateMaxSpeed(input: MaxSpeedInput): number {
  const cls = input.classIndex;
  if (input.isObserver) return input.observerRoaming ? CLASS_MAX_SPEED[TF_CLASS_SCOUT]! : 0;
  // Can't return 0: other code reads 0 as "use the default speed".
  if (!validClass(cls) || input.canMove === false) return 1;

  const defaultSpeed = classMaxSpeed(cls);
  let speed = defaultSpeed;

  const disguise = input.disguiseClass ?? 0;
  if (disguise && !input.stealthed) speed = Math.min(classMaxSpeed(disguise), speed);

  if (input.aiming) {
    let aimMax = cls === TF_CLASS_HEAVYWEAPONS ? 110 : input.aimingWithBow ? 160 : 80;
    aimMax *= input.aimingSpeedMult ?? 1;
    speed = Math.min(speed, aimMax);
  }

  if (input.speedBoost && speed > 0) speed += Math.min(speed * 0.4, TF_WHIP_SPEED_INCREASE);
  if (input.stealthed && speed > TF_SPY_MAX_CLOAKED_SPEED) speed = TF_SPY_MAX_CLOAKED_SPEED;

  if (input.teamWin === 'winner') speed *= 1.1;
  else if (input.teamWin === 'loser') speed *= 0.9;

  speed *= input.weaponSpeedMod ?? 1;

  if (cls === TF_CLASS_DEMOMAN) {
    speed *= input.swordSpeedMod ?? 1;
    if (input.shieldCharging) speed = TF_MAX_CHARGE_SPEED;
  }

  if (input.carryingObject) speed *= 0.9;
  if (input.loserStunned) speed *= input.stunByTrigger ? 0.75 : 0.5;

  speed *= input.moveSpeedMult ?? 1;

  if (cls === TF_CLASS_MEDIC && input.healTargetMaxSpeed !== undefined) {
    speed = Math.max(speed, input.healTargetMaxSpeed);
  }

  speed *= input.activeWeaponSpeedMult ?? 1;

  if (cls === TF_CLASS_HEAVYWEAPONS && input.heavyEnergyBuff) {
    speed = Math.min(speed * 1.3, defaultSpeed * 1.35);
  }

  if (cls === TF_CLASS_SCOUT && input.babyFaceHype !== undefined) {
    speed *= remapClamped(input.babyFaceHype, 0, 100, 1, 1.45);
  }

  return speed;
}

/** TF_PLAYER_MAX_SAFE_FALL_SPEED (tf_gamerules.cpp): no fall damage at or below it. */
export const TF_FALL_DAMAGE_SAFE_SPEED = 650;

/**
 * SDK: CTFGameRules::FlPlayerFallDamage — the "old TFC formula", 5 per 300 u/s,
 * scaled by max health / 100 and a 0.8–1.2 spread (pass 1 for none). Called
 * from `MoveContext.onFallDamage`; Mantreads stomps and attributes are the
 * caller's business.
 */
export function tfFallDamage(fallSpeed: number, maxHealth: number, spread = 1): number {
  if (fallSpeed <= TF_FALL_DAMAGE_SAFE_SPEED) return 0;
  return 5 * (fallSpeed / 300) * (maxHealth / 100) * spread;
}

/** Classes in menu order, re-exported for convenience in tests and UI. */
export const ALL_CLASSES = [
  TF_CLASS_SCOUT,
  TF_CLASS_SOLDIER,
  TF_CLASS_PYRO,
  TF_CLASS_DEMOMAN,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_ENGINEER,
  TF_CLASS_MEDIC,
  TF_CLASS_SNIPER,
  TF_CLASS_SPY,
] as const;
