/**
 * TF2 player movement: a TypeScript port of CGameMovement
 * (game/shared/gamemovement.cpp) with the CTFGameMovement overrides
 * (game/shared/tf/tf_gamemovement.cpp) from the Source SDK 2013, so walking,
 * strafing, jumping, crouching, swimming and stepping behave like TF2.
 *
 * One entry point, `playerMove(state, cmd, ctx)`, advances one player by one
 * tick (TICK_INTERVAL). It is deterministic, reads time only from
 * `ctx.curtime`, and allocates nothing: every vector and trace below is a
 * module-level scratch object, which is safe because movement never re-enters
 * itself and JavaScript runs one `playerMove` at a time per thread.
 *
 * The SDK splits one tick across a "move data" object (mv), the player and the
 * movement singleton. Here the per-tick move data lives in module variables
 * (`fmove`, `buttons`, `maxSpeed`, …) and everything that persists between
 * ticks lives in `MoveState`.
 *
 * Intentional differences from the SDK are listed at the bottom of the file.
 */

import {
  CONTENTS_REDTEAM,
  CONTENTS_BLUETEAM,
  CONTENTS_SLIME,
  CONTENTS_WATER,
  FL_DUCKING,
  FL_FROZEN,
  FL_ONGROUND,
  FL_WATERJUMP,
  IN_ATTACK,
  IN_ATTACK2,
  IN_DUCK,
  IN_JUMP,
  IN_SPEED,
  MASK_PLAYERSOLID,
  MASK_SOLID,
  MASK_WATER,
  MOVETYPE_NOCLIP,
  MOVETYPE_NONE,
  MOVETYPE_OBSERVER,
  MOVETYPE_WALK,
  SV_ACCELERATE,
  SV_AIRACCELERATE,
  SV_BOUNCE,
  SV_FRICTION,
  SV_GRAVITY,
  SV_MAXVELOCITY,
  SV_STEPSIZE,
  SV_STOPSPEED,
  TF_CLASS_SCOUT,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  TICK_INTERVAL,
  VEC_DUCK_HULL_MAX,
  VEC_DUCK_HULL_MIN,
  VEC_DUCK_VIEW_Z,
  VEC_HULL_MAX,
  VEC_HULL_MIN,
  VEC_OBS_HULL_MAX,
  VEC_OBS_HULL_MIN,
  WL_EYES,
  WL_FEET,
  WL_NOTINWATER,
  WL_WAIST,
} from '../core/constants';
import type { TraceResult, UserCmd } from '../core/types';
import { NO_ENTITY, WORLD_ENTITY, emptyTrace } from '../core/types';
import type { Vec3 } from '../core/vec';
import {
  angleVectors,
  copy,
  dot,
  length,
  length2D,
  normalize,
  remapClamped,
  simpleSpline,
} from '../core/vec';
import { TF_MAX_CHARGE_SPEED, TF_MAX_SPEED, VEC_DEAD_VIEW_Z, classEyeHeight } from './class-speeds';
import type { MoveContext, MoveParams, MoveState, SurfaceProps } from './movement-types';
import {
  MOVE_COND_AIR_CURRENT,
  MOVE_COND_BLAST_JUMPING,
  MOVE_COND_BURNING,
  MOVE_COND_CONTROL_STUNNED,
  MOVE_COND_HALLOWEEN_SPEED_BOOST,
  MOVE_COND_LOSER,
  MOVE_COND_LOSER_STUNNED,
  MOVE_COND_LOST_FOOTING,
  MOVE_COND_PARACHUTE_ACTIVE,
  MOVE_COND_PARACHUTE_DEPLOYED,
  MOVE_COND_ROCKETPACK,
  MOVE_COND_SHIELD_CHARGE,
  MOVE_COND_SODAPOPPER_HYPE,
  MOVE_COND_TAUNTING,
  OBS_MODE_ROAMING,
} from './movement-types';

// --- Constants (SDK names) ----------------------------------------------------

/** gamemovement.h */
export const GAMEMOVEMENT_DUCK_TIME = 1000; // ms
/** shareddefs.h, TF build. */
export const TIME_TO_DUCK = 0.2;
export const TIME_TO_UNDUCK = 0.2;
/** tf_gamemovement.cpp TF_TIME_TO_DUCK: re-duck lockout after a release. */
export const TF_TIME_TO_DUCK = 0.3;
/** tf_gamemovement.cpp TF_AIRDUCKED_COUNT. */
export const TF_AIRDUCKED_COUNT = 2;
/** CTFGameMovement::CheckJumpButton: the ground jump impulse. */
export const TF_JUMP_IMPULSE = 289;
/** CTFGameMovement::AirDash: sqrt(2 × 800 × 45). */
export const TF_AIRDASH_IMPULSE = 268.3281572999747;
/** BUNNYJUMP_MAX_SPEED_FACTOR. */
export const BUNNYJUMP_MAX_SPEED_FACTOR = 1.2;
/** tf_clamp_back_speed / tf_clamp_back_speed_min. */
export const TF_CLAMP_BACK_SPEED = 0.9;
export const TF_CLAMP_BACK_SPEED_MIN = 100;
/** TF_WATERJUMP_FORWARD / TF_WATERJUMP_UP; shareddefs.h WATERJUMP_HEIGHT. */
export const TF_WATERJUMP_FORWARD = 30;
export const TF_WATERJUMP_UP = 300;
const WATERJUMP_HEIGHT = 8;
/** CGameMovement::GetAirSpeedCap. */
export const AIR_SPEED_CAP = 30;
/** shareddefs.h, non-HL2 build. */
export const PLAYER_MAX_SAFE_FALL_SPEED = 580;
export const PLAYER_MIN_BOUNCE_SPEED = 200;
export const PLAYER_FALL_PUNCH_THRESHOLD = 350;
/** CategorizePosition: z speed above which the player cannot be on ground. */
const NON_GROUND_SPEED = 250;
/** Ground normal z below which a surface is too steep to stand on. */
export const MIN_STANDABLE_NORMAL_Z = 0.7;
/** cl_forwardspeed / cl_backspeed / cl_sidespeed. */
export const CL_FORWARDSPEED = 450;
export const CL_BACKSPEED = 450;
export const CL_SIDESPEED = 450;
/** sv_maxspeed, sv_noclipspeed, sv_noclipaccelerate, sv_specspeed, sv_specaccelerate. */
export const SV_MAXSPEED = 320;
export const SV_NOCLIPSPEED = 5;
export const SV_NOCLIPACCELERATE = 5;
export const SV_SPECSPEED = 3;
export const SV_SPECACCELERATE = 5;
/** tf_parachute_maxspeed_xy / _z / _onfire_z / tf_parachute_aircontrol. */
const TF_PARACHUTE_MAXSPEED_XY = 300;
const TF_PARACHUTE_MAXSPEED_Z = -100;
const TF_PARACHUTE_MAXSPEED_ONFIRE_Z = -100;
const TF_PARACHUTE_AIRCONTROL = 2.5;
/** tf_movement_aircurrent_*, tf_movement_lost_footing_*. */
const TF_AIRCURRENT_FRICTION_MULT = 0.75;
const TF_AIRCURRENT_AIRCONTROL_MULT = 0.25;
const TF_LOST_FOOTING_RESTICK = 50;
const TF_LOST_FOOTING_FRICTION = 0.1;
/** coordsize.h */
const DIST_EPSILON = 0.03125;
const COORD_RESOLUTION = 1 / 32;
/** gamemovement.cpp */
const MAX_CLIP_PLANES = 5;
const NUM_BUMPS = 4;
const CHECK_STUCK_TICK_INTERVAL = Math.trunc(1 / TICK_INTERVAL);
/** DecayPunchAngle spring. */
const PUNCH_DAMPING = 9;
const PUNCH_SPRING_CONSTANT = 65;

/** TF2's movement parameters — what `playerMove` uses when the context gives none. */
export const TF_MOVE_PARAMS: Readonly<MoveParams> = Object.freeze({
  gravity: SV_GRAVITY,
  sv_friction: SV_FRICTION,
  sv_stopspeed: SV_STOPSPEED,
  sv_accelerate: SV_ACCELERATE,
  sv_airaccelerate: SV_AIRACCELERATE,
  sv_maxvelocity: SV_MAXVELOCITY,
  sv_stepsize: SV_STEPSIZE,
  maxSpeedCap: TF_MAX_SPEED,
  jumpImpulse: TF_JUMP_IMPULSE,
  hullMin: VEC_HULL_MIN,
  hullMax: VEC_HULL_MAX,
  duckHullMin: VEC_DUCK_HULL_MIN,
  duckHullMax: VEC_DUCK_HULL_MAX,
  duckViewZ: VEC_DUCK_VIEW_Z,
  viewZ: null,
  timeToDuck: TIME_TO_DUCK,
  timeToUnduck: TIME_TO_UNDUCK,
  maxSafeFallSpeed: PLAYER_MAX_SAFE_FALL_SPEED,
  minBounceSpeed: PLAYER_MIN_BOUNCE_SPEED,
  fallPunchThreshold: PLAYER_FALL_PUNCH_THRESHOLD,
  waterJumpForward: TF_WATERJUMP_FORWARD,
  waterJumpUp: TF_WATERJUMP_UP,
  tfRules: true,
  hl2JumpBoost: false,
});

const DEFAULT_SURFACE: SurfaceProps = { friction: 0.8, jumpFactor: 1, maxSpeedFactor: 1 };
const DT = TICK_INTERVAL;
const FRAME_MSEC = 1000 * TICK_INTERVAL;

// --- Per-tick move data (CMoveData) and scratch -------------------------------

let st: MoveState;
let cx: MoveContext;
/** This tick's game parameters (ctx.params, else TF2's). */
let P: Readonly<MoveParams> = TF_MOVE_PARAMS;
let fmove = 0;
let smove = 0;
let umove = 0;
let buttons = 0;
let oldButtons = 0;
let maxSpeed = 0;
let clientMaxSpeed = 0;
let speedCropped = false;
let oldWaterLevel = 0;
let commandNumber = 0;
const viewAngles: Vec3 = { x: 0, y: 0, z: 0 };

const v3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });
// Hull of the current state (GetPlayerMins/Maxs) and alternates.
const hullMins = v3();
const hullMaxs = v3();
const altMins = v3();
const altMaxs = v3();
// Direction scratch.
const fwd = v3();
const right = v3();
const up = v3();
const wishdir = v3();
const wishvel = v3();
// Position scratch, one set per routine so nested calls never share.
const walkDest = v3();
const stepEnd = v3();
const stepPos = v3();
const stepVel = v3();
const stepUpPos = v3();
const stepUpVel = v3();
const stepDownPos = v3();
const stepDownVel = v3();
const tryEnd = v3();
const tryPrimal = v3();
const tryOriginal = v3();
const tryNew = v3();
const tryDir = v3();
const tryPlanes: Vec3[] = [v3(), v3(), v3(), v3(), v3()];
const catStart = v3();
const catEnd = v3();
const waterPoint = v3();
const waterDest = v3();
const waterStart = v3();
const wjStart = v3();
const wjEnd = v3();
const wjFlatVel = v3();
const wjFlatFwd = v3();
const duckOrigin = v3();
const stuckBase = v3();
const stuckTest = v3();
const miscA = v3();
const miscB = v3();
const groundVel = v3();
// Traces.
const trWalk = emptyTrace();
const trStepSave = emptyTrace();
const trStep = emptyTrace();
const trTry = emptyTrace();
const trTryStuck = emptyTrace();
const trCat = emptyTrace();
const trWater = emptyTrace();
const trWaterJump = emptyTrace();
const trDuck = emptyTrace();
const trTest = emptyTrace();
const trMisc = emptyTrace();

/** gamemovement.cpp CreateStuckTable: 54 nudges, small then large. */
const STUCK_TABLE: Vec3[] = buildStuckTable();

function buildStuckTable(): Vec3[] {
  const t: Vec3[] = [];
  for (let i = 0; i < 54; i++) t.push(v3());
  let idx = 0;
  const put = (x: number, y: number, z: number): void => {
    const e = t[idx++]!;
    e.x = x;
    e.y = y;
    e.z = z;
  };
  for (let z = -0.125; z <= 0.125; z += 0.125) put(0, 0, z);
  for (let y = -0.125; y <= 0.125; y += 0.125) put(0, y, 0);
  for (let x = -0.125; x <= 0.125; x += 0.125) put(x, 0, 0);
  for (let x = -0.125; x <= 0.125; x += 0.25)
    for (let y = -0.125; y <= 0.125; y += 0.25)
      for (let z = -0.125; z <= 0.125; z += 0.25) put(x, y, z);
  const zi = [0, 1, 6];
  for (const z of zi) put(0, 0, z);
  for (let y = -2; y <= 2; y += 2) put(0, y, 0);
  for (let x = -2; x <= 2; x += 2) put(x, 0, 0);
  for (const z of zi)
    for (let x = -2; x <= 2; x += 2) for (let y = -2; y <= 2; y += 2) put(x, y, z);
  return t;
}

// --- Small helpers ----------------------------------------------------------

const onGround = (): boolean => st.groundEntity !== NO_ENTITY;
const hasCond = (bit: number): boolean => (st.conds & bit) !== 0;
const isObserver = (): boolean => st.moveType === MOVETYPE_OBSERVER;
const inWater = (): boolean => st.waterLevel > WL_FEET;
const gravityScale = (): number => (st.gravity ? st.gravity : 1);
/** Standing eye height: the game's VEC_VIEW, or the TF class's. */
const standEyeHeight = (): number => (P.viewZ !== null ? P.viewZ : classEyeHeight(st.classIndex));
const surface = (name: string): SurfaceProps =>
  cx.surfaceProps ? cx.surfaceProps(name) : DEFAULT_SURFACE;

/** mathlib AlmostEqual at float precision (10 ULPs). */
const almostEqual = (a: number, b: number): boolean =>
  Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1.2e-6;

/** SDK: CGameMovement::GetPlayerMins/GetPlayerMaxs (observer hull, duck hull, standing hull). */
function updateHull(): void {
  if (isObserver()) {
    copy(hullMins, VEC_OBS_HULL_MIN);
    copy(hullMaxs, VEC_OBS_HULL_MAX);
  } else if (st.ducked) {
    copy(hullMins, P.duckHullMin);
    copy(hullMaxs, P.duckHullMax);
  } else {
    copy(hullMins, P.hullMin);
    copy(hullMaxs, P.hullMax);
  }
}

/** Standing-minus-crouched hull height: how far the feet move when ducking in the air (20). */
const duckHullDeltaZ = (): number =>
  P.hullMax.z - P.hullMin.z - (P.duckHullMax.z - P.duckHullMin.z);

/** SDK: CTFGameMovement::PlayerSolidMask — enemy team contents block us unless passing through. */
function playerSolidMask(): number {
  let mask = 0;
  if (!st.passingThroughEnemies) {
    if (st.team === TF_TEAM_RED) mask = CONTENTS_BLUETEAM;
    else if (st.team === TF_TEAM_BLUE) mask = CONTENTS_REDTEAM;
  }
  return mask | MASK_PLAYERSOLID;
}

/** SDK: CTFGameMovement::TracePlayerBBox. */
function tracePlayerBBox(start: Vec3, end: Vec3, mask: number, out: TraceResult): TraceResult {
  updateHull();
  return cx.world.traceHull(start, end, hullMins, hullMaxs, mask, cx.filter, out);
}

const didHit = (tr: TraceResult): boolean => tr.fraction < 1 || tr.allSolid || tr.startSolid;

/** SDK: CTFGameMovement::TestPlayerPosition — the entity we overlap at `pos`, or NO_ENTITY. */
function testPlayerPosition(pos: Vec3, out: TraceResult): number {
  tracePlayerBBox(pos, pos, playerSolidMask(), out);
  if (out.startSolid || out.allSolid) return out.entity === NO_ENTITY ? WORLD_ENTITY : out.entity;
  return NO_ENTITY;
}

function copyTrace(dst: TraceResult, src: TraceResult): void {
  dst.fraction = src.fraction;
  copy(dst.endPos, src.endPos);
  copy(dst.plane.normal, src.plane.normal);
  dst.plane.dist = src.plane.dist;
  dst.startSolid = src.startSolid;
  dst.allSolid = src.allSolid;
  dst.contents = src.contents;
  dst.surfaceFlags = src.surfaceFlags;
  dst.surfaceName = src.surfaceName;
  dst.entity = src.entity;
  dst.hitGroup = src.hitGroup;
}

function endCharge(): void {
  if (hasCond(MOVE_COND_SHIELD_CHARGE)) {
    st.conds &= ~MOVE_COND_SHIELD_CHARGE;
    cx.onChargeEnd?.();
  }
}

// --- Entry point ---------------------------------------------------------------

/**
 * Advances one player by one tick.
 * SDK: CTFGameMovement::ProcessMovement (+ CGameMovement::FinishMove).
 */
export function playerMove(state: MoveState, cmd: UserCmd, ctx: MoveContext): void {
  st = state;
  cx = ctx;
  P = ctx.params ?? TF_MOVE_PARAMS;
  fmove = cmd.forwardMove;
  smove = cmd.sideMove;
  umove = cmd.upMove;
  buttons = cmd.buttons;
  oldButtons = state.oldButtons;
  commandNumber = cmd.commandNumber;
  copy(viewAngles, cmd.viewAngles);
  speedCropped = false;
  oldWaterLevel = state.waterLevel;

  // The max speed is the Scout's with headroom; CheckParameters lowers it to the player's.
  maxSpeed = P.maxSpeedCap;
  clientMaxSpeed = state.maxSpeed;

  chargeMove();
  stunMove();
  highMaxSpeedMove();
  tfPlayerMove();

  // SDK: CGameMovement::FinishMove
  state.oldButtons = buttons;
  state.oldForwardMove = fmove;
  state.gameMoved = false;
}

/** SDK: CTFGameMovement::ChargeMove — a charging Demoman runs forward at 750, buttons locked. */
function chargeMove(): void {
  if (!hasCond(MOVE_COND_SHIELD_CHARGE)) return;
  maxSpeed = TF_MAX_CHARGE_SPEED;
  const old = buttons;
  fmove = TF_MAX_CHARGE_SPEED;
  smove = 0;
  umove = 0;
  buttons = old & IN_ATTACK2 ? IN_ATTACK2 : 0;
  if (old & IN_ATTACK) buttons |= IN_ATTACK;
}

/** SDK: CTFGameMovement::StunMove — control stuns and the lerped movement slow. */
function stunMove(): void {
  if (hasCond(MOVE_COND_CONTROL_STUNNED) || hasCond(MOVE_COND_LOSER_STUNNED)) {
    const attackDown = (buttons & (IN_ATTACK | IN_ATTACK2)) !== 0;
    buttons = 0;
    if (attackDown && st.attrs.spinWhileStunned) buttons = IN_ATTACK2;
    if (hasCond(MOVE_COND_CONTROL_STUNNED)) {
      fmove = 0;
      smove = 0;
      umove = 0;
    }
  }

  const amount = st.stunAmount;
  if (amount) {
    if (st.stunLerpTarget !== amount) {
      st.lastMovementStunChange = cx.curtime;
      st.stunLerpTarget = amount;
      st.stunNeedsFadeOut = true;
    }
    fmove *= 1 - amount;
    smove *= 1 - amount;
    if (st.stunForwardOnly) fmove = 0;
  } else if (st.lastMovementStunChange) {
    if (st.stunNeedsFadeOut) {
      st.lastMovementStunChange = cx.curtime;
      st.stunNeedsFadeOut = false;
    }
    const cur = remapClamped(cx.curtime - st.lastMovementStunChange, 0.2, 0, 0, 1);
    if (cur) {
      const r = st.stunLerpTarget * cur;
      fmove *= 1 - r;
      smove *= 1 - r;
      if (st.stunForwardOnly) fmove = 0;
    } else {
      st.stunLerpTarget = 0;
      st.lastMovementStunChange = 0;
    }
  }
}

/** SDK: CTFGameMovement::HighMaxSpeedMove — full-key input reaches speeds above 450. */
function highMaxSpeedMove(): void {
  const ms = st.maxSpeed;
  if (Math.abs(fmove) < ms) {
    if (almostEqual(fmove, CL_FORWARDSPEED)) fmove = ms;
    else if (almostEqual(fmove, -CL_BACKSPEED)) fmove = -ms;
  }
  if (Math.abs(smove) < ms) {
    if (almostEqual(smove, CL_SIDESPEED)) smove = ms;
    else if (almostEqual(smove, -CL_SIDESPEED)) smove = -ms;
  }
}

/** SDK: CTFGameMovement::PlayerMove — the base move, then splash and charge bookkeeping. */
function tfPlayerMove(): void {
  if (hasCond(MOVE_COND_LOST_FOOTING)) clientMaxSpeed = maxSpeed;

  basePlayerMove();

  const newLevel = st.waterLevel;
  if (oldWaterLevel !== newLevel) {
    let splash = false;
    if (oldWaterLevel === WL_NOTINWATER) {
      if (st.velocity.z <= -200) {
        splash = true;
      } else {
        copy(miscA, st.origin);
        copy(miscB, st.origin);
        miscB.z -= 20;
        cx.world.traceLine(miscA, miscB, MASK_SOLID, cx.filter, trMisc);
        if (trMisc.fraction >= 1) splash = true;
      }
    }
    cx.onWaterLevelChange?.(oldWaterLevel, newLevel, splash);
  }

  if (length(st.velocity) < 300) endCharge();
}

/** SDK: CGameMovement::PlayerMove. */
function basePlayerMove(): void {
  checkParameters();
  reduceTimers();

  const mt = st.moveType;
  if (mt !== MOVETYPE_NOCLIP && mt !== MOVETYPE_NONE && mt !== MOVETYPE_OBSERVER && !st.dead) {
    if (checkInterval() && checkStuck()) return; // Can't move, we're stuck.
  }

  if (mt !== MOVETYPE_WALK || st.gameMoved) categorizePosition();
  else if (st.velocity.z > NON_GROUND_SPEED) setGroundEntity(null);

  oldWaterLevel = st.waterLevel;

  if (!onGround()) st.fallVelocity = -st.velocity.z;

  updateStepSound();

  if (!isObserver()) duck();

  switch (mt) {
    case MOVETYPE_NOCLIP:
      fullNoClipMove(SV_NOCLIPSPEED, SV_NOCLIPACCELERATE);
      break;
    case MOVETYPE_WALK:
      fullWalkMove();
      break;
    case MOVETYPE_OBSERVER:
      fullObserverMove();
      break;
    default:
      break; // MOVETYPE_NONE
  }
}

/** SDK: CGameMovement::CheckParameters — clamp input to the max speed, freeze, punch decay. */
function checkParameters(): void {
  const mt = st.moveType;
  if (mt !== MOVETYPE_NOCLIP && mt !== MOVETYPE_OBSERVER) {
    const spd = fmove * fmove + smove * smove + umove * umove;
    if (clientMaxSpeed !== 0) maxSpeed = Math.min(clientMaxSpeed, maxSpeed);
    if (st.surfaceName) maxSpeed *= surface(st.surfaceName).maxSpeedFactor;
    if (spd !== 0 && spd > maxSpeed * maxSpeed) {
      const ratio = maxSpeed / Math.sqrt(spd);
      fmove *= ratio;
      smove *= ratio;
      umove *= ratio;
    }
  }

  if (st.flags & FL_FROZEN || st.dead) {
    fmove = 0;
    smove = 0;
    umove = 0;
  }

  decayPunchAngle();

  if (st.dead) st.viewOffsetZ = VEC_DEAD_VIEW_Z;
}

/** SDK: CGameMovement::DecayPunchAngle — a damped spring back to zero. */
function decayPunchAngle(): void {
  const p = st.punchAngle;
  const pv = st.punchAngleVel;
  if (
    p.x * p.x + p.y * p.y + p.z * p.z > 0.001 ||
    pv.x * pv.x + pv.y * pv.y + pv.z * pv.z > 0.001
  ) {
    p.x += pv.x * DT;
    p.y += pv.y * DT;
    p.z += pv.z * DT;
    const damping = Math.max(0, 1 - PUNCH_DAMPING * DT);
    pv.x *= damping;
    pv.y *= damping;
    pv.z *= damping;
    const spring = Math.min(Math.max(PUNCH_SPRING_CONSTANT * DT, 0), 2);
    pv.x -= p.x * spring;
    pv.y -= p.y * spring;
    pv.z -= p.z * spring;
    p.x = Math.min(Math.max(p.x, -89), 89);
    p.y = Math.min(Math.max(p.y, -179), 179);
    p.z = Math.min(Math.max(p.z, -89), 89);
  } else {
    p.x = p.y = p.z = 0;
    pv.x = pv.y = pv.z = 0;
  }
}

/** SDK: CGameMovement::ReduceTimers. */
function reduceTimers(): void {
  if (st.duckTime > 0) st.duckTime = Math.max(0, st.duckTime - FRAME_MSEC);
  if (st.swimSoundTime > 0) st.swimSoundTime = Math.max(0, st.swimSoundTime - FRAME_MSEC);
}

// --- Stuck resolution -------------------------------------------------------------

/** SDK: CGameMovement::CheckInterval(STUCK) — every second, or every tick while stuck. */
function checkInterval(): boolean {
  const interval = st.stuckLast !== 0 ? 1 : CHECK_STUCK_TICK_INTERVAL;
  const n = commandNumber + (cx.entityIndex ?? 0);
  return ((n % interval) + interval) % interval === 0;
}

/** SDK: CTFGameMovement::CheckStuck + CGameMovement::CheckStuck. Returns true when still stuck. */
function checkStuck(): boolean {
  st.passingThroughEnemies = false;
  tracePlayerBBox(st.origin, st.origin, playerSolidMask(), trTest);
  if (trTest.startSolid && trTest.entity !== WORLD_ENTITY && trTest.entity !== NO_ENTITY) {
    if (cx.isPlayer?.(trTest.entity)) {
      // Inside an enemy: stop colliding with enemies until clear of them.
      st.passingThroughEnemies = true;
      tracePlayerBBox(st.origin, st.origin, playerSolidMask(), trTest);
      if (!didHit(trTest)) return false;
    }
  }

  if (testPlayerPosition(st.origin, trTest) === NO_ENTITY) {
    st.stuckLast = 0;
    return false;
  }

  // Try every nudge in the table this tick (the SDK client's path; see notes).
  copy(stuckBase, st.origin);
  st.stuckLast = 0;
  for (let rep = 0; rep < STUCK_TABLE.length; rep++) {
    const off = STUCK_TABLE[st.stuckLast++ % STUCK_TABLE.length]!;
    stuckTest.x = stuckBase.x + off.x;
    stuckTest.y = stuckBase.y + off.y;
    stuckTest.z = stuckBase.z + off.z;
    if (testPlayerPosition(stuckTest, trTest) === NO_ENTITY) {
      st.stuckLast = 0;
      copy(st.origin, stuckTest);
      return false;
    }
  }
  return true;
}

// --- Ground ---------------------------------------------------------------------

/** SDK: CTFGameMovement::SetGroundEntity (+ CGameMovement::SetGroundEntity). */
function setGroundEntity(tr: TraceResult | null): void {
  const newGround = tr ? tr.entity : NO_ENTITY;
  const oldGround = st.groundEntity;
  const base = st.baseVelocity;

  if (oldGround === NO_ENTITY && newGround !== NO_ENTITY) {
    // Subtract ground velocity at the instant we land.
    entityVelocity(newGround, groundVel);
    base.x -= groundVel.x;
    base.y -= groundVel.y;
    base.z = groundVel.z;
  } else if (oldGround !== NO_ENTITY && newGround === NO_ENTITY) {
    // Carry the ground's velocity into the jump.
    entityVelocity(oldGround, groundVel);
    base.x += groundVel.x;
    base.y += groundVel.y;
    base.z = groundVel.z;
  }

  st.groundEntity = newGround;
  if (newGround !== NO_ENTITY && tr) {
    st.flags |= FL_ONGROUND;
    categorizeGroundSurface(tr);
    st.waterJumpTime = 0;
    st.velocity.z = 0;
    // TF: landing resets the air jumps and air ducks.
    st.airDash = 0;
    st.airDucked = 0;
  } else {
    st.flags &= ~FL_ONGROUND;
  }
}

function entityVelocity(entity: number, out: Vec3): void {
  out.x = out.y = out.z = 0;
  if (entity !== WORLD_ENTITY && entity !== NO_ENTITY) cx.getEntityVelocity?.(entity, out);
}

/** SDK: CGameMovement::CategorizeGroundSurface. */
function categorizeGroundSurface(tr: TraceResult): void {
  st.surfaceName = tr.surfaceName || 'default';
  // vphysics friction 0.8 is "normal"; players treat it as 1.
  st.surfaceFriction = Math.min(1, surface(st.surfaceName).friction * 1.25);
}

/**
 * SDK: CTFGameMovement::CategorizePosition — water level, then what we stand
 * on. Walking players trace a step further down so they stick to stairs and
 * slopes (TF folds StayOnGround in here).
 */
function categorizePosition(): void {
  if (isObserver()) return;

  st.surfaceFriction = 1;
  checkWater();

  if (st.velocity.z > NON_GROUND_SPEED) {
    setGroundEntity(null);
    return;
  }

  copy(catStart, st.origin);
  copy(catEnd, st.origin);
  catEnd.z -= 2;

  const underwater = st.waterLevel >= WL_EYES;
  let moveToEndPos = false;
  if (st.moveType === MOVETYPE_WALK && onGround() && !underwater) {
    catEnd.z -= P.sv_stepsize;
    moveToEndPos = true;
  }

  const tr = tracePlayerBBox(catStart, catEnd, playerSolidMask(), trCat);

  let inAir = false;
  let groundFrictionMult = 1;
  let airFrictionMult = 1;
  if (hasCond(MOVE_COND_AIR_CURRENT)) airFrictionMult *= TF_AIRCURRENT_FRICTION_MULT;

  if (hasCond(MOVE_COND_LOST_FOOTING)) {
    const n = tr.plane.normal;
    const v = st.velocity;
    const away = dot(v, n);
    if (away > 0) {
      inAir = true;
    } else {
      const sx = v.x - n.x * away;
      const sy = v.y - n.y * away;
      const sz = v.z - n.z * away;
      if (Math.sqrt(sx * sx + sy * sy + sz * sz) >= TF_LOST_FOOTING_RESTICK) {
        groundFrictionMult *= TF_LOST_FOOTING_FRICTION; // sliding
      } else {
        st.conds &= ~MOVE_COND_LOST_FOOTING; // regained footing
      }
    }
  }

  if (!inAir && tr.plane.normal.z < MIN_STANDABLE_NORMAL_Z) {
    // Steep: see if any quarter of the box finds a standable plane.
    tracePlayerBBoxForGround(catStart, catEnd, tr);
    if (tr.plane.normal.z < MIN_STANDABLE_NORMAL_Z) {
      inAir = true;
      if (st.velocity.z > 0 && st.moveType !== MOVETYPE_NOCLIP) st.surfaceFriction = 0.25;
    }
  } else if (!inAir) {
    if (moveToEndPos && !tr.startSolid && tr.fraction > 0 && tr.fraction < 1) {
      if (Math.abs(st.origin.z - tr.endPos.z) > 0.5 * COORD_RESOLUTION) st.origin.z = tr.endPos.z;
    }
  }

  setGroundEntity(inAir ? null : tr);
  st.surfaceFriction *= inAir ? airFrictionMult : groundFrictionMult;
}

/**
 * SDK: TracePlayerBBoxForGround — traces the four quarter-boxes looking for a
 * standable plane, keeping the original fraction and end position.
 */
function tracePlayerBBoxForGround(start: Vec3, end: Vec3, pm: TraceResult): void {
  const fraction = pm.fraction;
  copy(miscA, pm.endPos);
  const mask = playerSolidMask();
  updateHull();
  for (let q = 0; q < 4; q++) {
    copy(altMins, hullMins);
    copy(altMaxs, hullMaxs);
    if (q === 0) {
      altMaxs.x = Math.min(0, hullMaxs.x);
      altMaxs.y = Math.min(0, hullMaxs.y);
    } else if (q === 1) {
      altMins.x = Math.max(0, hullMins.x);
      altMins.y = Math.max(0, hullMins.y);
    } else if (q === 2) {
      altMins.y = Math.max(0, hullMins.y);
      altMaxs.x = Math.min(0, hullMaxs.x);
    } else {
      altMins.x = Math.max(0, hullMins.x);
      altMaxs.y = Math.min(0, hullMaxs.y);
    }
    cx.world.traceHull(start, end, altMins, altMaxs, mask, cx.filter, pm);
    if (pm.entity !== NO_ENTITY && pm.plane.normal.z >= MIN_STANDABLE_NORMAL_Z) break;
  }
  pm.fraction = fraction;
  copy(pm.endPos, miscA);
}

// --- Water ------------------------------------------------------------------------

/** SDK: CTFGameMovement::CheckWater — feet, eyes, then waist (+12). Returns waist-deep or more. */
function checkWater(): boolean {
  updateHull();
  waterPoint.x = st.origin.x + (hullMins.x + hullMaxs.x) * 0.5;
  waterPoint.y = st.origin.y + (hullMins.y + hullMaxs.y) * 0.5;
  waterPoint.z = st.origin.z + hullMins.z + 1;

  let wl = WL_NOTINWATER;
  let wt = 0;
  let contents = cx.world.pointContents(waterPoint);
  if (contents & MASK_WATER) {
    st.jumping = false;
    wt = contents;
    wl = WL_FEET;
    const waistZ = st.origin.z + (hullMins.z + hullMaxs.z) * 0.5 + 12;
    waterPoint.z = st.origin.z + st.viewOffsetZ;
    contents = cx.world.pointContents(waterPoint);
    if (contents & MASK_WATER) {
      wl = WL_EYES;
    } else {
      waterPoint.z = waistZ;
      if (cx.world.pointContents(waterPoint) & MASK_WATER) wl = WL_WAIST;
    }
  }

  st.waterLevel = wl;
  st.waterType = wt;
  return wl > WL_FEET;
}

/** SDK: CTFGameMovement::CheckWaterJump — hop out onto a ledge in front of us. */
function checkWaterJump(): void {
  const jumpDown = (buttons & IN_JUMP) !== 0;
  angleVectors(viewAngles, fwd, right);

  if (st.waterJumpTime) return; // already water jumping
  if (st.velocity.z < -180) return; // only hop out moving up

  wjFlatVel.x = st.velocity.x;
  wjFlatVel.y = st.velocity.y;
  wjFlatVel.z = 0;
  const curspeed = normalize(wjFlatVel);

  wjFlatFwd.x = fwd.x * fmove + right.x * smove;
  wjFlatFwd.y = fwd.y * fmove + right.y * smove;
  wjFlatFwd.z = 0;
  normalize(wjFlatFwd);

  // Backing into the water from steps: don't pop forward.
  if (curspeed !== 0 && dot(wjFlatVel, wjFlatFwd) < 0 && !jumpDown) return;

  updateHull();
  wjStart.x = st.origin.x + (hullMins.x + hullMaxs.x) * 0.5;
  wjStart.y = st.origin.y + (hullMins.y + hullMaxs.y) * 0.5;
  wjStart.z = st.origin.z + (hullMins.z + hullMaxs.z) * 0.5;
  wjEnd.x = wjStart.x + wjFlatFwd.x * P.waterJumpForward;
  wjEnd.y = wjStart.y + wjFlatFwd.y * P.waterJumpForward;
  wjEnd.z = wjStart.z;

  const mask = playerSolidMask();
  tracePlayerBBox(wjStart, wjEnd, mask, trWaterJump);
  if (trWaterJump.fraction < 1) {
    // Solid at the waist: is it open at eye level?
    wjStart.z = st.origin.z + st.viewOffsetZ + WATERJUMP_HEIGHT;
    wjEnd.x = wjStart.x + wjFlatFwd.x * P.waterJumpForward;
    wjEnd.y = wjStart.y + wjFlatFwd.y * P.waterJumpForward;
    wjEnd.z = wjStart.z;
    st.waterJumpVel.x = -50 * trWaterJump.plane.normal.x;
    st.waterJumpVel.y = -50 * trWaterJump.plane.normal.y;
    st.waterJumpVel.z = -50 * trWaterJump.plane.normal.z;

    tracePlayerBBox(wjStart, wjEnd, mask, trWaterJump);
    if (trWaterJump.fraction === 1) {
      // Would we land on something standable?
      copy(wjStart, wjEnd);
      wjEnd.z -= 1024;
      tracePlayerBBox(wjStart, wjEnd, mask, trWaterJump);
      if (trWaterJump.fraction < 1 && trWaterJump.plane.normal.z >= MIN_STANDABLE_NORMAL_Z) {
        st.velocity.z = P.waterJumpUp;
        oldButtons |= IN_JUMP;
        st.flags |= FL_WATERJUMP;
        st.waterJumpTime = 2000;
      }
    }
  }
}

/** SDK: CGameMovement::WaterJump — keep pushing forward while hopping out. */
function waterJump(): void {
  if (st.waterJumpTime > 10000) st.waterJumpTime = 10000;
  if (!st.waterJumpTime) return;
  st.waterJumpTime -= 1000 * DT;
  if (st.waterJumpTime <= 0 || !st.waterLevel) {
    st.waterJumpTime = 0;
    st.flags &= ~FL_WATERJUMP;
  }
  st.velocity.x = st.waterJumpVel.x;
  st.velocity.y = st.waterJumpVel.y;
}

/** SDK: CTFGameMovement::CheckWaterJumpButton — in water the jump key swims up. Returns "may jump". */
function checkWaterJumpButton(): boolean {
  if (st.waterJumpTime) {
    // The SDK subtracts seconds from a millisecond timer here; kept as is.
    st.waterJumpTime -= DT;
    if (st.waterJumpTime < 0) st.waterJumpTime = 0;
    return false;
  }

  if (st.waterLevel >= WL_WAIST) {
    setGroundEntity(null);
    if (st.attrs.cannotSwim) return false;
    if (st.waterType & CONTENTS_SLIME) st.velocity.z = 80;
    else if (st.waterType & CONTENTS_WATER) st.velocity.z = 100;
    if (st.swimSoundTime <= 0) {
      st.swimSoundTime = 1000;
      cx.onSwimSound?.();
    }
    return false;
  }
  return true;
}

/** SDK: CTFGameMovement::WaterMove — swimming: 3-D wish direction, 0.8 speed, water friction. */
function waterMove(): void {
  angleVectors(viewAngles, fwd, right, up);
  const v = st.velocity;

  wishvel.x = fwd.x * fmove + right.x * smove;
  wishvel.y = fwd.y * fmove + right.y * smove;
  wishvel.z = fwd.z * fmove + right.z * smove;

  if (st.attrs.cannotSwim) {
    wishvel.x *= 0.1;
    wishvel.y *= 0.1;
    wishvel.z = -60;
  } else if (buttons & IN_JUMP) {
    if (st.waterLevel === WL_EYES) wishvel.z += clientMaxSpeed;
  } else if (!fmove && !smove && !umove) {
    wishvel.z -= 60; // sink when idle
  } else {
    wishvel.z += umove;
  }

  copy(wishdir, wishvel);
  let wishspeed = normalize(wishdir);
  if (wishspeed > maxSpeed) {
    const s = maxSpeed / wishspeed;
    wishvel.x *= s;
    wishvel.y *= s;
    wishvel.z *= s;
    wishspeed = maxSpeed;
  }
  if (!st.attrs.swimmingMastery) wishspeed *= 0.8;

  // Water friction.
  const speed = length(v);
  let newspeed = 0;
  if (speed) {
    newspeed = speed - DT * speed * P.sv_friction * st.surfaceFriction;
    if (newspeed < 0.1) newspeed = 0;
    const s = newspeed / speed;
    v.x *= s;
    v.y *= s;
    v.z *= s;
  }

  // Water acceleration.
  if (wishspeed >= 0.1) {
    const addspeed = wishspeed - newspeed;
    if (addspeed > 0) {
      normalize(wishvel);
      let accelspeed = P.sv_accelerate * wishspeed * DT * st.surfaceFriction;
      if (accelspeed > addspeed) accelspeed = addspeed;
      v.x += accelspeed * wishvel.x;
      v.y += accelspeed * wishvel.y;
      v.z += accelspeed * wishvel.z;
    }
  }

  addBaseVelocity();

  // Assume a stair or slope: press down from a step above the destination.
  waterDest.x = st.origin.x + DT * v.x;
  waterDest.y = st.origin.y + DT * v.y;
  waterDest.z = st.origin.z + DT * v.z;
  const mask = playerSolidMask();
  tracePlayerBBox(st.origin, waterDest, mask, trWater);
  if (trWater.fraction === 1) {
    copy(waterStart, waterDest);
    waterStart.z += P.sv_stepsize + 1;
    tracePlayerBBox(waterStart, waterDest, mask, trWater);
    if (!trWater.startSolid && !trWater.allSolid) {
      copy(st.origin, trWater.endPos);
      removeBaseVelocity();
      return;
    }
    tryPlayerMove(null, null, 0);
  } else {
    if (!onGround()) {
      tryPlayerMove(null, null, 0);
      removeBaseVelocity();
      return;
    }
    stepMove(waterDest, trWater);
  }
  removeBaseVelocity();
}

/** SDK: CTFGameMovement::FullWalkMoveUnderwater. */
function fullWalkMoveUnderwater(): void {
  if (st.waterLevel === WL_WAIST) checkWaterJump();

  // Falling again: no longer jumping out of the water.
  if (st.velocity.z < 0 && st.waterJumpTime) st.waterJumpTime = 0;

  if (buttons & IN_JUMP) checkJumpButton();
  else oldButtons &= ~IN_JUMP;

  waterMove();
  categorizePosition();
  if (onGround()) st.velocity.z = 0;
}

// --- Walking ------------------------------------------------------------------------

/** SDK: CTFGameMovement::FullWalkMove. */
function fullWalkMove(): void {
  const v = st.velocity;
  if (!inWater()) {
    if (hasCond(MOVE_COND_PARACHUTE_ACTIVE) && v.z < 0) {
      v.z = Math.max(
        v.z,
        hasCond(MOVE_COND_BURNING) ? TF_PARACHUTE_MAXSPEED_ONFIRE_Z : TF_PARACHUTE_MAXSPEED_Z,
      );
      // Damp rather than clamp the horizontal speed.
      const drag = TF_PARACHUTE_MAXSPEED_XY;
      const sx = Math.abs(v.x);
      const sy = Math.abs(v.y);
      const rx = sx > drag ? (sx - drag) / 3 - 10 : 0;
      const ry = sy > drag ? (sy - drag) / 3 - 10 : 0;
      v.x = Math.min(Math.max(v.x, -drag - rx), drag + rx);
      v.y = Math.min(Math.max(v.y, -drag - ry), drag + ry);
    }
    startGravity();
  }

  // Leaping out of the water: just update the counters.
  if (st.waterJumpTime) {
    waterJump();
    tryPlayerMove(null, null, 0);
    checkWater();
    return;
  }

  if (inWater()) {
    fullWalkMoveUnderwater();
    return;
  }

  if (buttons & IN_JUMP) checkJumpButton();
  else oldButtons &= ~IN_JUMP;

  checkVelocity();

  if (onGround()) {
    v.z = 0;
    friction();
    walkMove();
  } else {
    airMove();
  }

  categorizePosition();

  if (!inWater()) finishGravity();
  if (onGround()) v.z = 0;

  checkFalling();
  checkVelocity();
}

/** SDK: CGameMovement::Friction. */
function friction(): void {
  if (st.waterJumpTime) return;
  const v = st.velocity;
  const speed = length(v);
  if (speed < 0.1) return;

  let drop = 0;
  if (onGround()) {
    const fr = P.sv_friction * st.surfaceFriction;
    // Bleed at least the stop speed's worth.
    const control = speed < P.sv_stopspeed ? P.sv_stopspeed : speed;
    drop += control * fr * DT;
  }

  let newspeed = speed - drop;
  if (newspeed < 0) newspeed = 0;
  if (newspeed !== speed) {
    const s = newspeed / speed;
    v.x *= s;
    v.y *= s;
    v.z *= s;
  }
}

/** SDK: CTFGameMovement::CanAccelerate — alive (TF_STATE_ACTIVE) and not water jumping, or an observer. */
function canAccelerate(): boolean {
  if (isObserver()) return true;
  if (st.dead) return false;
  return st.waterJumpTime === 0;
}

/** SDK: CGameMovement::Accelerate. */
function accelerate(dir: Vec3, wishspeed: number, accel: number): void {
  if (!canAccelerate()) return;
  const v = st.velocity;
  const currentspeed = dot(v, dir);
  const addspeed = wishspeed - currentspeed;
  if (addspeed <= 0) return;
  let accelspeed = accel * DT * wishspeed * st.surfaceFriction;
  if (accelspeed > addspeed) accelspeed = addspeed;
  v.x += accelspeed * dir.x;
  v.y += accelspeed * dir.y;
  v.z += accelspeed * dir.z;
}

/** Forward and right flattened onto the ground plane (WalkMove/AirMove/AirDash). */
function flatViewVectors(): void {
  angleVectors(viewAngles, fwd, right);
  fwd.z = 0;
  right.z = 0;
  normalize(fwd);
  normalize(right);
}

/** SDK: CTFGameMovement::WalkMove. */
function walkMove(): void {
  flatViewVectors();
  const v = st.velocity;

  wishdir.x = fwd.x * fmove + right.x * smove;
  wishdir.y = fwd.y * fmove + right.y * smove;
  wishdir.z = 0;
  let wishspeed = normalize(wishdir);
  wishspeed = Math.min(Math.max(wishspeed, 0), maxSpeed);

  v.z = 0;

  let accel = P.sv_accelerate;
  const fr = P.sv_friction * st.surfaceFriction;
  // Below this wish speed friction would win; scale acceleration so we can still move.
  const wishThreshold = (100 * fr) / P.sv_accelerate;
  if (wishspeed > 0 && wishspeed < wishThreshold && !hasCond(MOVE_COND_LOST_FOOTING)) {
    const spd = length(v);
    const control = spd < P.sv_stopspeed ? P.sv_stopspeed : spd;
    accel = (control * fr) / wishspeed + 1;
  }

  accelerate(wishdir, wishspeed, accel);

  // Clamp the horizontal speed.
  let newSpeed = length(v);
  if (newSpeed > maxSpeed) {
    const s = maxSpeed / newSpeed;
    v.x *= s;
    v.y *= s;
  }

  const pull = st.attrs.forwardPull;
  if (pull > 0) {
    v.x += fwd.x * pull;
    v.y += fwd.y * pull;
    v.z += fwd.z * pull;
    if (length2D(v) > maxSpeed) {
      normalize(v);
      v.x *= maxSpeed;
      v.y *= maxSpeed;
      v.z *= maxSpeed;
    }
  }

  // Backpedalling runs at 90 % of max speed (above a 100 u/s floor).
  if (P.tfRules && TF_CLAMP_BACK_SPEED < 1 && length(v) > TF_CLAMP_BACK_SPEED_MIN) {
    const fdot = dot(fwd, v);
    if (fdot < 0) {
      let bx = fwd.x * fdot;
      let by = fwd.y * fdot;
      let bz = fwd.z * fdot;
      const rdot = dot(right, v);
      const backSpeed = Math.sqrt(bx * bx + by * by + bz * bz);
      const maxBack = maxSpeed * TF_CLAMP_BACK_SPEED;
      if (backSpeed > maxBack) {
        const s = maxBack / backSpeed;
        bx *= s;
        by *= s;
        bz *= s;
      }
      v.x = bx + right.x * rdot;
      v.y = by + right.y * rdot;
      v.z = bz + right.z * rdot;
      newSpeed = length(v);
      if (newSpeed > maxSpeed) {
        const s = maxSpeed / newSpeed;
        v.x *= s;
        v.y *= s;
      }
    }
  }

  addBaseVelocity();

  if (length(v) < 1) {
    v.x = v.y = v.z = 0;
    return;
  }

  walkDest.x = st.origin.x + v.x * DT;
  walkDest.y = st.origin.y + v.y * DT;
  walkDest.z = st.origin.z;

  tracePlayerBBox(st.origin, walkDest, playerSolidMask(), trWalk);
  if (trWalk.fraction === 1) {
    copy(st.origin, trWalk.endPos);
    removeBaseVelocity();
    return;
  }

  if (trWalk.entity !== WORLD_ENTITY && trWalk.entity !== NO_ENTITY && cx.isPlayer?.(trWalk.entity))
    endCharge();

  stepMove(walkDest, trWalk);
  removeBaseVelocity();
}

function addBaseVelocity(): void {
  st.velocity.x += st.baseVelocity.x;
  st.velocity.y += st.baseVelocity.y;
  st.velocity.z += st.baseVelocity.z;
}

function removeBaseVelocity(): void {
  st.velocity.x -= st.baseVelocity.x;
  st.velocity.y -= st.baseVelocity.y;
  st.velocity.z -= st.baseVelocity.z;
}

/**
 * SDK: CTFGameMovement::StepMove — try the "high road" (up a step, across,
 * back down) first; fall back to the "low road" (a plain slide) when the high
 * road ends off standable ground or goes nowhere, keeping whichever went
 * further.
 */
function stepMove(dest: Vec3, trace: TraceResult): void {
  copyTrace(trStepSave, trace);
  copy(stepPos, st.origin);
  copy(stepVel, st.velocity);
  const mask = playerSolidMask();

  let lowRoad = false;
  let upRoad = true;

  // High road: up by the step height…
  copy(stepEnd, st.origin);
  stepEnd.z += P.sv_stepsize + DIST_EPSILON;
  tracePlayerBBox(st.origin, stepEnd, mask, trStep);
  if (!trStep.startSolid && !trStep.allSolid) copy(st.origin, trStep.endPos);

  // …across…
  tryPlayerMove(null, null, 0);

  // …and back down.
  copy(stepEnd, st.origin);
  stepEnd.z -= P.sv_stepsize + DIST_EPSILON;
  tracePlayerBBox(st.origin, stepEnd, mask, trStep);
  if (!trStep.startSolid && !trStep.allSolid) copy(st.origin, trStep.endPos);

  if (
    (trStep.fraction !== 1 && trStep.plane.normal.z < MIN_STANDABLE_NORMAL_Z) ||
    (st.origin.x === stepPos.x && st.origin.y === stepPos.y && st.origin.z === stepPos.z)
  ) {
    lowRoad = true;
    upRoad = false;
  }

  if (lowRoad) {
    if (upRoad) {
      copy(stepUpPos, st.origin);
      copy(stepUpVel, st.velocity);
    }
    copy(st.origin, stepPos);
    copy(st.velocity, stepVel);
    copy(stepEnd, dest);
    tryPlayerMove(stepEnd, trStepSave, 0);

    copy(stepDownPos, st.origin);
    copy(stepDownVel, st.velocity);

    if (upRoad) {
      const upDist = (stepUpPos.x - stepPos.x) ** 2 + (stepUpPos.y - stepPos.y) ** 2;
      const downDist = (stepDownPos.x - stepPos.x) ** 2 + (stepDownPos.y - stepPos.y) ** 2;
      if (upDist >= downDist) {
        copy(st.origin, stepUpPos);
        copy(st.velocity, stepUpVel);
        st.velocity.z = stepDownVel.z;
      }
    }
  }
}

/** SDK: CGameMovement::ClipVelocity — slide `inV` along a plane; returns the blocked flags. */
function clipVelocity(
  inV: Vec3,
  normal: Vec3,
  out: Vec3,
  overbounce: number,
  redirect: number,
): number {
  const angle = normal.z;
  let blocked = 0;
  if (angle > 0) blocked |= 1; // floor
  if (!angle) blocked |= 2; // wall / step

  const into = dot(inV, normal);
  const backoff = into * overbounce;
  out.x = inV.x - normal.x * backoff;
  out.y = inV.y - normal.y * backoff;
  out.z = inV.z - normal.z * backoff;

  // Make sure we aren't still moving through the plane.
  const adjust = dot(out, normal);
  if (adjust < 0) {
    out.x -= normal.x * adjust;
    out.y -= normal.y * adjust;
    out.z -= normal.z * adjust;
  }

  if (redirect > 0) {
    const len = length(out);
    if (len > 0) {
      const s = (-1 * into * redirect + len) / len;
      out.x *= s;
      out.y *= s;
      out.z *= s;
    }
  }
  return blocked;
}

/** Speed (u/s) added along a re-hit plane's normal; moves the hull ~5e-4 units in a tick. */
const DUPLICATE_PLANE_PUSH = 1 / 32;

function isDuplicatePlane(n: Vec3, numplanes: number): boolean {
  for (let i = 0; i < numplanes; i++) {
    if (dot(n, tryPlanes[i]!) > 0.99999) return true;
  }
  return false;
}

/**
 * SDK: CGameMovement::TryPlayerMove — move along the velocity for the rest of
 * the tick, sliding along up to MAX_CLIP_PLANES planes over NUM_BUMPS bumps.
 * Returns the blocked flags (1 floor, 2 wall, 4 trapped).
 */
function tryPlayerMove(
  firstDest: Vec3 | null,
  firstTrace: TraceResult | null,
  slideMult: number,
): number {
  const v = st.velocity;
  let blocked = 0;
  let numplanes = 0;
  copy(tryOriginal, v);
  copy(tryPrimal, v);
  let allFraction = 0;
  let timeLeft = DT;
  tryNew.x = tryNew.y = tryNew.z = 0;
  const mask = playerSolidMask();
  const pm = trTry;

  for (let bump = 0; bump < NUM_BUMPS; bump++) {
    if (length(v) === 0) break;

    tryEnd.x = st.origin.x + timeLeft * v.x;
    tryEnd.y = st.origin.y + timeLeft * v.y;
    tryEnd.z = st.origin.z + timeLeft * v.z;

    // StepMove's low road already traced exactly this move.
    if (
      firstDest &&
      firstTrace &&
      tryEnd.x === firstDest.x &&
      tryEnd.y === firstDest.y &&
      tryEnd.z === firstDest.z
    ) {
      copyTrace(pm, firstTrace);
    } else {
      tracePlayerBBox(st.origin, tryEnd, mask, pm);
    }

    allFraction += pm.fraction;

    // Trapped in a solid: stop dead.
    if (pm.allSolid) {
      v.x = v.y = v.z = 0;
      return 4;
    }

    if (pm.fraction > 0) {
      if (pm.fraction === 1) {
        // A swept box can end inside terrain; refuse a move that would get us stuck.
        tracePlayerBBox(pm.endPos, pm.endPos, mask, trTryStuck);
        if (trTryStuck.startSolid || trTryStuck.fraction !== 1) {
          v.x = v.y = v.z = 0;
          break;
        }
      }
      copy(st.origin, pm.endPos);
      copy(tryOriginal, v);
      numplanes = 0;
    }

    if (pm.fraction === 1) break; // moved the whole way

    if (pm.plane.normal.z > MIN_STANDABLE_NORMAL_Z) blocked |= 1;
    if (!pm.plane.normal.z) blocked |= 2;

    timeLeft -= timeLeft * pm.fraction;

    // Re-hitting a plane we already slid along (rounding at DIST_EPSILON): push
    // off it instead of recording a duplicate, whose zero-length crease would
    // stop us dead — the "ramp bug". See the notes at the end of the file.
    if (pm.fraction === 0 && isDuplicatePlane(pm.plane.normal, numplanes)) {
      const n = pm.plane.normal;
      v.x += n.x * DUPLICATE_PLANE_PUSH;
      v.y += n.y * DUPLICATE_PLANE_PUSH;
      v.z += n.z * DUPLICATE_PLANE_PUSH;
      continue;
    }

    if (numplanes >= MAX_CLIP_PLANES) {
      v.x = v.y = v.z = 0;
      break;
    }

    copy(tryPlanes[numplanes]!, pm.plane.normal);
    numplanes++;

    if (numplanes === 1 && st.moveType === MOVETYPE_WALK && !onGround()) {
      // In the air, reflect off the first plane only.
      for (let i = 0; i < numplanes; i++) {
        const p = tryPlanes[i]!;
        if (p.z > MIN_STANDABLE_NORMAL_Z) {
          clipVelocity(tryOriginal, p, tryNew, 1, slideMult);
          copy(tryOriginal, tryNew);
        } else {
          clipVelocity(tryOriginal, p, tryNew, 1 + SV_BOUNCE * (1 - st.surfaceFriction), slideMult);
        }
      }
      copy(v, tryNew);
      copy(tryOriginal, tryNew);
    } else {
      let i = 0;
      for (; i < numplanes; i++) {
        clipVelocity(tryOriginal, tryPlanes[i]!, v, 1, slideMult);
        let j = 0;
        for (; j < numplanes; j++) {
          if (j !== i && dot(v, tryPlanes[j]!) < 0) break; // moving against another plane
        }
        if (j === numplanes) break; // clear of every plane
      }

      if (i === numplanes) {
        // Go along the crease of two planes, or stop.
        if (numplanes !== 2) {
          v.x = v.y = v.z = 0;
          break;
        }
        const a = tryPlanes[0]!;
        const b = tryPlanes[1]!;
        tryDir.x = a.y * b.z - a.z * b.y;
        tryDir.y = a.z * b.x - a.x * b.z;
        tryDir.z = a.x * b.y - a.y * b.x;
        normalize(tryDir);
        const d = dot(tryDir, v);
        v.x = tryDir.x * d;
        v.y = tryDir.y * d;
        v.z = tryDir.z * d;
      }

      // Turned back against the original velocity: stop, to avoid jitter in corners.
      if (dot(v, tryPrimal) <= 0) {
        v.x = v.y = v.z = 0;
        break;
      }
    }
  }

  if (allFraction === 0) v.x = v.y = v.z = 0;

  // Slammed into a wall?
  const lateralStop = length2D(tryPrimal) - length2D(v);
  let slamVol = 0;
  if (lateralStop > P.maxSafeFallSpeed * 2) slamVol = 1;
  else if (lateralStop > P.maxSafeFallSpeed) slamVol = 0.85;
  roughLandingEffects(slamVol);

  return blocked;
}

// --- Air -----------------------------------------------------------------------------

/** SDK: CTFGameMovement::GetAirSpeedCap. */
function airSpeedCap(): number {
  if (hasCond(MOVE_COND_SHIELD_CHARGE)) return TF_MAX_CHARGE_SPEED;
  let cap = AIR_SPEED_CAP;
  if (hasCond(MOVE_COND_PARACHUTE_ACTIVE)) cap *= TF_PARACHUTE_AIRCONTROL;
  let control = st.attrs.airControlMod;
  if (hasCond(MOVE_COND_BLAST_JUMPING)) control *= st.attrs.blastJumpAirControlMod;
  if (hasCond(MOVE_COND_ROCKETPACK)) cap *= 0.5;
  return cap * control;
}

/** SDK: CGameMovement::AirAccelerate — wish speed capped at 30, acceleration from the full wish. */
function airAccelerate(dir: Vec3, wishspeed: number, accel: number): void {
  if (st.dead || st.waterJumpTime) return;
  let wishspd = wishspeed;
  const cap = airSpeedCap();
  if (wishspd > cap) wishspd = cap;
  const v = st.velocity;
  const currentspeed = dot(v, dir);
  const addspeed = wishspd - currentspeed;
  if (addspeed <= 0) return;
  let accelspeed = accel * wishspeed * DT * st.surfaceFriction;
  if (accelspeed > addspeed) accelspeed = addspeed;
  v.x += accelspeed * dir.x;
  v.y += accelspeed * dir.y;
  v.z += accelspeed * dir.z;
}

/** SDK: CTFGameMovement::AirMove. */
function airMove(): void {
  flatViewVectors();
  const v = st.velocity;

  wishvel.x = fwd.x * fmove + right.x * smove;
  wishvel.y = fwd.y * fmove + right.y * smove;
  wishvel.z = 0;
  copy(wishdir, wishvel);
  let wishspeed = normalize(wishdir);
  if (wishspeed !== 0 && wishspeed > maxSpeed) {
    const s = maxSpeed / wishspeed;
    wishvel.x *= s;
    wishvel.y *= s;
    wishspeed = maxSpeed;
  }

  let airAccel = P.sv_airaccelerate;
  let wallSlide = 0;
  if (hasCond(MOVE_COND_AIR_CURRENT)) {
    airAccel *= TF_AIRCURRENT_AIRCONTROL_MULT;
    wallSlide = Math.min(Math.max(1 - TF_AIRCURRENT_FRICTION_MULT, 0), 1);
  }

  airAccelerate(wishdir, wishspeed, airAccel);

  const pull = st.attrs.forwardPull;
  if (pull > 0) {
    v.x += fwd.x * pull;
    v.y += fwd.y * pull;
    if (length2D(v) > maxSpeed) {
      const s = maxSpeed / length2D(v);
      v.x *= s;
      v.y *= s;
    }
  }

  addBaseVelocity();
  tryPlayerMove(null, null, wallSlide);
  removeBaseVelocity();
}

/** SDK: CGameMovement::StartGravity — the first half of this tick's gravity, plus base z. */
function startGravity(): void {
  const v = st.velocity;
  v.z -= gravityScale() * P.gravity * 0.5 * DT;
  v.z += st.baseVelocity.z * DT;
  st.baseVelocity.z = 0;
  checkVelocity();
}

/** SDK: CGameMovement::FinishGravity — the second half. */
function finishGravity(): void {
  if (st.waterJumpTime) return;
  st.velocity.z -= gravityScale() * P.gravity * DT * 0.5;
  checkVelocity();
}

/** SDK: CGameMovement::CheckVelocity — drop NaNs, clamp each axis to sv_maxvelocity. */
function checkVelocity(): void {
  const v = st.velocity;
  const o = st.origin;
  if (Number.isNaN(v.x)) v.x = 0;
  if (Number.isNaN(v.y)) v.y = 0;
  if (Number.isNaN(v.z)) v.z = 0;
  if (Number.isNaN(o.x)) o.x = 0;
  if (Number.isNaN(o.y)) o.y = 0;
  if (Number.isNaN(o.z)) o.z = 0;
  v.x = v.x > P.sv_maxvelocity ? P.sv_maxvelocity : v.x < -P.sv_maxvelocity ? -P.sv_maxvelocity : v.x;
  v.y = v.y > P.sv_maxvelocity ? P.sv_maxvelocity : v.y < -P.sv_maxvelocity ? -P.sv_maxvelocity : v.y;
  v.z = v.z > P.sv_maxvelocity ? P.sv_maxvelocity : v.z < -P.sv_maxvelocity ? -P.sv_maxvelocity : v.z;
}

// --- Jumping ------------------------------------------------------------------------

/** SDK: CTFPlayer::CanAirDash. */
function canAirDash(): boolean {
  if (hasCond(MOVE_COND_HALLOWEEN_SPEED_BOOST)) return true;
  if (st.classIndex !== TF_CLASS_SCOUT) return false;
  if (hasCond(MOVE_COND_SODAPOPPER_HYPE)) return st.airDash < 5;
  if (st.airDash >= st.attrs.airDashCount) return false;
  return !st.attrs.airDashDisabled;
}

/** SDK: CTFGameMovement::AirDash — the Scout's air jump replaces velocity outright. */
function airDash(): void {
  let jumpMod = st.attrs.jumpHeightMod;
  if (st.attrs.hypeResetsOnJump && !hasCond(MOVE_COND_SODAPOPPER_HYPE)) {
    st.scoutHype = Math.min(Math.max(st.scoutHype - st.attrs.hypeResetsOnJump, 0), 100);
  }
  if (st.attrs.agilityRune) jumpMod *= 1.8;
  const dashZ = TF_AIRDASH_IMPULSE * jumpMod;

  flatViewVectors();
  const v = st.velocity;
  v.x = fwd.x * fmove + right.x * smove;
  v.y = fwd.y * fmove + right.y * smove;
  v.z = dashZ;

  st.airDash++;
}

/** SDK: CTFGameMovement::PreventBunnyJumping — cap jump-off speed at 1.2 × max speed. */
function preventBunnyJumping(): void {
  const maxScaled = BUNNYJUMP_MAX_SPEED_FACTOR * st.maxSpeed;
  if (maxScaled <= 0) return;
  const v = st.velocity;
  const spd = length(v);
  if (spd <= maxScaled) return;
  const f = maxScaled / spd;
  v.x *= f;
  v.y *= f;
  v.z *= f;
}

/**
 * SDK: CGameMovement::CheckJumpButton under HL2_DLL with one client — a share of
 * the forward move (half, a tenth when sprinting or ducked) is added along the
 * view's flat forward, clipped so the jump never exceeds that share over max speed.
 */
function hl2JumpBoost(): void {
  angleVectors(viewAngles, fwd);
  fwd.z = 0;
  normalize(fwd);
  const perc = !cx.sprinting && !st.ducked ? 0.5 : 0.1;
  let add = Math.abs(fmove * perc);
  const maxS = maxSpeed + maxSpeed * perc;
  const newSpeed = add + length2D(st.velocity);
  if (newSpeed > maxS) add -= newSpeed - maxS;
  if (fmove < 0) add *= -1;
  st.velocity.x += fwd.x * add;
  st.velocity.y += fwd.y * add;
}

/** SDK: CTFGameMovement::ToggleParachute. */
function toggleParachute(): void {
  if (oldButtons & IN_JUMP) return;
  if (!st.attrs.parachute) return;
  if (hasCond(MOVE_COND_PARACHUTE_ACTIVE)) {
    st.conds &= ~MOVE_COND_PARACHUTE_ACTIVE;
  } else if (!onGround() && !st.attrs.parachuteDisabled && !hasCond(MOVE_COND_PARACHUTE_DEPLOYED)) {
    st.conds |= MOVE_COND_PARACHUTE_ACTIVE | MOVE_COND_PARACHUTE_DEPLOYED;
  }
}

/** SDK: CTFGameMovement::CheckJumpButton. Returns true when a jump or air dash happened. */
function checkJumpButton(): boolean {
  if (st.dead) return false;
  if (!checkWaterJumpButton()) return false;

  // CTFPlayer::CanJump
  if (hasCond(MOVE_COND_TAUNTING) || st.attrs.noJump) return false;

  const grounded = onGround();
  let doAirDash = false;

  toggleParachute();

  // Cannot jump while ducked — unless a Scout in the air (TF only; the base movement allows it).
  if (P.tfRules && st.flags & FL_DUCKING) {
    if (!(st.classIndex === TF_CLASS_SCOUT && !grounded)) return false;
  }

  // Cannot jump while in the unduck transition.
  if (st.ducking && st.flags & FL_DUCKING) return false;

  // Cannot jump again until the button has been released.
  if (oldButtons & IN_JUMP) return false;

  if (!grounded) {
    if (canAirDash()) {
      doAirDash = true;
    } else {
      oldButtons |= IN_JUMP;
      return false;
    }
  }

  if (doAirDash) {
    airDash();
    st.airDucked = 0;
    cx.onJump?.(true);
    return true;
  }

  if (P.tfRules) preventBunnyJumping();

  if (st.surfaceName) cx.onFootstep?.(st.surfaceName, 1);
  st.jumping = true;

  setGroundEntity(null);

  const groundFactor = st.surfaceName ? surface(st.surfaceName).jumpFactor : 1;
  let jumpMod = st.attrs.jumpHeightMod;
  if (st.attrs.agilityRune) jumpMod *= 1.8;
  const mul = P.jumpImpulse * jumpMod * groundFactor;

  // Ducking sets the speed outright; standing adds to it.
  if (st.ducking || st.flags & FL_DUCKING) st.velocity.z = mul;
  else st.velocity.z += mul;

  if (P.hl2JumpBoost) hl2JumpBoost();

  finishGravity();

  oldButtons |= IN_JUMP;
  cx.onJump?.(false);
  return true;
}

// --- Landing --------------------------------------------------------------------------

/** SDK: CTFGameMovement::CheckFalling + CGameMovement::CheckFalling. */
function checkFalling(): void {
  if (onGround() && !st.dead && st.jumping) st.jumping = false;

  if (!onGround() || st.fallVelocity <= 0) return;

  if (!st.dead && st.fallVelocity >= P.fallPunchThreshold) {
    let fvol = 0.5;
    if (st.waterLevel > 0) {
      // Landed in water.
    } else {
      // Landing on something moving down softens the impact.
      entityVelocity(st.groundEntity, groundVel);
      if (groundVel.z < 0) st.fallVelocity = Math.max(0.1, st.fallVelocity + groundVel.z);

      if (st.fallVelocity > P.maxSafeFallSpeed) {
        cx.onFallDamage?.(st.fallVelocity);
        fvol = 1;
      } else if (st.fallVelocity > P.maxSafeFallSpeed / 2) {
        fvol = 0.85;
      } else if (st.fallVelocity < P.minBounceSpeed) {
        fvol = 0;
      }
    }
    roughLandingEffects(fvol);
  }

  cx.onLand?.(st.fallVelocity);
  st.fallVelocity = 0;
}

/** SDK: CTFGameMovement::PlayerRoughLandingEffects + base — step sound and a view roll. */
function roughLandingEffects(volume: number): void {
  let fvol = volume;
  // Scouts only rumble when they take damage.
  if (st.classIndex === TF_CLASS_SCOUT && fvol < 1) fvol = 0;
  if (fvol <= 0) return;
  st.stepSoundTime = 400;
  if (st.surfaceName) cx.onFootstep?.(st.surfaceName, fvol);
  st.punchAngle.z = st.fallVelocity * 0.013;
  if (st.punchAngle.x > 8) st.punchAngle.x = 8;
}

// --- Footsteps ------------------------------------------------------------------------

/** SDK: CTFPlayer::GetStepSoundVelocities / SetStepSoundTime + CBasePlayer::UpdateStepSound. */
function updateStepSound(): void {
  if (st.stepSoundTime > 0) {
    st.stepSoundTime = Math.max(0, st.stepSoundTime - FRAME_MSEC);
  }
  if (st.stepSoundTime > 0) return;
  if (st.flags & FL_FROZEN) return;
  if (st.moveType === MOVETYPE_NOCLIP || st.moveType === MOVETYPE_OBSERVER) return;

  const v = st.velocity;
  const speed = length(v);
  const groundspeed = length2D(v);
  const ms = st.maxSpeed;
  const ducked = (st.flags & FL_DUCKING) !== 0;
  let velwalk: number;
  let velrun: number;
  if (ducked) {
    const loser = hasCond(MOVE_COND_LOSER);
    velwalk = loser ? 0 : ms * 0.25;
    velrun = loser ? 0 : ms * 0.3;
  } else {
    velwalk = ms * 0.3;
    velrun = ms * 0.8;
  }

  if (speed < velwalk || !(onGround() && groundspeed > 0.0001)) return;

  const walking = speed < velrun;
  let name: string;
  let fvol: number;
  if (st.waterLevel === WL_WAIST) {
    if (st.stepSkip === 0) {
      st.stepSkip++;
      return;
    }
    if (st.stepSkip++ === 3) st.stepSkip = 0;
    name = 'wade';
    fvol = 0.65;
    st.stepSoundTime = remapClamped(ms, 200, 450, 600, 400);
  } else {
    if (st.waterLevel === WL_FEET) {
      name = 'water';
    } else {
      if (!st.surfaceName) return;
      name = st.surfaceName;
    }
    fvol = walking ? 0.2 : 0.5;
    st.stepSoundTime = remapClamped(ms, 200, 450, 400, 200) + (walking ? 100 : 0);
  }
  if (ducked) st.stepSoundTime += 100;

  cx.onFootstep?.(name, fvol);
}

// --- Ducking -----------------------------------------------------------------------------

/** SDK: CGameMovement::SetDuckedEyeOffset — eye height between standing (0) and ducked (1). */
function setDuckedEyeOffset(frac: number): void {
  const more = P.duckHullMin.z - P.hullMin.z;
  st.viewOffsetZ = (P.duckViewZ - more) * frac + standEyeHeight() * (1 - frac);
}

/** SDK: CGameMovement::HandleDuckingSpeedCrop (+ TF loser freeze) — a third of the input when crouched on ground. */
function handleDuckingSpeedCrop(): void {
  if (!speedCropped && st.flags & FL_DUCKING && onGround()) {
    const frac = 0.33333333;
    fmove *= frac;
    smove *= frac;
    umove *= frac;
    speedCropped = true;
    if (hasCond(MOVE_COND_LOSER)) {
      fmove = 0;
      smove = 0;
      umove = 0;
    }
  }
}

/** SDK: CGameMovement::FixPlayerCrouchStuck — nudge up (or down) out of a solid, up to 36 units. */
function fixPlayerCrouchStuck(upward: boolean): void {
  if (testPlayerPosition(st.origin, trDuck) === NO_ENTITY) return;
  copy(duckOrigin, st.origin);
  const dir = upward ? 1 : 0;
  for (let i = 0; i < 36; i++) {
    st.origin.z += dir;
    if (testPlayerPosition(st.origin, trDuck) === NO_ENTITY) return;
  }
  copy(st.origin, duckOrigin); // failed
}

/** SDK: CGameMovement::CanUnduck — room for the standing hull (lowered by 20 in the air). */
function canUnduck(): boolean {
  copy(duckOrigin, st.origin);
  if (!onGround()) duckOrigin.z -= duckHullDeltaZ();
  const saved = st.ducked;
  st.ducked = false;
  tracePlayerBBox(st.origin, duckOrigin, playerSolidMask(), trDuck);
  st.ducked = saved;
  return !(trDuck.startSolid || trDuck.fraction !== 1);
}

/** SDK: CGameMovement::FinishDuck — switch to the duck hull; in the air the feet rise 20 units. */
function finishDuck(): void {
  if (st.flags & FL_DUCKING) return;
  st.flags |= FL_DUCKING;
  st.ducked = true;
  st.ducking = false;
  st.viewOffsetZ = P.duckViewZ;
  if (onGround()) {
    st.origin.z -= P.duckHullMin.z - P.hullMin.z;
  } else {
    st.origin.z += duckHullDeltaZ();
  }
  fixPlayerCrouchStuck(true);
  categorizePosition();
}

/** SDK: CGameMovement::FinishUnDuck — back to the standing hull; in the air the feet drop 20. */
function finishUnDuck(): void {
  if (onGround()) st.origin.z += P.duckHullMin.z - P.hullMin.z;
  else st.origin.z -= duckHullDeltaZ();
  st.ducked = false;
  st.flags &= ~FL_DUCKING;
  st.ducking = false;
  st.viewOffsetZ = standEyeHeight();
  st.duckTime = 0;
  categorizePosition();
}

/** SDK: CTFGameMovement::DuckOverrides — no ducking in water, a re-duck lockout, two air ducks. */
function duckOverrides(): void {
  const grounded = onGround();
  if ((st.waterLevel >= WL_FEET && !grounded) || st.waterLevel >= WL_EYES) buttons &= ~IN_DUCK;
  if (!P.tfRules) return;
  if (cx.curtime < st.duckTimer && grounded) buttons &= ~IN_DUCK;
  // No "quantum crouch": no re-duck while standing back up.
  if (st.ducked && st.ducking) buttons &= ~IN_DUCK;
  if (!grounded && st.airDucked >= TF_AIRDUCKED_COUNT) buttons &= ~IN_DUCK;
}

/** SDK: CTFGameMovement::OnDuck. */
function onDuck(pressed: number): void {
  const inAir = !onGround();
  const inDuck = (st.flags & FL_DUCKING) !== 0;

  if (pressed & IN_DUCK && !inDuck) {
    st.duckTime = GAMEMOVEMENT_DUCK_TIME;
    st.ducking = true;
  }

  if (st.ducking) {
    const secs = Math.max(0, GAMEMOVEMENT_DUCK_TIME - st.duckTime) * 0.001;
    if (secs > P.timeToDuck || inDuck || inAir) finishDuck();
    else setDuckedEyeOffset(simpleSpline(secs / P.timeToDuck));
  }
}

/** SDK: CTFGameMovement::OnUnDuck. */
function onUnDuck(released: number): void {
  const inAir = !onGround();
  const inDuck = (st.flags & FL_DUCKING) !== 0;

  if (released & IN_DUCK) {
    st.duckTimer = cx.curtime + TF_TIME_TO_DUCK;
    if (inAir) st.airDucked++;
  }

  // m_bAllowAutoMovement is always true for TF players, so we always try.
  if (released & IN_DUCK) {
    if (inDuck) {
      st.duckTime = GAMEMOVEMENT_DUCK_TIME;
    } else if (st.ducking && !st.ducked) {
      // Released before fully ducked: reverse from the same eye height.
      const unduckMs = 1000 * P.timeToUnduck;
      const duckMs = 1000 * P.timeToDuck;
      const elapsed = GAMEMOVEMENT_DUCK_TIME - st.duckTime;
      const fracDucked = elapsed / duckMs;
      st.duckTime = GAMEMOVEMENT_DUCK_TIME - unduckMs + fracDucked * unduckMs;
    }
  }

  if (canUnduck()) {
    if (st.ducking || st.ducked) {
      const secs = Math.max(0, GAMEMOVEMENT_DUCK_TIME - st.duckTime) * 0.001;
      if (secs > P.timeToUnduck || inAir) {
        finishUnDuck();
      } else {
        setDuckedEyeOffset(simpleSpline(1 - secs / P.timeToUnduck));
        st.ducking = true;
      }
    }
  } else if (st.duckTime !== GAMEMOVEMENT_DUCK_TIME) {
    // Under something: stay ducked and restart the timer for when we get out.
    setDuckedEyeOffset(1);
    st.duckTime = GAMEMOVEMENT_DUCK_TIME;
    st.ducked = true;
    st.ducking = false;
    st.flags |= FL_DUCKING;
  }
}

/** SDK: CTFGameMovement::Duck. */
function duck(): void {
  duckOverrides();

  const changed = oldButtons ^ buttons;
  const pressed = changed & buttons;
  const released = changed & oldButtons;
  if (buttons & IN_DUCK) oldButtons |= IN_DUCK;
  else oldButtons &= ~IN_DUCK;

  const standEye = standEyeHeight();
  if (st.dead) {
    st.viewOffsetZ = standEye;
    return;
  }

  handleDuckingSpeedCrop();

  const inDuck = (st.flags & FL_DUCKING) !== 0;
  if (buttons & IN_DUCK || st.ducking || inDuck) {
    if (buttons & IN_DUCK && !st.attrs.noDuck) onDuck(pressed);
    else onUnDuck(released);
  } else if (Math.abs(st.viewOffsetZ - standEye) > 0.1) {
    // Self-heal a view height left at the ducked height.
    setDuckedEyeOffset(0);
  }
}

// --- Noclip and spectating ---------------------------------------------------------------

/** SDK: CGameMovement::FullNoClipMove — fly through everything. */
function fullNoClipMove(factor: number, maxAccel: number): void {
  const maxspeed = SV_MAXSPEED * factor;
  angleVectors(viewAngles, fwd, right, up);
  let f = factor;
  if (buttons & IN_SPEED) f /= 2;

  const fm = fmove * f;
  const sm = smove * f;
  normalize(fwd);
  normalize(right);
  wishvel.x = fwd.x * fm + right.x * sm;
  wishvel.y = fwd.y * fm + right.y * sm;
  wishvel.z = fwd.z * fm + right.z * sm + umove * f;

  copy(wishdir, wishvel);
  let wishspeed = normalize(wishdir);
  if (wishspeed > maxspeed) {
    const s = maxspeed / wishspeed;
    wishvel.x *= s;
    wishvel.y *= s;
    wishvel.z *= s;
    wishspeed = maxspeed;
  }

  const v = st.velocity;
  if (maxAccel > 0) {
    accelerate(wishdir, wishspeed, maxAccel);
    const spd = length(v);
    if (spd < 1) {
      v.x = v.y = v.z = 0;
      return;
    }
    // Bleed off speed, at least a quarter of max speed's worth.
    const control = spd < maxspeed / 4 ? maxspeed / 4 : spd;
    const drop = control * P.sv_friction * st.surfaceFriction * DT;
    const s = Math.max(0, spd - drop) / spd;
    v.x *= s;
    v.y *= s;
    v.z *= s;
  } else {
    copy(v, wishvel);
  }

  st.origin.x += v.x * DT;
  st.origin.y += v.y * DT;
  st.origin.z += v.z * DT;

  if (maxAccel < 0) v.x = v.y = v.z = 0;
}

/** SDK: CGameMovement::FullObserverMove — only a roaming spectator moves (sv_specnoclip 1). */
function fullObserverMove(): void {
  if (st.observerMode !== OBS_MODE_ROAMING) return; // chase / in-eye positions are set by the game
  fullNoClipMove(SV_SPECSPEED, SV_SPECACCELERATE);
}

/*
 * Intentional deviations from the SDK
 * ------------------------------------
 * - Precision: JavaScript doubles instead of 32-bit floats. Results differ from
 *   the C++ in the last few bits; the server and every client agree because
 *   they all run this code.
 * - CheckStuck tries all 54 table nudges in one tick for any blocker (the SDK
 *   client does this only for the world; the server tries one nudge per call,
 *   throttled by wall-clock time). Deterministic, so prediction matches.
 * - m_isPassingThroughEnemies is per player (the SDK keeps it on the shared
 *   movement singleton) and the func_tracktrain unstick is not ported.
 * - Water type: slime or water is tested with a bit test, not equality, so a
 *   water volume with extra content bits still swims.
 * - Spectators skip Duck() (ducking an observer only nudged its origin).
 * - Footstep volume uses the concrete volumes for every material; the surface
 *   name is passed so the audio layer can pick material-specific sounds.
 * - Not ported (no stock-gameplay effect or handled elsewhere): ladders (TF has
 *   none), the grappling hook, taunt movement, the Halloween kart and ghost
 *   modes, swimming curse, view roll (sv_rollangle 0), the duck-jump of
 *   single-player Source (TF never sets m_flDuckJumpTime in multiplayer),
 *   MOVETYPE_FLY/FLYGRAVITY toss movement, touch lists, the Atomizer's
 *   deploy-time triple-jump check, splash/footstep sound selection, and the
 *   match-start countdown freeze (the game zeroes the command instead).
 */
