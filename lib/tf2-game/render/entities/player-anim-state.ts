/**
 * Third-person player animation selection: a port of CMultiPlayerAnimState +
 * CTFPlayerAnimState (game/shared/Multiplayer/multiplayer_animstate.cpp,
 * game/shared/tf/tf_playeranimstate.cpp) over networked state. Pure: it decides activities,
 * pose parameters, the body (feet) yaw and gesture requests; `player-renderer.ts` plays them
 * through an Animator.
 *
 * Activities are named here by their base names (ACT_MP_RUN, ACT_MP_ATTACK_STAND_PRIMARYFIRE,
 * …) and translated for the held weapon's activity role with `translateActivity` — the weapon
 * acttables of tf_weaponbase.cpp (acttables.ts). Pose parameters are smoothed toward their
 * per-frame goals (MOVE_POSE_RATE, AIM_POSE_RATE); the feet lag the eyes and turn in place in
 * 45° steps (ComputePoseParam_AimYaw). Smooth blending between the activities and gestures
 * chosen here is the Animator's (animator.ts: sequence transitions, gesture ramps).
 */
import { TF_COND } from '../../sim/conditions';
import { PLAYER_ACTTABLES } from './acttables';

/** SDK: MOVING_MINIMUM_SPEED. */
export const MOVING_MINIMUM_SPEED = 0.5;
/** Airwalk when rising faster than this (tf_playeranimstate.cpp HandleJumping). */
export const AIRWALK_RISE_SPEED = 300;
/** Feet catch the eyes when they differ by more than this standing still (m_flMaxBodyYawDegrees). */
export const MAX_BODY_YAW = 45;
/** ConvergeYawAngles rate (DOD_BODYYAW_RATE) and fade span. */
export const BODY_YAW_RATE = 720;
const FADE_TURN_DEGREES = 60;
/**
 * Pose-parameter smoothing (the render-rate stand-in for C_BaseAnimating's pose-parameter
 * interpolation): move_x / move_y approach their goal at this many units per second (a full
 * 1 → 0 swing in 1/6 s, inside the 0.2 s sequence cross-fade a start or stop also brings) …
 */
export const MOVE_POSE_RATE = 6;
/** … and body_yaw / body_pitch at DOD_BODYYAW_RATE degrees per second (flicks, snapshot steps). */
export const AIM_POSE_RATE = BODY_YAW_RATE;

// PlayerAnimEvent_t (multiplayer_animstate.h).
export const PLAYERANIMEVENT_ATTACK_PRIMARY = 0;
export const PLAYERANIMEVENT_ATTACK_SECONDARY = 1;
export const PLAYERANIMEVENT_ATTACK_GRENADE = 2;
export const PLAYERANIMEVENT_RELOAD = 3;
export const PLAYERANIMEVENT_RELOAD_LOOP = 4;
export const PLAYERANIMEVENT_RELOAD_END = 5;
export const PLAYERANIMEVENT_JUMP = 6;
export const PLAYERANIMEVENT_SWIM = 7;
export const PLAYERANIMEVENT_DIE = 8;
export const PLAYERANIMEVENT_FLINCH_CHEST = 9;
export const PLAYERANIMEVENT_SPAWN = 11;
export const PLAYERANIMEVENT_CUSTOM_GESTURE = 20;
export const PLAYERANIMEVENT_ATTACK_PRE = 23;
export const PLAYERANIMEVENT_ATTACK_POST = 24;
export const PLAYERANIMEVENT_DOUBLEJUMP = 27;

/** Gesture slots (same numbering as animator.ts, multiplayer_animstate.h GestureSlot_t). */
export const SLOT_ATTACK_AND_RELOAD = 0;
export const SLOT_GRENADE = 1;
export const SLOT_JUMP = 2;
export const SLOT_SWIM = 3;
export const SLOT_FLINCH = 4;
export const SLOT_VCD = 5;
export const SLOT_CUSTOM = 6;

/** SDK Approach: `cur` moved toward `goal` by at most `step`. */
export function approach(goal: number, cur: number, step: number): number {
  const d = goal - cur;
  if (d > step) return cur + step;
  if (d < -step) return cur - step;
  return goal;
}

/** Approach for angles in degrees, the short way round. */
export function approachAngle(goal: number, cur: number, step: number): number {
  const d = angleNormalize(goal - cur);
  if (d > step) return angleNormalize(cur + step);
  if (d < -step) return angleNormalize(cur - step);
  return goal;
}

export const angleNormalize = (a: number): number => {
  a %= 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
};

/**
 * Translates a base activity for the held weapon's activity role (PRIMARY, SECONDARY, MELEE,
 * PDA, BUILDING, ITEM1–4, MELEE_ALLCLASS, PRIMARY2, SECONDARY2 — the script's WeaponType or the
 * item's `anim_slot`): CTFWeaponBase::ActivityList picks the role's acttable
 * (acttables.ts, s_acttablePrimary …; an unknown role uses the primary table, as the SDK's
 * `default:` does) and a base activity without a row stays as it is (PREFIRE/POSTFIRE, …).
 * No role ('') translates nothing.
 */
export function translateActivity(base: string, role: string): string {
  if (!role) return base;
  const table = PLAYER_ACTTABLES[role] ?? PLAYER_ACTTABLES.PRIMARY;
  return table[base] ?? base;
}

export interface PlayerAnimInput {
  /** Seconds (any monotonic clock). */
  time: number;
  dt: number;
  /** Source velocity (units/s). */
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  ducked: boolean;
  /** 0 none … 3 eyes (WL_*); swimming at ≥ 2 (WL_Waist). */
  waterLevel: number;
  eyeYaw: number;
  eyePitch: number;
  /** TF_COND bit test. */
  inCond: (cond: number) => boolean;
  /** Weapon role suffix (playerAnimSuffix), '' for none. */
  suffix: string;
  isMinigun: boolean;
  isSniperRifle: boolean;
  /** Fall speed (units/s, positive down) for the stomp check; 0 when unknown. */
  fallVelocity?: number;
  /** Whether the model has an activity (crouch tables etc.). */
  hasActivity: (act: string) => boolean;
}

export interface GestureRequest {
  slot: number;
  /** Translated activity. */
  activity: string;
  autoKill: boolean;
  /** Restart only if not already playing (minigun fire). */
  ifNotPlaying?: boolean;
}

/** Per-player state (CTFPlayerAnimState members). */
export class TFPlayerAnimState {
  jumping = false;
  firstJumpFrame = false;
  jumpStartTime = 0;
  inAirWalk = false;
  inSwim = false;
  firstSwimFrame = true;
  holdDeployedUntil = 0;
  /** m_PoseParameterData.m_flEstimateYaw. */
  estimateYaw = 0;
  goalFeetYaw = 0;
  currentFeetYaw = 0;
  lastAimTurnTime = 0;
  forceAimYaw = false;
  /** Set when the main sequence must restart (RestartMainSequence). */
  restartMain = false;
  /** Outputs of the last update. */
  mainActivity = 'ACT_MP_STAND_IDLE';
  translatedMain = 'ACT_MP_STAND_IDLE';
  /**
   * Pose parameters. The compute*() steps write their goals here; `update()` then replaces them
   * with the smoothed values the model is posed with (MOVE_POSE_RATE / AIM_POSE_RATE).
   */
  moveX = 0;
  moveY = 0;
  bodyYaw = 0;
  bodyPitch = 0;
  /** The smoothed pose parameters (valid once `poseInit`). */
  private smoothMoveX = 0;
  private smoothMoveY = 0;
  private smoothBodyYaw = 0;
  private smoothBodyPitch = 0;
  private poseInit = false;
  /** Gestures to start this frame. */
  readonly gestures: GestureRequest[] = [];

  reset(eyeYaw = 0): void {
    this.jumping = false;
    this.inAirWalk = false;
    this.inSwim = false;
    this.firstSwimFrame = true;
    this.holdDeployedUntil = 0;
    this.estimateYaw = eyeYaw;
    this.goalFeetYaw = eyeYaw;
    this.currentFeetYaw = eyeYaw;
    this.lastAimTurnTime = 0;
    this.gestures.length = 0;
    this.poseInit = false;
  }

  /**
   * Moves the posed parameters toward this frame's goals (in moveX … bodyPitch) at their
   * approach rates and writes the result back. The first update after a reset takes the goals.
   */
  smoothPoseParams(dt: number): void {
    if (!this.poseInit || dt <= 0) {
      if (!this.poseInit) {
        this.smoothMoveX = this.moveX;
        this.smoothMoveY = this.moveY;
        this.smoothBodyYaw = this.bodyYaw;
        this.smoothBodyPitch = this.bodyPitch;
        this.poseInit = true;
      }
    } else {
      const m = MOVE_POSE_RATE * dt;
      const a = AIM_POSE_RATE * dt;
      this.smoothMoveX = approach(this.moveX, this.smoothMoveX, m);
      this.smoothMoveY = approach(this.moveY, this.smoothMoveY, m);
      this.smoothBodyYaw = approachAngle(this.bodyYaw, this.smoothBodyYaw, a);
      this.smoothBodyPitch = approachAngle(this.bodyPitch, this.smoothBodyPitch, a);
    }
    this.moveX = this.smoothMoveX;
    this.moveY = this.smoothMoveY;
    this.bodyYaw = this.smoothBodyYaw;
    this.bodyPitch = this.smoothBodyPitch;
  }

  private isAiming(inp: PlayerAnimInput): boolean {
    return inp.inCond(TF_COND.AIMING);
  }

  private inDuck(inp: PlayerAnimInput): boolean {
    return inp.ducked && inp.hasActivity(translateActivity('ACT_MP_CROUCHWALK', inp.suffix));
  }

  // ─── activity selection ──────────────────────────────────────────────────

  /** SDK CTFPlayerAnimState::HandleJumping. */
  private handleJumping(inp: PlayerAnimInput): string | null {
    const duck = this.inDuck(inp);
    if (inp.isMinigun && inp.inCond(TF_COND.AIMING)) return null; // a firing heavy never jumps/airwalks
    let act: string | null = null;
    if ((inp.vz > AIRWALK_RISE_SPEED || this.inAirWalk) && !duck) {
      if (inp.onGround && this.inAirWalk) {
        this.inAirWalk = false;
        this.restartMain = true;
        this.gestures.push({
          slot: SLOT_JUMP,
          activity: translateActivity('ACT_MP_JUMP_LAND', inp.suffix),
          autoKill: true,
        });
      } else if (inp.waterLevel >= 2) {
        this.inAirWalk = false;
        this.restartMain = true;
      } else if (!inp.onGround) {
        act = 'ACT_MP_AIRWALK';
        this.inAirWalk = true;
      }
    } else if (this.jumping) {
      if (this.firstJumpFrame) {
        this.firstJumpFrame = false;
        this.restartMain = true;
      }
      if (inp.waterLevel >= 2) {
        this.jumping = false;
        this.restartMain = true;
      } else if (inp.time - this.jumpStartTime > 0.2 && inp.onGround) {
        this.jumping = false;
        this.restartMain = true;
        this.gestures.push({
          slot: SLOT_JUMP,
          activity: translateActivity('ACT_MP_JUMP_LAND', inp.suffix),
          autoKill: true,
        });
      }
      if (this.jumping)
        act = inp.time - this.jumpStartTime > 0.5 ? 'ACT_MP_JUMP_FLOAT' : 'ACT_MP_JUMP_START';
    }
    return this.jumping || this.inAirWalk ? act : null;
  }

  /** SDK CTFPlayerAnimState::HandleDucking. */
  private handleDucking(inp: PlayerAnimInput, speed: number): string | null {
    if (!this.inDuck(inp)) return null;
    const aiming = this.isAiming(inp);
    if (speed < MOVING_MINIMUM_SPEED) {
      return aiming || this.holdDeployedUntil > inp.time
        ? 'ACT_MP_CROUCH_DEPLOYED_IDLE'
        : 'ACT_MP_CROUCH_IDLE';
    }
    if (aiming && !inp.isMinigun) return 'ACT_MP_CROUCH_DEPLOYED';
    return 'ACT_MP_CROUCHWALK';
  }

  /** SDK CTFPlayerAnimState::HandleSwimming. */
  private handleSwimming(inp: PlayerAnimInput): string | null {
    if (inp.waterLevel >= 2) {
      if (this.firstSwimFrame) {
        this.restartMain = true;
        this.firstSwimFrame = false;
      }
      this.inSwim = true;
      if (
        this.isAiming(inp) &&
        (inp.isMinigun || (inp.isSniperRifle && inp.inCond(TF_COND.ZOOMED)))
      ) {
        return 'ACT_MP_SWIM_DEPLOYED';
      }
      return 'ACT_MP_SWIM';
    }
    this.inSwim = false;
    this.firstSwimFrame = true;
    return null;
  }

  /** SDK CTFPlayerAnimState::HandleMoving. */
  private handleMoving(inp: PlayerAnimInput, speed: number): string {
    if (speed > MOVING_MINIMUM_SPEED) this.holdDeployedUntil = 0;
    if (this.isAiming(inp))
      return speed > MOVING_MINIMUM_SPEED ? 'ACT_MP_DEPLOYED' : 'ACT_MP_DEPLOYED_IDLE';
    if (this.holdDeployedUntil > inp.time) return 'ACT_MP_DEPLOYED_IDLE';
    return speed > MOVING_MINIMUM_SPEED ? 'ACT_MP_RUN' : 'ACT_MP_STAND_IDLE';
  }

  /** SDK CMultiPlayerAnimState::CalcMainActivity (TF handlers). */
  calcMainActivity(inp: PlayerAnimInput): string {
    const speed = Math.hypot(inp.vx, inp.vy);
    return (
      this.handleJumping(inp) ??
      this.handleDucking(inp, speed) ??
      this.handleSwimming(inp) ??
      this.handleMoving(inp, speed)
    );
  }

  /** Base → model activity: the swim translation, then the weapon's table (TranslateActivity). */
  translate(base: string, inp: PlayerAnimInput): string {
    let act = base;
    if (this.inSwim) {
      act =
        {
          ACT_MP_ATTACK_STAND_PRIMARYFIRE: 'ACT_MP_ATTACK_SWIM_PRIMARYFIRE',
          ACT_MP_ATTACK_STAND_SECONDARYFIRE: 'ACT_MP_ATTACK_SWIM_SECONDARYFIRE',
          ACT_MP_ATTACK_STAND_GRENADE: 'ACT_MP_ATTACK_SWIM_GRENADE',
          ACT_MP_RELOAD_STAND: 'ACT_MP_RELOAD_SWIM',
        }[act] ?? act;
    }
    const t = translateActivity(act, inp.suffix);
    return inp.hasActivity(t) ? t : act;
  }

  // ─── pose parameters ─────────────────────────────────────────────────────

  /** SDK EstimateYaw. */
  private estimateYawUpdate(inp: PlayerAnimInput, entityYaw: number): void {
    if (inp.dt <= 0) return;
    if (inp.vx === 0 && inp.vy === 0) {
      let d = angleNormalize(entityYaw - this.estimateYaw);
      d *= inp.dt < 0.25 ? inp.dt * 4 : inp.dt;
      this.estimateYaw = angleNormalize(this.estimateYaw + d);
    } else {
      this.estimateYaw = Math.max(
        -180,
        Math.min(180, (Math.atan2(inp.vy, inp.vx) * 180) / Math.PI),
      );
    }
  }

  /**
   * SDK ComputePoseParam_MoveYaw (9-way): move_x / move_y from the velocity in the body
   * frame, pushed to the box edge, then scaled by speed / the sequence's authored speed.
   * `groundSpeedAt(x, y)` is the main sequence's ground speed at that blend position.
   */
  computeMoveYaw(
    inp: PlayerAnimInput,
    entityYaw: number,
    groundSpeedAt: (x: number, y: number) => number,
  ): void {
    this.estimateYawUpdate(inp, entityYaw);
    const speed = Math.hypot(inp.vx, inp.vy);
    if (speed <= MOVING_MINIMUM_SPEED) {
      this.moveX = 0;
      this.moveY = 0;
      return;
    }
    const yaw = angleNormalize(-(angleNormalize(inp.eyeYaw) - this.estimateYaw));
    let x = Math.cos((yaw * Math.PI) / 180);
    let y = -Math.sin((yaw * Math.PI) / 180);
    const inv = Math.max(Math.abs(x), Math.abs(y));
    if (inv !== 0) {
      x /= inv;
      y /= inv;
    }
    const maxSpeed = groundSpeedAt(x, y);
    if (maxSpeed > speed) {
      x *= speed / maxSpeed;
      y *= speed / maxSpeed;
    }
    this.moveX = x;
    this.moveY = y;
  }

  /** SDK ComputePoseParam_AimYaw: feet lag and the torso twist (body_yaw). */
  computeAimYaw(inp: PlayerAnimInput): void {
    const moving = Math.hypot(inp.vx, inp.vy, inp.vz) > 1;
    const eyeYaw = angleNormalize(inp.eyeYaw);
    if (moving || this.forceAimYaw) {
      this.goalFeetYaw = eyeYaw;
    } else if (this.lastAimTurnTime <= 0) {
      this.goalFeetYaw = eyeYaw;
      this.currentFeetYaw = eyeYaw;
      this.lastAimTurnTime = inp.time;
    } else {
      const d = angleNormalize(this.goalFeetYaw - eyeYaw);
      if (Math.abs(d) > MAX_BODY_YAW) this.goalFeetYaw += MAX_BODY_YAW * (d > 0 ? -1 : 1);
    }
    this.goalFeetYaw = angleNormalize(this.goalFeetYaw);
    if (this.goalFeetYaw !== this.currentFeetYaw) {
      if (this.forceAimYaw) this.currentFeetYaw = this.goalFeetYaw;
      else {
        this.currentFeetYaw = convergeYaw(
          this.goalFeetYaw,
          BODY_YAW_RATE,
          inp.dt,
          this.currentFeetYaw,
        );
        this.lastAimTurnTime = inp.time;
      }
    }
    this.bodyYaw = -angleNormalize(eyeYaw - this.currentFeetYaw);
    this.forceAimYaw = false;
  }

  /** SDK ComputePoseParam_AimPitch. */
  computeAimPitch(inp: PlayerAnimInput): void {
    this.bodyPitch = -angleNormalize(inp.eyePitch);
  }

  // ─── events ──────────────────────────────────────────────────────────────

  /** SDK CTFPlayerAnimState::DoAnimationEvent → gesture requests. */
  doAnimationEvent(event: number, inp: PlayerAnimInput): void {
    const duck = this.inDuck(inp);
    const g = (base: string, autoKill = true, ifNotPlaying = false) =>
      this.gestures.push({
        slot: SLOT_ATTACK_AND_RELOAD,
        activity: this.translate(base, inp),
        autoKill,
        ifNotPlaying,
      });
    switch (event) {
      case PLAYERANIMEVENT_ATTACK_PRIMARY:
        if (inp.isMinigun) {
          g(
            this.inSwim
              ? 'ACT_MP_ATTACK_SWIM_PRIMARYFIRE'
              : duck
                ? 'ACT_MP_ATTACK_CROUCH_PRIMARYFIRE'
                : 'ACT_MP_ATTACK_STAND_PRIMARYFIRE',
            true,
            true,
          );
        } else if (inp.isSniperRifle && inp.inCond(TF_COND.ZOOMED)) {
          g(
            duck
              ? 'ACT_MP_ATTACK_CROUCH_PRIMARYFIRE_DEPLOYED'
              : 'ACT_MP_ATTACK_STAND_PRIMARYFIRE_DEPLOYED',
          );
          this.holdDeployedUntil = inp.time + 2;
        } else {
          g(duck ? 'ACT_MP_ATTACK_CROUCH_PRIMARYFIRE' : 'ACT_MP_ATTACK_STAND_PRIMARYFIRE');
        }
        break;
      case PLAYERANIMEVENT_ATTACK_SECONDARY:
        g(
          inp.waterLevel >= 2
            ? 'ACT_MP_ATTACK_SWIM_SECONDARYFIRE'
            : duck
              ? 'ACT_MP_ATTACK_CROUCH_SECONDARYFIRE'
              : 'ACT_MP_ATTACK_STAND_SECONDARYFIRE',
        );
        break;
      case PLAYERANIMEVENT_ATTACK_GRENADE:
        this.gestures.push({
          slot: SLOT_GRENADE,
          activity: this.translate('ACT_MP_ATTACK_STAND_GRENADE', inp),
          autoKill: true,
        });
        break;
      case PLAYERANIMEVENT_ATTACK_PRE:
        g(
          this.inSwim && inp.isMinigun
            ? 'ACT_MP_ATTACK_SWIM_PREFIRE'
            : duck
              ? 'ACT_MP_ATTACK_CROUCH_PREFIRE'
              : 'ACT_MP_ATTACK_STAND_PREFIRE',
          inp.isMinigun,
        );
        break;
      case PLAYERANIMEVENT_ATTACK_POST:
        g(
          this.inSwim && inp.isMinigun
            ? 'ACT_MP_ATTACK_SWIM_POSTFIRE'
            : duck
              ? 'ACT_MP_ATTACK_CROUCH_POSTFIRE'
              : 'ACT_MP_ATTACK_STAND_POSTFIRE',
        );
        break;
      case PLAYERANIMEVENT_RELOAD:
      case PLAYERANIMEVENT_RELOAD_LOOP:
      case PLAYERANIMEVENT_RELOAD_END: {
        const tail =
          event === PLAYERANIMEVENT_RELOAD_LOOP
            ? '_LOOP'
            : event === PLAYERANIMEVENT_RELOAD_END
              ? '_END'
              : '';
        const pose = this.inAirWalk
          ? 'AIRWALK'
          : inp.ducked
            ? 'CROUCH'
            : this.inSwim
              ? 'SWIM'
              : 'STAND';
        g(`ACT_MP_RELOAD_${pose}${tail}`);
        break;
      }
      case PLAYERANIMEVENT_JUMP:
        this.jumping = true;
        this.firstJumpFrame = true;
        this.jumpStartTime = inp.time;
        this.restartMain = true;
        break;
      case PLAYERANIMEVENT_DOUBLEJUMP:
        if (!this.jumping) {
          this.jumping = true;
          this.firstJumpFrame = true;
          this.jumpStartTime = inp.time;
          this.restartMain = true;
        }
        this.inAirWalk = false;
        this.gestures.push({ slot: SLOT_JUMP, activity: 'ACT_MP_DOUBLEJUMP', autoKill: true });
        break;
      case PLAYERANIMEVENT_SPAWN:
        this.reset(inp.eyeYaw);
        break;
      case PLAYERANIMEVENT_FLINCH_CHEST:
        this.gestures.push({
          slot: SLOT_FLINCH,
          activity: this.translate('ACT_MP_GESTURE_FLINCH', inp),
          autoKill: true,
        });
        break;
    }
  }

  /**
   * One update (SDK CTFPlayerAnimState::Update): the main activity, then pose parameters
   * (smoothed: `smoothPoseParams`). `entityYaw` is the networked entity yaw; returns the render
   * (feet) yaw. Run it every render frame on interpolated state.
   */
  update(
    inp: PlayerAnimInput,
    entityYaw: number,
    groundSpeedAt: (x: number, y: number) => number,
  ): number {
    this.mainActivity = this.calcMainActivity(inp);
    this.translatedMain = this.translate(this.mainActivity, inp);
    this.computeMoveYaw(inp, entityYaw, groundSpeedAt);
    this.computeAimPitch(inp);
    this.computeAimYaw(inp);
    this.smoothPoseParams(inp.dt);
    return this.currentFeetYaw;
  }
}

/** SDK ConvergeYawAngles. */
export function convergeYaw(goal: number, rate: number, dt: number, current: number): number {
  let delta = goal - current;
  const deltaAbs = Math.abs(delta);
  delta = angleNormalize(delta);
  const scale = Math.min(1, Math.max(0.01, deltaAbs / FADE_TURN_DEGREES));
  const step = rate * dt * scale;
  if (deltaAbs < step) current = goal;
  else current += step * (delta < 0 ? -1 : 1);
  return angleNormalize(current);
}
