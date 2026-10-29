/**
 * The client's camera — the SDK's view setup (CViewRender::SetUpView →
 * C_BasePlayer::CalcView and the observer views), as plain functions over
 * Source positions and angles. The renderer turns the result into a three.js
 * camera with SourceCamera; nothing here touches three or the DOM.
 *
 *   - **First person** (CalcPlayerView): eye = origin + view offset, stair
 *     smoothing (SmoothViewOnStairs), view roll from sideways speed
 *     (CalcViewRoll / CalcRoll, sv_rollangle), then the punch angle
 *     (m_vecPunchAngle: landing shake, weapon kick, airblast) added to the
 *     angles. The weapon bob is the view model's own (render/entities/viewmodel).
 *   - **FOV** (C_BasePlayer::GetFOV): fov_desired, or a zoom FOV reached over
 *     `rate` seconds along SimpleSpline (TF2's sniper zoom: 20° in 0.1 s).
 *   - **Third person**: cam_idealdist behind the eye, pulled in by walls.
 *   - **Death cam** (CalcDeathCamView): from the corpse, backing away to
 *     CHASE_CAM_DISTANCE_MAX while turning toward the killer over the death
 *     animation time.
 *   - **Freeze cam** (CalcFreezeCamView): flies from where the view was to a
 *     point in front of the killer over spec_freeze_traveltime, looking at
 *     their chest (eyes when the shot is close), and holds there.
 *   - **Spectator**: in-eye (the target's eyes and angles), chase
 *     (CalcChaseCamView: our angles, around the target) and roaming (the
 *     predicted observer's own position).
 *
 * `ViewController` sequences these for a TF2 death the way the game does:
 * death cam → freeze cam → chase a living teammate until respawn.
 *
 * Environment-agnostic.
 */

import { angleVectors, vectorAngles, type QAngle, type Vec3 } from '../core/vec';

// ─── Constants (SDK names, SDK values) ──────────────────────────────────────

/** sv_rollangle / sv_rollspeed (Source 2013 defaults: no roll). */
export const SV_ROLLANGLE = 0;
export const SV_ROLLSPEED = 200;
/** SmoothViewOnStairs: catch-up speed (units/s) and the largest step it smooths. */
export const STAIR_SMOOTH_SPEED = 150;
export const STAIR_SMOOTH_MAX = 18;
/** TF_WEAPON_ZOOM_FOV and the rate CTFWeaponBaseGun::ZoomIn/ZoomOut pass to SetFOV. */
export const TF_WEAPON_ZOOM_FOV = 20;
export const TF_ZOOM_RATE = 0.1;
/** TF_DEATH_ANIMATION_TIME (the base game's DEATH_ANIMATION_TIME is 3). */
export const TF_DEATH_ANIMATION_TIME = 2.0;
/** spec_freeze_time / spec_freeze_traveltime / spec_freeze_distance_min / _max. */
export const SPEC_FREEZE_TIME = 4.0;
export const SPEC_FREEZE_TRAVELTIME = 0.4;
export const SPEC_FREEZE_DISTANCE_MIN = 96;
export const SPEC_FREEZE_DISTANCE_MAX = 200;
/** m_flFreezeZOffset = RandomFloat(-30, 20). */
export const FREEZE_Z_OFFSET_MIN = -30;
export const FREEZE_Z_OFFSET_MAX = 20;
/** CHASE_CAM_DISTANCE_MIN / _MAX and the rate the chase distance grows (units/s). */
export const CHASE_CAM_DISTANCE_MIN = 16;
export const CHASE_CAM_DISTANCE_MAX = 96;
export const CHASE_CAM_GROW = 48;
/** WALL_OFFSET: the camera's box half-size when tracing it out of walls. */
export const WALL_OFFSET = 6;
/** VEC_DEAD_VIEWHEIGHT.z. */
export const DEAD_VIEWHEIGHT = 14;
/** cam_idealdist (third person). */
export const THIRDPERSON_DIST = 150;
/** g_TFViewVectors m_vHullMax.z: the freeze cam aims half of it below the eyes (the chest). */
export const TF_HULL_HEIGHT = 82;

// ─── Small math ─────────────────────────────────────────────────────────────

/** SimpleSpline: 3x² − 2x³ (ease in and out). */
export function simpleSpline(x: number): number {
  const s = x * x;
  return 3 * s - 2 * s * x;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** SimpleSplineRemapValClamped. */
export function simpleSplineRemapClamped(v: number, a: number, b: number, c: number, d: number): number {
  if (a === b) return v >= b ? d : c;
  const t = clamp((v - a) / (b - a), 0, 1);
  return c + (d - c) * simpleSpline(t);
}

/** Angle lerp along the shorter arc, per component (InterpolateAngles for small turns). */
export function lerpAngles(a: QAngle, b: QAngle, t: number, out: QAngle): QAngle {
  const l = (x: number, y: number) => {
    let d = (y - x) % 360;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    return x + d * t;
  };
  out.x = l(a.x, b.x);
  out.y = l(a.y, b.y);
  out.z = l(a.z, b.z);
  return out;
}

/** SDK CalcRoll: roll (degrees) from the sideways component of the velocity. */
export function calcRoll(angles: QAngle, velocity: Vec3, rollAngle = SV_ROLLANGLE, rollSpeed = SV_ROLLSPEED): number {
  const right = { x: 0, y: 0, z: 0 };
  angleVectors(angles, undefined, right);
  let side = velocity.x * right.x + velocity.y * right.y + velocity.z * right.z;
  const sign = side < 0 ? -1 : 1;
  side = Math.abs(side);
  side = side < rollSpeed ? (side * rollAngle) / rollSpeed : rollAngle;
  return side * sign;
}

// ─── Stair smoothing ────────────────────────────────────────────────────────

/** C_BasePlayer::SmoothViewOnStairs — the eye glides up/down a step instead of snapping. */
export class StairSmoother {
  private oldZ = NaN;
  private oldViewOffsetZ = NaN;

  /**
   * Returns the eye's Z offset to add this frame. `onStaticGround`: standing on
   * the world or something that does not move (a lift moves the player itself).
   */
  update(originZ: number, viewOffsetZ: number, onStaticGround: boolean, frametime: number): number {
    if (Number.isNaN(this.oldZ)) {
      this.oldZ = originZ;
      this.oldViewOffsetZ = viewOffsetZ;
      return 0;
    }
    if (onStaticGround && originZ !== this.oldZ && this.oldViewOffsetZ === viewOffsetZ) {
      const dir = originZ > this.oldZ ? 1 : -1;
      const steptime = Math.max(0, frametime);
      this.oldZ += steptime * STAIR_SMOOTH_SPEED * dir;
      if (dir > 0) {
        if (this.oldZ > originZ) this.oldZ = originZ;
        if (originZ - this.oldZ > STAIR_SMOOTH_MAX) this.oldZ = originZ - STAIR_SMOOTH_MAX;
      } else {
        if (this.oldZ < originZ) this.oldZ = originZ;
        if (originZ - this.oldZ < -STAIR_SMOOTH_MAX) this.oldZ = originZ + STAIR_SMOOTH_MAX;
      }
      return this.oldZ - originZ;
    }
    this.oldZ = originZ;
    this.oldViewOffsetZ = viewOffsetZ;
    return 0;
  }

  reset(): void {
    this.oldZ = NaN;
    this.oldViewOffsetZ = NaN;
  }
}

// ─── FOV ────────────────────────────────────────────────────────────────────

/** C_BasePlayer::GetFOV's lerp: SetFOV(fov, rate) starts a SimpleSpline from the FOV shown now. */
export class FovState {
  private start = 0;
  private target = 0;
  private startTime = 0;
  private rate = 0;

  constructor(private defaultFov: number) {
    this.start = defaultFov;
    this.target = defaultFov;
  }

  /** fov_desired changed (settings). Applies at once when not zoomed. */
  setDefault(fov: number): void {
    const zoomed = this.target !== this.defaultFov;
    this.defaultFov = fov;
    if (!zoomed) {
      this.start = fov;
      this.target = fov;
    }
  }

  /** SetFOV: `fov` 0 = back to the default. */
  set(fov: number, rate: number, now: number): void {
    const want = fov > 0 ? fov : this.defaultFov;
    if (want === this.target) return;
    this.start = this.current(now);
    this.target = want;
    this.startTime = now;
    this.rate = rate;
  }

  current(now: number): number {
    if (this.rate <= 0 || this.start === this.target) return this.target;
    const t = (now - this.startTime) / this.rate;
    if (t >= 1) {
      this.start = this.target;
      return this.target;
    }
    return simpleSplineRemapClamped(t, 0, 1, this.start, this.target);
  }

  get zoomed(): boolean {
    return this.target !== this.defaultFov;
  }
}

// ─── Views ──────────────────────────────────────────────────────────────────

export interface ViewResult {
  origin: Vec3;
  angles: QAngle;
  fov: number;
  /** Draw the local body (any view but first person / in-eye). */
  drawLocalBody: boolean;
  /** Draw the view model. */
  drawViewModel: boolean;
}

/** A hull trace from `start` toward `end` with a ±WALL_OFFSET box; returns the reachable end. */
export type WallTrace = (start: Vec3, end: Vec3, out: Vec3) => { fraction: number };

export interface FirstPersonInput {
  origin: Vec3;
  viewOffsetZ: number;
  angles: QAngle;
  velocity: Vec3;
  punch: QAngle;
  onStaticGround: boolean;
  frametime: number;
  rollAngle?: number;
  rollSpeed?: number;
}

/** CalcPlayerView: eye, stairs, roll, punch. */
export function calcFirstPerson(p: FirstPersonInput, stairs: StairSmoother, out: { origin: Vec3; angles: QAngle }): void {
  out.origin.x = p.origin.x;
  out.origin.y = p.origin.y;
  out.origin.z = p.origin.z + p.viewOffsetZ + stairs.update(p.origin.z, p.viewOffsetZ, p.onStaticGround, p.frametime);
  out.angles.x = p.angles.x;
  out.angles.y = p.angles.y;
  out.angles.z = p.angles.z + calcRoll(p.angles, p.velocity, p.rollAngle, p.rollSpeed);
  out.angles.x += p.punch.x;
  out.angles.y += p.punch.y;
  out.angles.z += p.punch.z;
}

/** Third person: `dist` behind the eye along the view, stopped by walls. */
export function calcThirdPerson(eye: Vec3, angles: QAngle, trace: WallTrace, out: Vec3, dist = THIRDPERSON_DIST): void {
  const f = { x: 0, y: 0, z: 0 };
  angleVectors(angles, f);
  const want = { x: eye.x - f.x * dist, y: eye.y - f.y * dist, z: eye.z - f.z * dist };
  trace(eye, want, out);
}

/** CalcChaseCamView: `distance` (grown by the caller) behind the target's view point along `angles`. Returns the distance used. */
export function calcChaseCam(targetEye: Vec3, angles: QAngle, distance: number, trace: WallTrace, out: Vec3): number {
  const d = clamp(distance, CHASE_CAM_DISTANCE_MIN, CHASE_CAM_DISTANCE_MAX);
  const f = { x: 0, y: 0, z: 0 };
  angleVectors(angles, f);
  const want = { x: targetEye.x - f.x * d, y: targetEye.y - f.y * d, z: targetEye.z - f.z * d };
  const tr = trace(targetEye, want, out);
  return tr.fraction < 1 ? Math.hypot(targetEye.x - out.x, targetEye.y - out.y, targetEye.z - out.z) : d;
}

export interface DeathCamInput {
  /** Corpse origin (ragdoll), Source units. */
  corpse: Vec3;
  /** The view angles at death. */
  deathAngles: QAngle;
  /** The killer's eyes (null: no killer, a suicide or the world). */
  killerEye: Vec3 | null;
  /** Seconds since death. */
  elapsed: number;
  deathAnimTime?: number;
  /** Chase distance so far (grown 48 u/s by the caller). */
  distance: number;
}

/** CalcDeathCamView. Returns the distance used (pulled in by walls). */
export function calcDeathCam(p: DeathCamInput, trace: WallTrace, out: { origin: Vec3; angles: QAngle }): number {
  const t = clamp(p.elapsed / (p.deathAnimTime ?? TF_DEATH_ANIMATION_TIME), 0, 1);
  const origin = { x: p.corpse.x, y: p.corpse.y, z: p.corpse.z + DEAD_VIEWHEIGHT };
  out.angles.x = p.deathAngles.x;
  out.angles.y = p.deathAngles.y;
  out.angles.z = 0;
  if (p.killerEye) {
    const toKiller = { x: p.killerEye.x - origin.x, y: p.killerEye.y - origin.y, z: p.killerEye.z - origin.z };
    const aKiller = vectorAngles(toKiller, { x: 0, y: 0, z: 0 });
    lerpAngles({ x: p.deathAngles.x, y: p.deathAngles.y, z: 0 }, aKiller, t, out.angles);
  }
  return calcChaseCam(origin, out.angles, p.distance, trace, out.origin);
}

export interface FreezeCamInput {
  /** Where the view was when the freeze cam started. */
  start: Vec3;
  /** The killer's eyes and origin. */
  targetEye: Vec3;
  targetAlive: boolean;
  /** Seconds since the freeze cam started. */
  elapsed: number;
  /** RandomFloat(spec_freeze_distance_min, _max) and RandomFloat(-30, 20), chosen once. */
  distance: number;
  zOffset: number;
}

/** CalcFreezeCamView. */
export function calcFreezeCam(p: FreezeCamInput, trace: WallTrace, out: { origin: Vec3; angles: QAngle }): void {
  const blend = simpleSpline(clamp(p.elapsed / SPEC_FREEZE_TRAVELTIME, 0, 1));
  const desired = { x: p.targetEye.x, y: p.targetEye.y, z: p.targetEye.z };
  let camTarget = { ...desired };
  camTarget.z += p.targetAlive ? -TF_HULL_HEIGHT * 0.5 : DEAD_VIEWHEIGHT;
  // A point in front of the target, at the start's side, the chosen distance out and at eye height.
  const dx = camTarget.x - p.start.x;
  const dy = camTarget.y - p.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  let pos = {
    x: camTarget.x - tx * p.distance,
    y: camTarget.y - ty * p.distance,
    z: p.targetEye.z + p.zOffset,
  };
  const hit = { x: 0, y: 0, z: 0 };
  if (trace(camTarget, pos, hit).fraction < 1) {
    // Close in: aim at the eyes and lift the view so it does not look up at their chin.
    pos = { ...hit };
    camTarget = desired;
    pos.z += Math.abs(camTarget.z - pos.z) * 0.85;
    trace(camTarget, pos, hit);
    pos = { ...hit };
  }
  vectorAngles({ x: camTarget.x - pos.x, y: camTarget.y - pos.y, z: camTarget.z - pos.z }, out.angles);
  out.angles.z = 0;
  out.origin.x = p.start.x + (pos.x - p.start.x) * blend;
  out.origin.y = p.start.y + (pos.y - p.start.y) * blend;
  out.origin.z = p.start.z + (pos.z - p.start.z) * blend;
}

// ─── The sequencer ──────────────────────────────────────────────────────────

export type ViewMode = 'firstperson' | 'thirdperson' | 'deathcam' | 'freezecam' | 'chase' | 'ineye' | 'roaming';

/** What the controller needs to know about another player this frame. */
export interface ViewTarget {
  id: number;
  eye: Vec3;
  angles: QAngle;
  alive: boolean;
}

export interface ViewFrame {
  now: number;
  frametime: number;
  /** The local player is alive. */
  alive: boolean;
  /** The local player is a spectator (no team / spectator team). */
  spectator: boolean;
  /** First-person inputs (alive). */
  first: FirstPersonInput;
  /** Our current view angles (mouse look; chase and roaming use them). */
  viewAngles: QAngle;
  /** Roaming observer position (predicted). */
  roamOrigin: Vec3;
  /** Look up a player by id. */
  player(id: number): ViewTarget | null;
  /** Someone to watch while dead / spectating (a living teammate, then anyone). */
  pickTarget(after: number): number;
  fov: number;
  thirdPerson: boolean;
  trace: WallTrace;
}

/** Sequences the camera for TF2: alive → death cam → freeze cam → chase until respawn; spectators chase / in-eye / roam. */
export class ViewController {
  mode: ViewMode = 'firstperson';
  /** The player watched in chase / in-eye / freeze cam (−1 none). */
  target = -1;
  readonly stairs = new StairSmoother();
  private deathAt = 0;
  private killer = -1;
  private readonly corpse = { x: 0, y: 0, z: 0 };
  private readonly deathAngles = { x: 0, y: 0, z: 0 };
  private chaseDistance = CHASE_CAM_DISTANCE_MIN;
  private freezeAt = 0;
  private readonly freezeStart = { x: 0, y: 0, z: 0 };
  private freezeDistance = 0;
  private freezeZ = 0;
  private wasAlive = true;
  /** Spectator's chosen mode (cycled by the observer buttons). */
  specMode: 'chase' | 'ineye' | 'roaming' = 'roaming';
  readonly out: ViewResult = {
    origin: { x: 0, y: 0, z: 0 },
    angles: { x: 0, y: 0, z: 0 },
    fov: 90,
    drawLocalBody: false,
    drawViewModel: true,
  };

  constructor(private readonly random: () => number = Math.random) {}

  /** The local player died at `now`, killed by `killer` (−1 / own id: nobody to look at). */
  onLocalDeath(now: number, killer: number, corpse: Vec3, angles: QAngle): void {
    this.deathAt = now;
    this.killer = killer;
    this.corpse.x = corpse.x;
    this.corpse.y = corpse.y;
    this.corpse.z = corpse.z;
    this.deathAngles.x = angles.x;
    this.deathAngles.y = angles.y;
    this.chaseDistance = CHASE_CAM_DISTANCE_MIN;
    this.mode = 'deathcam';
    this.wasAlive = false;
  }

  /** Spectator controls: attack = next target, attack2 = previous, jump = cycle mode (SDK spec_next / spec_prev / spec_mode). */
  cycleMode(): void {
    this.specMode = this.specMode === 'roaming' ? 'chase' : this.specMode === 'chase' ? 'ineye' : 'roaming';
  }

  nextTarget(f: ViewFrame): void {
    this.target = f.pickTarget(this.target);
  }

  update(f: ViewFrame): ViewResult {
    const o = this.out;
    o.fov = f.fov;
    if (f.alive) {
      if (!this.wasAlive) this.stairs.reset();
      this.wasAlive = true;
      this.mode = f.thirdPerson ? 'thirdperson' : 'firstperson';
      calcFirstPerson(f.first, this.stairs, o);
      if (this.mode === 'thirdperson') {
        const eye = { ...o.origin };
        calcThirdPerson(eye, o.angles, f.trace, o.origin);
      }
      o.drawLocalBody = this.mode === 'thirdperson';
      o.drawViewModel = this.mode === 'firstperson';
      return o;
    }
    o.drawViewModel = false;
    o.drawLocalBody = true;
    if (this.wasAlive) {
      // Died without an event (a team change, a missed packet): straight to the death cam with no killer.
      this.onLocalDeath(f.now, -1, f.first.origin, f.viewAngles);
    }
    if (f.spectator && this.mode !== 'deathcam' && this.mode !== 'freezecam') {
      return this.spectate(f);
    }
    const elapsed = f.now - this.deathAt;
    const killer = this.killer > 0 ? f.player(this.killer) : null;
    if (this.mode === 'deathcam') {
      this.chaseDistance += f.frametime * CHASE_CAM_GROW;
      this.chaseDistance = calcDeathCam(
        { corpse: this.corpse, deathAngles: this.deathAngles, killerEye: killer?.eye ?? null, elapsed, distance: this.chaseDistance },
        f.trace,
        o,
      );
      if (elapsed >= TF_DEATH_ANIMATION_TIME) {
        if (killer) {
          this.mode = 'freezecam';
          this.freezeAt = f.now;
          this.target = killer.id;
          this.freezeStart.x = o.origin.x;
          this.freezeStart.y = o.origin.y;
          this.freezeStart.z = o.origin.z;
          this.freezeDistance = SPEC_FREEZE_DISTANCE_MIN + (SPEC_FREEZE_DISTANCE_MAX - SPEC_FREEZE_DISTANCE_MIN) * this.random();
          this.freezeZ = FREEZE_Z_OFFSET_MIN + (FREEZE_Z_OFFSET_MAX - FREEZE_Z_OFFSET_MIN) * this.random();
        } else {
          this.mode = 'chase';
          this.target = f.pickTarget(-1);
        }
      }
      return o;
    }
    if (this.mode === 'freezecam') {
      const t = f.player(this.target);
      const fe = f.now - this.freezeAt;
      if (t) {
        calcFreezeCam(
          { start: this.freezeStart, targetEye: t.eye, targetAlive: t.alive, elapsed: fe, distance: this.freezeDistance, zOffset: this.freezeZ },
          f.trace,
          o,
        );
      }
      if (!t || fe >= SPEC_FREEZE_TIME) {
        this.mode = 'chase';
        this.target = f.pickTarget(-1);
      }
      return o;
    }
    return this.chase(f);
  }

  private spectate(f: ViewFrame): ViewResult {
    if (this.specMode === 'roaming') {
      this.mode = 'roaming';
      const o = this.out;
      o.origin.x = f.roamOrigin.x;
      o.origin.y = f.roamOrigin.y;
      o.origin.z = f.roamOrigin.z;
      o.angles.x = f.viewAngles.x;
      o.angles.y = f.viewAngles.y;
      o.angles.z = 0;
      return o;
    }
    if (this.target < 0 || !f.player(this.target)) this.target = f.pickTarget(-1);
    if (this.specMode === 'ineye') {
      const t = f.player(this.target);
      if (t) {
        this.mode = 'ineye';
        const o = this.out;
        o.origin.x = t.eye.x;
        o.origin.y = t.eye.y;
        o.origin.z = t.eye.z;
        o.angles.x = t.angles.x;
        o.angles.y = t.angles.y;
        o.angles.z = 0;
        return o;
      }
    }
    return this.chase(f);
  }

  private chase(f: ViewFrame): ViewResult {
    const o = this.out;
    this.mode = 'chase';
    let t = f.player(this.target);
    if (!t) {
      this.target = f.pickTarget(-1);
      t = f.player(this.target);
    }
    if (!t) {
      // Nobody to watch: stay over the corpse.
      this.chaseDistance += f.frametime * CHASE_CAM_GROW;
      this.chaseDistance = calcChaseCam({ x: this.corpse.x, y: this.corpse.y, z: this.corpse.z + DEAD_VIEWHEIGHT }, f.viewAngles, this.chaseDistance, f.trace, o.origin);
    } else {
      this.chaseDistance += f.frametime * CHASE_CAM_GROW;
      this.chaseDistance = calcChaseCam(t.eye, f.viewAngles, this.chaseDistance, f.trace, o.origin);
    }
    o.angles.x = f.viewAngles.x;
    o.angles.y = f.viewAngles.y;
    o.angles.z = 0;
    return o;
  }
}
