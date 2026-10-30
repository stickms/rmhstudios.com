/**
 * The per-player movement state that `playerMove` (movement.ts) advances one
 * tick at a time, and the context it runs in.
 *
 * `MoveState` is the union of what the SDK spreads across CMoveData, the
 * player's CPlayerLocalData (m_Local), CBasePlayer and CTFPlayerShared for
 * movement purposes. Everything in it is a plain number, boolean, string or
 * `Vec3`, so the server can snapshot it and a predicting client can restore it
 * and re-run commands bit-for-bit.
 */

import type { Vec3 } from '../core/vec';
import type { CollisionWorld, TraceFilter } from '../core/types';
import {
  FL_ONGROUND,
  MOVETYPE_WALK,
  TF_CLASS_UNDEFINED,
  TEAM_UNASSIGNED,
  WL_NOTINWATER,
} from '../core/constants';
import { NO_ENTITY } from '../core/types';
import { classEyeHeight, classMaxSpeed } from './class-speeds';

// --- Movement-relevant conditions (TF_COND_* subset) as a bitmask -----------
/** TF_COND_SHIELD_CHARGE — Demoman shield charge (ChargeMove). */
export const MOVE_COND_SHIELD_CHARGE = 1 << 0;
/** IsControlStunned — no movement input at all (StunMove). */
export const MOVE_COND_CONTROL_STUNNED = 1 << 1;
/** IsLoserStateStunned — humiliation stun: buttons cleared, movement kept. */
export const MOVE_COND_LOSER_STUNNED = 1 << 2;
/** IsLoser — losing team in bonus time: no crouch-walking, silent ducked steps. */
export const MOVE_COND_LOSER = 1 << 3;
/** TF_COND_TAUNTING — cannot jump (CTFPlayer::CanJump). Taunt movement itself is not ported. */
export const MOVE_COND_TAUNTING = 1 << 4;
/** TF_COND_LOST_FOOTING — sliding with reduced ground friction. */
export const MOVE_COND_LOST_FOOTING = 1 << 5;
/** TF_COND_AIR_CURRENT — caught in an airblast: less air control, wall slide. */
export const MOVE_COND_AIR_CURRENT = 1 << 6;
/** TF_COND_PARACHUTE_ACTIVE — B.A.S.E. Jumper open. */
export const MOVE_COND_PARACHUTE_ACTIVE = 1 << 7;
/** TF_COND_PARACHUTE_DEPLOYED — opened once this jump (the game clears it on landing). */
export const MOVE_COND_PARACHUTE_DEPLOYED = 1 << 8;
/** TF_COND_BURNING — only matters for the parachute's fall-speed cap. */
export const MOVE_COND_BURNING = 1 << 9;
/** TF_COND_BLASTJUMPING — enables mod_air_control_blast_jump. */
export const MOVE_COND_BLAST_JUMPING = 1 << 10;
/** TF_COND_SODAPOPPER_HYPE — up to five air jumps. */
export const MOVE_COND_SODAPOPPER_HYPE = 1 << 11;
/** TF_COND_HALLOWEEN_SPEED_BOOST — any class may air-dash. */
export const MOVE_COND_HALLOWEEN_SPEED_BOOST = 1 << 12;
/** TF_COND_ROCKETPACK — halves the air speed cap. */
export const MOVE_COND_ROCKETPACK = 1 << 13;

/** Observer modes (shareddefs.h ObserverMode_t). Only ROAMING moves the player. */
export const OBS_MODE_NONE = 0;
export const OBS_MODE_DEATHCAM = 1;
export const OBS_MODE_FREEZECAM = 2;
export const OBS_MODE_FIXED = 3;
export const OBS_MODE_IN_EYE = 4;
export const OBS_MODE_CHASE = 5;
export const OBS_MODE_POI = 6;
export const OBS_MODE_ROAMING = 7;

/**
 * Item attributes that change movement (CALL_ATTRIB_HOOK_* in the SDK). The
 * loadout code resolves them; movement only reads them. Stock values are the
 * defaults from `defaultMoveAttributes()`.
 */
export interface MoveAttributes {
  /** mod_jump_height × mod_jump_height_from_weapon. */
  jumpHeightMod: number;
  /** mod_air_control. */
  airControlMod: number;
  /** mod_air_control_blast_jump (applied while blast jumping). */
  blastJumpAirControlMod: number;
  /** tf_scout_air_dash_count (1) with air_dash_count applied. */
  airDashCount: number;
  /** set_scout_doublejump_disabled. */
  airDashDisabled: boolean;
  /** no_jump, or the active weapon's OwnerCanJump() returning false. */
  noJump: boolean;
  /** no_duck. */
  noDuck: boolean;
  /** cannot_swim. */
  cannotSwim: boolean;
  /** swimming_mastery (no 0.8 swim-speed penalty). */
  swimmingMastery: boolean;
  /** firing_forward_pull while the active weapon fires (GetMovementForwardPull). */
  forwardPull: number;
  /** hype_resets_on_jump: hype lost per air jump. */
  hypeResetsOnJump: number;
  /** parachute_attribute. */
  parachute: boolean;
  /** parachute_disabled. */
  parachuteDisabled: boolean;
  /** RUNE_AGILITY (Mannpower): ×1.8 jump. */
  agilityRune: boolean;
  /** Heavy holding a minigun keeps spinning while control-stunned. */
  spinWhileStunned: boolean;
}

export const defaultMoveAttributes = (): MoveAttributes => ({
  jumpHeightMod: 1,
  airControlMod: 1,
  blastJumpAirControlMod: 1,
  airDashCount: 1,
  airDashDisabled: false,
  noJump: false,
  noDuck: false,
  cannotSwim: false,
  swimmingMastery: false,
  forwardPull: 0,
  hypeResetsOnJump: 0,
  parachute: false,
  parachuteDisabled: false,
  agilityRune: false,
  spinWhileStunned: false,
});

/** One player's movement state. Serialisable: numbers, booleans, strings, Vec3s. */
export interface MoveState {
  // --- Who is moving ---------------------------------------------------------
  /** ETFClass (TF_CLASS_*): eye height, Scout air dash, rough-landing rumble. */
  classIndex: number;
  /** TF_TEAM_*: enemy respawn-room visualizers, enemy players and buildings block us. */
  team: number;
  /** MOVETYPE_WALK, MOVETYPE_NOCLIP, MOVETYPE_OBSERVER or MOVETYPE_NONE. */
  moveType: number;
  /** OBS_MODE_* when moveType is MOVETYPE_OBSERVER. */
  observerMode: number;
  /** pl.deadflag / IsDead(): no input, no jumping, dead view height. */
  dead: boolean;

  // --- Kinematics --------------------------------------------------------------
  /** Feet (bottom-centre of the hull), world units. */
  origin: Vec3;
  /** Units/second. Knockback writes here directly (ApplyAbsVelocityImpulse). */
  velocity: Vec3;
  /** Conveyor / ground-entity velocity added during the move (GetBaseVelocity). */
  baseVelocity: Vec3;
  /** Eye height above the origin (GetViewOffset().z). */
  viewOffsetZ: number;
  /** View punch (m_vecPunchAngle) and its spring velocity — landing shake. */
  punchAngle: Vec3;
  punchAngleVel: Vec3;
  /** FL_* bits: FL_ONGROUND, FL_DUCKING, FL_WATERJUMP, FL_FROZEN. */
  flags: number;
  /** Entity standing on: WORLD_ENTITY, an entity id, or NO_ENTITY in the air. */
  groundEntity: number;
  /** Speed into the ground at landing time (m_flFallVelocity). */
  fallVelocity: number;
  /** Entity gravity multiplier; 0 means 1 (GetGravity). */
  gravity: number;
  /** Ground friction multiplier (m_surfaceFriction): 1 on normal ground, 0.25 sliding up a ramp. */
  surfaceFriction: number;
  /** Material of the last ground stood on ('' until first landing); footsteps, jump factor. */
  surfaceName: string;

  // --- Speed -------------------------------------------------------------------
  /** m_flMaxspeed — TeamFortress_CalculateMaxSpeed(), kept current by the game. */
  maxSpeed: number;

  // --- Buttons -----------------------------------------------------------------
  /** Buttons as seen at the end of the previous tick (m_nOldButtons). */
  oldButtons: number;
  oldForwardMove: number;

  // --- Ducking (m_Local) ---------------------------------------------------------
  /** m_bDucked: the hull is the duck hull. */
  ducked: boolean;
  /** m_bDucking: in a duck or unduck transition. */
  ducking: boolean;
  /** m_flDucktime, ms, counts down from 1000. */
  duckTime: number;
  /** CTFPlayerShared duck timer: curtime before which a grounded re-duck is refused. */
  duckTimer: number;
  /** Ducks released in the air this jump (TF allows two). */
  airDucked: number;

  // --- Jumping -----------------------------------------------------------------
  /** Air jumps used (Scout double jump). */
  airDash: number;
  /** CTFPlayerShared::IsJumping — set by a ground jump, cleared on landing/water. */
  jumping: boolean;
  /** Soda Popper / Baby Face's Blaster hype meter, 0…100 (the game reads it for speed). */
  scoutHype: number;

  // --- Water -------------------------------------------------------------------
  /** WL_NOTINWATER … WL_EYES. */
  waterLevel: number;
  /** CONTENTS_* at the feet when in water. */
  waterType: number;
  /** m_flWaterJumpTime, ms (2000 when hopping out of water). */
  waterJumpTime: number;
  waterJumpVel: Vec3;
  /** m_flSwimSoundTime, ms. */
  swimSoundTime: number;

  // --- Sounds --------------------------------------------------------------------
  /** m_flStepSoundTime, ms until the next footstep may play. */
  stepSoundTime: number;
  /** Wading step counter (the SDK's static iSkipStep, kept per player). */
  stepSkip: number;

  // --- Stuck resolution --------------------------------------------------------
  /** Next index into the stuck-offset table; non-zero while stuck (m_StuckLast). */
  stuckLast: number;
  /** Overlapping an enemy player: ignore enemy team contents until clear. */
  passingThroughEnemies: boolean;
  /** Set by game code that moved the player (teleport, push); forces a re-categorise. */
  gameMoved: boolean;

  // --- Conditions and stuns ------------------------------------------------------
  /** MOVE_COND_* bits. */
  conds: number;
  /** GetAmountStunned(TF_STUN_MOVEMENT): 0…1 movement slow. */
  stunAmount: number;
  /** TF_STUN_MOVEMENT_FORWARD_ONLY. */
  stunForwardOnly: boolean;
  stunLerpTarget: number;
  lastMovementStunChange: number;
  stunNeedsFadeOut: boolean;

  /** Movement attributes from items. */
  attrs: MoveAttributes;
}

/** Ground-surface physics (surfaceproperties.txt) the movement code reads. */
export interface SurfaceProps {
  /** Physics friction (default 0.8); movement uses min(1, friction × 1.25). */
  friction: number;
  /** game.jumpFactor (default 1). */
  jumpFactor: number;
  /** game.maxSpeedFactor (default 1). */
  maxSpeedFactor: number;
}

/**
 * The convars, hulls and rule switches movement reads, so another Source game
 * can reuse `playerMove` (lib/sp-game runs Half-Life 2 and Portal through it).
 * Omitted from the context, movement uses `TF_MOVE_PARAMS` — exactly TF2.
 */
export interface MoveParams {
  /** sv_gravity. */
  gravity: number;
  sv_friction: number;
  sv_stopspeed: number;
  sv_accelerate: number;
  sv_airaccelerate: number;
  sv_maxvelocity: number;
  sv_stepsize: number;
  /** The speed cap CheckParameters starts from before the player's own max speed (TF_MAX_SPEED in TF, sv_maxspeed in HL2). */
  maxSpeedCap: number;
  /** The ground jump impulse (TF 289; CGameMovement 160 at sv_gravity 600). */
  jumpImpulse: number;
  hullMin: Readonly<Vec3>;
  hullMax: Readonly<Vec3>;
  duckHullMin: Readonly<Vec3>;
  duckHullMax: Readonly<Vec3>;
  duckViewZ: number;
  /** Standing eye height; null = the TF class's (classEyeHeight). */
  viewZ: number | null;
  /** TIME_TO_DUCK / TIME_TO_UNDUCK, seconds. */
  timeToDuck: number;
  timeToUnduck: number;
  /** PLAYER_MAX_SAFE_FALL_SPEED, PLAYER_MIN_BOUNCE_SPEED, PLAYER_FALL_PUNCH_THRESHOLD. */
  maxSafeFallSpeed: number;
  minBounceSpeed: number;
  fallPunchThreshold: number;
  /** CheckWaterJump: forward probe distance and the upward velocity. */
  waterJumpForward: number;
  waterJumpUp: number;
  /**
   * TF2's CTFGameMovement rules: backpedal clamp, PreventBunnyJumping, the air
   * duck count and re-duck lockout, no ground jump while ducked. False runs the
   * base CGameMovement behaviour instead.
   */
  tfRules: boolean;
  /**
   * Half-Life 2 single player's jump boost (CGameMovement::CheckJumpButton under
   * HL2_DLL with one client): a share of the forward move added to the jump.
   */
  hl2JumpBoost: boolean;
  /**
   * The share of the input kept while crouched on the ground (HandleDuckingSpeedCrop). Omitted:
   * the base movement's one third. CS:GO walks crouched at 34 % (lib/csgo-game/movement.ts).
   */
  duckSpeedFraction?: number;
  /**
   * Caps the speed a ground jump leaves with at this × the player's max speed (PreventBunnyJumping).
   * Omitted: TF2's 1.2 under `tfRules`, no cap otherwise. CS:GO caps at 1.1 (sv_enablebunnyhopping 0).
   */
  bunnyJumpMaxSpeedFactor?: number;
}

/** Everything `playerMove` needs from the outside world for one tick. */
export interface MoveContext {
  /** Game convars and rules; TF2's when omitted (TF_MOVE_PARAMS in movement.ts). */
  params?: MoveParams;
  /** HL2 sprint state for the jump boost (CHLMoveData::m_bIsSprinting). */
  sprinting?: boolean;
  /**
   * Multiplies this tick's ground jump impulse (default 1). CS:GO's stamina lowers a jump made
   * soon after another (lib/csgo-game/movement.ts); the game keeps it current before each move.
   */
  jumpImpulseScale?: number;
  world: CollisionWorld;
  /** Simulation time at this tick (gpGlobals->curtime). */
  curtime: number;
  /** Ignores the moving player (and anything else the game wants to pass through). */
  filter: TraceFilter | null;
  /** Entity index of the mover; staggers the periodic stuck check like the SDK. */
  entityIndex?: number;
  /** True when an entity id is a player (stuck-in-enemy resolution, charge bump). */
  isPlayer?(entityId: number): boolean;
  /** Writes an entity's velocity (moving ground such as trains); zero when omitted. */
  getEntityVelocity?(entityId: number, out: Vec3): void;
  /** Surface properties by material name; should return a cached object (no allocation). */
  surfaceProps?(surfaceName: string): SurfaceProps;

  // --- Events ------------------------------------------------------------------
  /** Touched ground after being airborne (CGameMovement::OnLand), with the landing speed. */
  onLand?(fallSpeed: number): void;
  /** Landing hard enough for MoveHelper()->PlayerFallingDamage (> 580); see `tfFallDamage`. */
  onFallDamage?(fallSpeed: number): void;
  /** A ground jump (false) or an air dash (true). */
  onJump?(isAirDash: boolean): void;
  /** Footstep, jump step or rough landing on a surface ('water'/'wade' when in water). */
  onFootstep?(surfaceName: string, volume: number): void;
  /** Water level changed this tick; `splash` follows CTFGameMovement::PlayerMove. */
  onWaterLevelChange?(oldLevel: number, newLevel: number, splash: boolean): void;
  /** Swimming upward stroke sound (PlaySwimSound). */
  onSwimSound?(): void;
  /** The shield charge ended because the player slowed below 300 or bumped a player. */
  onChargeEnd?(): void;
}

/** A fresh, standing, airborne state for a class at the origin. */
export function createMoveState(
  classIndex: number = TF_CLASS_UNDEFINED,
  team: number = TEAM_UNASSIGNED,
): MoveState {
  return {
    classIndex,
    team,
    moveType: MOVETYPE_WALK,
    observerMode: OBS_MODE_NONE,
    dead: false,
    origin: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    baseVelocity: { x: 0, y: 0, z: 0 },
    viewOffsetZ: classEyeHeight(classIndex),
    punchAngle: { x: 0, y: 0, z: 0 },
    punchAngleVel: { x: 0, y: 0, z: 0 },
    flags: 0,
    groundEntity: NO_ENTITY,
    fallVelocity: 0,
    gravity: 0,
    surfaceFriction: 1,
    surfaceName: '',
    maxSpeed: classMaxSpeed(classIndex),
    oldButtons: 0,
    oldForwardMove: 0,
    ducked: false,
    ducking: false,
    duckTime: 0,
    duckTimer: 0,
    airDucked: 0,
    airDash: 0,
    jumping: false,
    scoutHype: 0,
    waterLevel: WL_NOTINWATER,
    waterType: 0,
    waterJumpTime: 0,
    waterJumpVel: { x: 0, y: 0, z: 0 },
    swimSoundTime: 0,
    stepSoundTime: 0,
    stepSkip: 0,
    stuckLast: 0,
    passingThroughEnemies: false,
    gameMoved: true,
    conds: 0,
    stunAmount: 0,
    stunForwardOnly: false,
    stunLerpTarget: 0,
    lastMovementStunChange: 0,
    stunNeedsFadeOut: false,
    attrs: defaultMoveAttributes(),
  };
}

/** True when the player is standing on something. */
export const isOnGround = (s: MoveState): boolean => (s.flags & FL_ONGROUND) !== 0;
