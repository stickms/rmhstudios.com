/**
 * Brush movers (MOVETYPE_PUSH): CBaseToggle's LinearMove / AngularMove with
 * the engine's PhysicsPusher timing (a local clock, `ltime`, that only
 * advances when the push succeeds, and MoveDone when it reaches the move's
 * done time), and the classes built on it:
 *
 * - func_door / func_door_rotating (server/doors.cpp, CBaseDoor / CRotDoor)
 * - func_movelinear (server/func_movelinear.cpp)
 * - func_rotating (server/bmodels.cpp, CFuncRotating)
 * - func_tracktrain + path_track (server/trains.cpp CFuncTrackTrain,
 *   server/pathtrack.cpp CPathTrack): the payload cart.
 *
 * Every move goes through physics.ts pushMove: riders are carried, anything
 * in the way is shoved by the move delta, and a push that would leave
 * something stuck (crushed into a wall) is undone and reported to the mover
 * (Blocked), which reverses or waits like the SDK's doors do.
 */

import { angleVectors, copy, normalize, set, vec3, vectorAngles, type Vec3 } from '../../core/vec';
import {
  COLLISION_GROUP_INTERACTIVE,
  COLLISION_GROUP_PASSABLE_DOOR,
  DAMAGE_EVENTS_ONLY,
  DAMAGE_NO,
  type Entity,
  FSOLID_NOT_SOLID,
  MOVETYPE_PUSH,
  SOLID_BSP,
} from '../entity';
import { registerEntityClass } from '../entity-registry';
import { createDamageInfo, DMG_CRUSH } from '../damage';
import { pushMove } from '../physics';
import { MapEntity, atof, atoi, stopSound, type ThinkContext } from './base';
import { FuncAreaPortal } from './brushes';
import { objectives } from './objectives';
import { FL_ONGROUND } from '../../core/constants';
import type { Player } from '../player';

// ─── Toggle states (TOGGLE_STATE) and door spawnflags (doors.h) ────────────
export const TS_AT_TOP = 0;
export const TS_AT_BOTTOM = 1;
export const TS_GOING_UP = 2;
export const TS_GOING_DOWN = 3;

export const SF_DOOR_START_OPEN_OBSOLETE = 1;
export const SF_DOOR_ROTATE_BACKWARDS = 2;
export const SF_DOOR_NONSOLID_TO_PLAYER = 4;
export const SF_DOOR_PASSABLE = 8;
export const SF_DOOR_ONEWAY = 16;
export const SF_DOOR_NO_AUTO_RETURN = 32;
export const SF_DOOR_ROTATE_ROLL = 64;
export const SF_DOOR_ROTATE_PITCH = 128;
export const SF_DOOR_PUSE = 256;
export const SF_DOOR_PTOUCH = 1024;
export const SF_DOOR_LOCKED = 2048;
export const SF_DOOR_SILENT = 4096;

const FUNC_DOOR_SPAWN_OPEN = 1;

const MOVE_TOGGLE_NONE = 0;
const MOVE_TOGGLE_LINEAR = 1;
const MOVE_TOGGLE_ANGULAR = 2;

const scratchOrigin = vec3();
const scratchAngles = vec3();
const crushInfo = createDamageInfo();

/** Parses "x y z" keys. */
function parseVec(value: string | undefined, out: Vec3): boolean {
  if (value === undefined) return false;
  const p = value.trim().split(/\s+/).map(Number);
  out.x = p[0] || 0;
  out.y = p[1] || 0;
  out.z = p[2] || 0;
  return true;
}

/** UTIL_AngleMod (FixupAngles uses it per component). */
function angleMod(a: number): number {
  const r = a % 360;
  return r < 0 ? r + 360 : r;
}

/** UTIL_AngleDistance: next − cur folded into [−180, 180]. */
function angleDistance(next: number, cur: number): number {
  let d = next - cur;
  while (d < -180) d += 360;
  while (d > 180) d -= 360;
  return d;
}

/** UTIL_Approach. */
function approach(target: number, value: number, speed: number): number {
  const delta = target - value;
  if (delta > speed) return value + speed;
  if (delta < -speed) return value - speed;
  return target;
}

/** UTIL_ApproachAngle. */
function approachAngle(target: number, value: number, speed: number): number {
  const t = angleMod(target);
  const v = angleMod(value);
  let delta = t - v;
  if (speed < 0) speed = -speed;
  if (delta < -180) delta += 360;
  else if (delta > 180) delta -= 360;
  if (delta > speed) return v + speed;
  if (delta < -speed) return v - speed;
  return t;
}

/** Applies CTakeDamageInfo(this, this, damage, DMG_CRUSH) to `other`. */
function crush(mover: Entity, other: Entity, damage: number): void {
  const info = crushInfo;
  info.attacker = mover.id;
  info.inflictor = mover.id;
  info.damage = damage;
  info.baseDamage = damage;
  info.damageType = DMG_CRUSH;
  info.customKill = 0;
  info.critType = 0;
  info.weaponId = 0;
  info.killIcon = 'crush';
  copy(info.position, other.origin);
  set(info.force, 0, 0, 0);
  mover.world.applyDamage(other, info);
}

// ─── CBaseToggle + PhysicsPusher ───────────────────────────────────────────

export class ToggleMover extends MapEntity {
  speed = 0;
  wait = 0;
  lip = 0;
  moveDistance = 0;
  blockDamage = 0;
  toggleState = TS_AT_BOTTOM;
  readonly moveDir = vec3();
  readonly position1 = vec3();
  readonly position2 = vec3();
  readonly angle1 = vec3();
  readonly angle2 = vec3();
  /** m_vecMoveAng: the rotation axis (rotating doors, func_rotating). */
  readonly moveAng = vec3();
  readonly finalDest = vec3();
  readonly finalAngle = vec3();
  /** Linear and angular velocity (units/s, degrees/s). */
  readonly linearVelocity = vec3();
  readonly angularVelocity = vec3();
  /** The pusher's local time (advances only when it is not blocked). */
  ltime = 0;
  /** ltime at which MoveDone runs, −1 when none. */
  moveDoneAt = -1;
  moveDoneFn: (() => void) | null = null;
  private movementType = MOVE_TOGGLE_NONE;
  /** FL_UNBLOCKABLE_BY_PLAYER. */
  unblockableByPlayer = false;
  protected readonly physicsCtx: ThinkContext;

  constructor(classname: string) {
    super(classname);
    this.physicsCtx = this.context(() => this.physicsPusher());
  }

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'speed':
        this.speed = atof(value);
        return true;
      case 'wait':
        this.wait = atof(value);
        return true;
      case 'lip':
        this.lip = atof(value);
        return true;
      case 'distance':
        this.moveDistance = atof(value);
        return true;
      case 'dmg':
        this.blockDamage = atof(value);
        return true;
      case 'movedir':
        parseVec(value, this.moveDir);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  override spawn(): void {
    super.spawn();
    this.moveType = MOVETYPE_PUSH;
    this.solid = SOLID_BSP;
  }

  /** Makes the brush model match our transform now (after a direct set like UTIL_SetOrigin). */
  syncModel(): void {
    this.world.syncBrushModel(this);
  }

  /** SDK: SetMoveDoneTime(delay) — relative to the local clock. */
  setMoveDoneTime(delay: number): void {
    this.moveDoneAt = delay < 0 ? -1 : this.ltime + delay;
    this.wake();
  }

  /** Keeps the per-tick pusher running. */
  protected wake(): void {
    if (this.physicsCtx.at < 0) this.setContextThink(this.physicsCtx, this.world.curtime);
  }

  protected isMoving(): boolean {
    const v = this.linearVelocity;
    const a = this.angularVelocity;
    return v.x !== 0 || v.y !== 0 || v.z !== 0 || a.x !== 0 || a.y !== 0 || a.z !== 0;
  }

  /** SDK: CBaseToggle::LinearMove. */
  linearMove(dest: Vec3, speed: number): void {
    copy(this.finalDest, dest);
    this.movementType = MOVE_TOGGLE_LINEAR;
    const o = this.origin;
    if (dest.x === o.x && dest.y === o.y && dest.z === o.z) {
      this.moveDone();
      return;
    }
    const dx = dest.x - o.x;
    const dy = dest.y - o.y;
    const dz = dest.z - o.z;
    const travel = Math.sqrt(dx * dx + dy * dy + dz * dz) / speed;
    this.setMoveDoneTime(travel);
    set(this.linearVelocity, dx / travel, dy / travel, dz / travel);
  }

  /** SDK: CBaseToggle::AngularMove. */
  angularMove(destAngles: Vec3, speed: number): void {
    copy(this.finalAngle, destAngles);
    this.movementType = MOVE_TOGGLE_ANGULAR;
    const a = this.angles;
    if (destAngles.x === a.x && destAngles.y === a.y && destAngles.z === a.z) {
      this.moveDone();
      return;
    }
    const dx = destAngles.x - a.x;
    const dy = destAngles.y - a.y;
    const dz = destAngles.z - a.z;
    let travel = Math.sqrt(dx * dx + dy * dy + dz * dz) / speed;
    if (travel < 0.01) travel = 0.01;
    this.setMoveDoneTime(travel);
    set(this.angularVelocity, dx / travel, dy / travel, dz / travel);
  }

  /** SDK: CBaseToggle::MoveDone (Linear/AngularMoveDone, then the move-done function). */
  moveDone(): void {
    if (this.movementType === MOVE_TOGGLE_LINEAR) {
      copy(this.origin, this.finalDest);
      set(this.linearVelocity, 0, 0, 0);
      this.moveDoneAt = -1;
      this.syncModel();
    } else if (this.movementType === MOVE_TOGGLE_ANGULAR) {
      copy(this.angles, this.finalAngle);
      set(this.angularVelocity, 0, 0, 0);
      this.moveDoneAt = -1;
      this.syncModel();
    }
    this.movementType = MOVE_TOGGLE_NONE;
    const fn = this.moveDoneFn;
    if (fn) fn.call(this);
  }

  /**
   * SDK: CBaseEntity::PhysicsPusher. Moves by velocity × movetime (clipped to
   * the move-done time), through pushMove; the local clock advances only if
   * the push succeeded. Runs every tick while moving or waiting on MoveDone.
   */
  protected physicsPusher(): void {
    const dt = this.world.frametime;
    let movetime = dt;
    if (this.moveDoneAt >= 0) {
      const left = this.moveDoneAt - this.ltime;
      if (left < dt) movetime = left > 0 ? left : 0;
    }
    if (movetime > 0) {
      if (this.isMoving()) {
        const v = this.linearVelocity;
        const a = this.angularVelocity;
        set(
          scratchOrigin,
          this.origin.x + v.x * movetime,
          this.origin.y + v.y * movetime,
          this.origin.z + v.z * movetime,
        );
        set(
          scratchAngles,
          this.angles.x + a.x * movetime,
          this.angles.y + a.y * movetime,
          this.angles.z + a.z * movetime,
        );
        if (pushMove(this.world, this, scratchOrigin, scratchAngles, this.unblockableByPlayer))
          this.ltime += movetime;
      } else this.ltime += movetime;
    }
    if (this.moveDoneAt >= 0 && this.ltime >= this.moveDoneAt - 1e-9) {
      this.moveDoneAt = -1;
      this.moveDone();
    }
    this.afterPhysics();
    if (this.removed) return;
    if (this.isMoving() || this.moveDoneAt >= 0 || this.needsPhysics()) {
      this.setContextThink(this.physicsCtx, this.world.curtime);
    }
  }

  /** Hook for movers with their own per-tick logic (the train). */
  protected afterPhysics(): void {}

  /** Keep ticking even when idle? */
  protected needsPhysics(): boolean {
    return false;
  }

  /** The world calls this when pushMove could not move something (CBaseEntity::Blocked). */
  blocked(_other: Entity): void {}

  /** Model OBB size − 2 along the move direction (doors / func_movelinear). */
  protected travelAlong(dir: Vec3): number {
    const sx = this.maxs.x - this.mins.x - 2;
    const sy = this.maxs.y - this.mins.y - 2;
    const sz = this.maxs.z - this.mins.z - 2;
    return Math.abs(dir.x * sx) + Math.abs(dir.y * sy) + Math.abs(dir.z * sz);
  }
}

// ─── func_door / func_door_rotating ────────────────────────────────────────

export class FuncDoor extends ToggleMover {
  noiseMoving = '';
  noiseArrived = '';
  noiseMovingClosed = '';
  noiseArrivedClosed = '';
  locked = false;
  forceClosed = false;
  spawnPosition = 0;
  doorGroup = true;
  activator: Entity | null = null;
  private movingSound = '';
  private readonly closePortalsCtx: ThinkContext;
  hasMoveDir = false;

  constructor(classname: string) {
    super(classname);
    this.closePortalsCtx = this.context(() => this.updateAreaPortals(false));
  }

  isRotatingDoor(): boolean {
    return false;
  }

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'movedir':
        this.hasMoveDir = true;
        return super.keyValue(key, value);
      case 'noise1':
        this.noiseMoving = value;
        return true;
      case 'noise2':
        this.noiseArrived = value;
        return true;
      case 'startclosesound':
        this.noiseMovingClosed = value;
        return true;
      case 'closesound':
        this.noiseArrivedClosed = value;
        return true;
      case 'spawnpos':
        this.spawnPosition = atoi(value);
        return true;
      case 'forceclosed':
        this.forceClosed = atoi(value) !== 0;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CBaseDoor::Spawn. */
  override spawn(): void {
    super.spawn();
    if (!this.isRotatingDoor()) {
      // "movedir" is the direction; old maps put it in "angles" (SetMovedir), which must not rotate the brush.
      if (!this.hasMoveDir) copy(this.moveDir, this.angles);
      set(this.angles, 0, 0, 0);
    }
    const md = this.moveDir;
    const dir = vec3();
    angleVectors(md, dir);
    copy(this.moveDir, dir);
    copy(this.position1, this.origin);
    const travel = this.travelAlong(this.moveDir) - this.lip;
    set(
      this.position2,
      this.position1.x + this.moveDir.x * travel,
      this.position1.y + this.moveDir.y * travel,
      this.position1.z + this.moveDir.z * travel,
    );
    if (!this.isRotatingDoor()) {
      if (
        this.spawnPosition === FUNC_DOOR_SPAWN_OPEN ||
        this.hasSpawnFlags(SF_DOOR_START_OPEN_OBSOLETE)
      ) {
        copy(this.origin, this.position2);
        this.toggleState = TS_AT_TOP;
      } else this.toggleState = TS_AT_BOTTOM;
    }
    if (this.hasSpawnFlags(SF_DOOR_LOCKED)) this.locked = true;
    if (this.speed === 0) this.speed = 100;
    if (this.hasSpawnFlags(SF_DOOR_PASSABLE)) {
      this.solidFlags |= FSOLID_NOT_SOLID;
      this.world.setBrushSolid(this, false);
    }
    if (this.hasSpawnFlags(SF_DOOR_NONSOLID_TO_PLAYER))
      this.collisionGroup = COLLISION_GROUP_PASSABLE_DOOR;
    if (this.kvBool('ignoredebris') && !this.hasSpawnFlags(SF_DOOR_NONSOLID_TO_PLAYER))
      this.collisionGroup = COLLISION_GROUP_INTERACTIVE;
    if (!this.noiseMoving)
      this.noiseMoving = this.isRotatingDoor()
        ? 'RotDoorSound.DefaultMove'
        : 'DoorSound.DefaultMove';
    if (!this.noiseArrived)
      this.noiseArrived = this.isRotatingDoor()
        ? 'RotDoorSound.DefaultArrive'
        : 'DoorSound.DefaultArrive';
    this.syncModel();
  }

  /** SDK: CBaseDoor::Activate — door group alignment and initial area portal state. */
  override activate(): void {
    super.activate();
    this.doorGroup = true;
    for (const d of this.doorMovementGroup()) {
      const sameDir =
        d.moveDir.x === this.moveDir.x &&
        d.moveDir.y === this.moveDir.y &&
        d.moveDir.z === this.moveDir.z;
      if (!sameDir) continue;
      const misaligned = d.isRotatingDoor()
        ? d.angles.x !== this.angles.x ||
          d.angles.y !== this.angles.y ||
          d.angles.z !== this.angles.z
        : d.origin.x !== this.origin.x ||
          d.origin.y !== this.origin.y ||
          d.origin.z !== this.origin.z;
      if (misaligned) this.doorGroup = false;
    }
    if (this.toggleState === TS_AT_TOP) this.updateAreaPortals(true);
    else if (this.toggleState === TS_AT_BOTTOM) this.updateAreaPortals(false);
  }

  /** SDK: CBaseDoor::GetDoorMovementGroup — other doors with our name. */
  private doorMovementGroup(): FuncDoor[] {
    const out: FuncDoor[] = [];
    if (this.targetname === '') return out;
    for (const e of this.world.findAllByName(this.targetname))
      if (e !== this && e instanceof FuncDoor) out.push(e);
    return out;
  }

  /** SDK: CBaseDoor::UpdateAreaPortals. */
  updateAreaPortals(isOpen: boolean): void {
    this.setContextThink(this.closePortalsCtx, -1);
    let open = isOpen;
    if (this.isRotatingDoor() && this.hasSpawnFlags(SF_DOOR_START_OPEN_OBSOLETE)) open = !open;
    if (this.targetname === '') return;
    const name = this.targetnameLower;
    this.world.forEachEntity((e) => {
      if (e instanceof FuncAreaPortal && e.targetLower === name) e.setOpen(open);
    });
  }

  private startMovingSound(): void {
    if (this.hasSpawnFlags(SF_DOOR_SILENT)) return;
    const closing = this.toggleState === TS_GOING_DOWN || this.toggleState === TS_AT_BOTTOM;
    this.movingSound =
      !this.noiseMovingClosed || closing ? this.noiseMoving : this.noiseMovingClosed;
    if (this.movingSound) this.world.emitSound(this.movingSound, { entity: this.id, channel: 6 });
  }

  private stopMovingSound(): void {
    if (this.movingSound) {
      stopSound(this.world, this.id, this.movingSound, 6);
      this.movingSound = '';
    }
  }

  /** SDK: CBaseDoor::DoorGoUp. */
  doorGoUp(): void {
    this.updateAreaPortals(true);
    if (
      !this.hasSpawnFlags(SF_DOOR_SILENT) &&
      this.toggleState !== TS_GOING_UP &&
      this.toggleState !== TS_GOING_DOWN
    ) {
      this.startMovingSound();
    }
    this.toggleState = TS_GOING_UP;
    this.moveDoneFn = this.doorHitTop;
    if (this.isRotatingDoor()) {
      let sign = 1;
      const act = this.activator;
      if (act && !act.removed && !this.hasSpawnFlags(SF_DOOR_ONEWAY) && this.moveAng.y) {
        // Y axis rotation: move away from the activator.
        const nearest = vec3();
        this.nearestPoint(act.origin, nearest);
        const ax = nearest.x - act.origin.x;
        const ay = nearest.y - act.origin.y;
        const ox = this.origin.x - act.origin.x;
        const oy = this.origin.y - act.origin.y;
        const crossZ = ox * ay - oy * ax;
        if (crossZ > 0) sign = -1;
      }
      const dest = vec3(this.angle2.x * sign, this.angle2.y * sign, this.angle2.z * sign);
      this.angularMove(dest, this.speed);
    } else this.linearMove(this.position2, this.speed);
    this.fireOutput('OnOpen', this);
  }

  /** SDK: CBaseDoor::DoorHitTop. */
  private readonly doorHitTop = (): void => {
    if (!this.hasSpawnFlags(SF_DOOR_SILENT)) {
      this.stopMovingSound();
      if (this.noiseArrived)
        this.world.emitSound(this.noiseArrived, { entity: this.id, channel: 6 });
    }
    this.toggleState = TS_AT_TOP;
    if (!this.hasSpawnFlags(SF_DOOR_NO_AUTO_RETURN)) {
      // Return after `wait` seconds; −1 never returns.
      if (this.wait !== -1) {
        this.moveDoneFn = this.doorGoDownFn;
        this.setMoveDoneTime(this.wait);
      } else this.moveDoneFn = null;
    }
    if (this.hasSpawnFlags(SF_DOOR_START_OPEN_OBSOLETE)) this.fireOutput('OnFullyClosed', this);
    else this.fireOutput('OnFullyOpen', this);
  };

  private readonly doorGoDownFn = (): void => this.doorGoDown();

  /** SDK: CBaseDoor::DoorGoDown. */
  doorGoDown(): void {
    if (
      !this.hasSpawnFlags(SF_DOOR_SILENT) &&
      this.toggleState !== TS_GOING_UP &&
      this.toggleState !== TS_GOING_DOWN
    ) {
      this.startMovingSound();
    }
    this.toggleState = TS_GOING_DOWN;
    this.moveDoneFn = this.doorHitBottom;
    if (this.isRotatingDoor()) this.angularMove(this.angle1, this.speed);
    else this.linearMove(this.position1, this.speed);
    this.fireOutput('OnClose', this);
  }

  /** SDK: CBaseDoor::DoorHitBottom. */
  private readonly doorHitBottom = (): void => {
    if (!this.hasSpawnFlags(SF_DOOR_SILENT)) {
      this.stopMovingSound();
      const s = this.noiseArrivedClosed || this.noiseArrived;
      if (s) this.world.emitSound(s, { entity: this.id, channel: 6 });
    }
    this.toggleState = TS_AT_BOTTOM;
    this.moveDoneFn = null;
    if (this.hasSpawnFlags(SF_DOOR_START_OPEN_OBSOLETE))
      this.fireOutput('OnFullyOpen', this.activator);
    else this.fireOutput('OnFullyClosed', this.activator);
    this.setContextThink(this.closePortalsCtx, this.world.curtime + 0.5);
  };

  /** SDK: CBaseDoor::Blocked. */
  override blocked(other: Entity): void {
    if (this.blockDamage) crush(this, other, this.blockDamage);
    else if (!other.isPlayer()) return; // TF: m_bIgnoreNonPlayerEntsOnBlock
    if (this.forceClosed) return;
    if (this.wait >= 0) {
      if (this.toggleState === TS_GOING_DOWN) {
        this.fireOutput('OnBlockedClosing', other);
        this.doorGoUp();
      } else {
        this.fireOutput('OnBlockedOpening', other);
        this.doorGoDown();
      }
    }
    for (const d of this.doorMovementGroup()) {
      if (d.wait < 0) continue;
      if (this.doorGroup && !d.isRotatingDoor()) {
        copy(d.origin, this.origin);
        set(d.linearVelocity, 0, 0, 0);
        d.syncModel();
      }
      if (d.toggleState === TS_GOING_DOWN) d.doorGoUp();
      else d.doorGoDown();
    }
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'open':
        if (this.toggleState !== TS_AT_TOP && this.toggleState !== TS_GOING_UP) {
          if (this.locked) return true;
          this.activator = activator;
          this.doorGoUp();
        }
        return true;
      case 'close':
        if (this.toggleState !== TS_AT_BOTTOM) {
          this.activator = activator;
          this.doorGoDown();
        }
        return true;
      case 'toggle':
        if (this.locked) return true;
        this.activator = activator;
        if (this.toggleState === TS_AT_BOTTOM) this.doorGoUp();
        else if (this.toggleState === TS_AT_TOP) this.doorGoDown();
        return true;
      case 'lock':
        this.locked = true;
        return true;
      case 'unlock':
        this.locked = false;
        return true;
      case 'setspeed':
        this.speed = atof(value);
        return true;
      case 'settogglestate':
        this.setToggleState(atoi(value));
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  /** SDK: CBaseDoor::SetToggleState. */
  setToggleState(state: number): void {
    copy(this.origin, state === TS_AT_TOP ? this.position2 : this.position1);
    this.syncModel();
  }
}

/** func_door_rotating (CRotDoor): rotates `distance` degrees about its axis. */
export class FuncDoorRotating extends FuncDoor {
  override isRotatingDoor(): boolean {
    return true;
  }

  /** SDK: CRotDoor::Spawn (+ CBaseToggle::AxisDir). */
  override spawn(): void {
    super.spawn();
    if (this.hasSpawnFlags(SF_DOOR_ROTATE_ROLL)) set(this.moveAng, 0, 0, 1);
    else if (this.hasSpawnFlags(SF_DOOR_ROTATE_PITCH)) set(this.moveAng, 1, 0, 0);
    else set(this.moveAng, 0, 1, 0);
    if (this.hasSpawnFlags(SF_DOOR_ROTATE_BACKWARDS))
      set(this.moveAng, -this.moveAng.x, -this.moveAng.y, -this.moveAng.z);
    copy(this.angle1, this.angles);
    set(
      this.angle2,
      this.angles.x + this.moveAng.x * this.moveDistance,
      this.angles.y + this.moveAng.y * this.moveDistance,
      this.angles.z + this.moveAng.z * this.moveDistance,
    );
    if (this.hasSpawnFlags(SF_DOOR_START_OPEN_OBSOLETE)) {
      const t = vec3();
      copy(t, this.angle2);
      copy(this.angle2, this.angle1);
      copy(this.angle1, t);
      set(this.moveAng, -this.moveAng.x, -this.moveAng.y, -this.moveAng.z);
      copy(this.angles, this.angle1);
      this.toggleState = TS_AT_BOTTOM;
    } else if (this.spawnPosition === FUNC_DOOR_SPAWN_OPEN) {
      copy(this.angles, this.angle2);
      this.toggleState = TS_AT_TOP;
    } else this.toggleState = TS_AT_BOTTOM;
    this.syncModel();
  }

  override setToggleState(state: number): void {
    copy(this.angles, state === TS_AT_TOP ? this.angle2 : this.angle1);
    this.syncModel();
  }
}

// ─── func_movelinear ───────────────────────────────────────────────────────

/** SF_MOVELINEAR_NOTSOLID. */
export const SF_MOVELINEAR_NOTSOLID = 8;

export class FuncMoveLinear extends ToggleMover {
  startPosition = 0;
  soundStart = '';
  soundStop = '';
  private currentSound = '';

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'startposition':
        this.startPosition = atof(value);
        return true;
      case 'movedistance':
        this.moveDistance = atof(value);
        return true;
      case 'blockdamage':
        this.blockDamage = atof(value);
        return true;
      case 'startsound':
        this.soundStart = value;
        return true;
      case 'stopsound':
        this.soundStop = value;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CFuncMoveLinear::Spawn. */
  override spawn(): void {
    super.spawn();
    const dir = vec3();
    angleVectors(this.moveDir, dir);
    copy(this.moveDir, dir);
    set(this.angles, 0, 0, 0);
    if (this.speed <= 0) this.speed = 100;
    if (this.moveDistance <= 0) this.moveDistance = this.travelAlong(this.moveDir) - this.lip;
    const d = this.moveDistance;
    set(
      this.position1,
      this.origin.x - this.moveDir.x * d * this.startPosition,
      this.origin.y - this.moveDir.y * d * this.startPosition,
      this.origin.z - this.moveDir.z * d * this.startPosition,
    );
    set(
      this.position2,
      this.position1.x + this.moveDir.x * d,
      this.position1.y + this.moveDir.y * d,
      this.position1.z + this.moveDir.z * d,
    );
    copy(this.finalDest, this.origin);
    if (this.hasSpawnFlags(SF_MOVELINEAR_NOTSOLID)) {
      this.solidFlags |= FSOLID_NOT_SOLID;
      this.world.setBrushSolid(this, false);
    }
    this.syncModel();
  }

  /** SDK: CFuncMoveLinear::MoveTo. */
  moveTo(pos: Vec3, speed: number): void {
    if (speed === 0) return;
    if (this.soundStart) {
      if (this.currentSound === this.soundStart) stopSound(this.world, this.id, this.soundStop, 4);
      else {
        this.currentSound = this.soundStart;
        this.world.emitSound(this.soundStart, { entity: this.id, channel: 4 });
      }
    }
    this.moveDoneFn = this.onArrive;
    this.linearMove(pos, speed);
  }

  /** SDK: CFuncMoveLinear::MoveDone. */
  private readonly onArrive = (): void => {
    if (this.soundStart && this.currentSound === this.soundStart)
      stopSound(this.world, this.id, this.soundStart, 4);
    if (this.soundStop && this.currentSound !== this.soundStop) {
      this.currentSound = this.soundStop;
      this.world.emitSound(this.soundStop, { entity: this.id, channel: 4 });
    }
    const o = this.origin;
    if (o.x === this.position2.x && o.y === this.position2.y && o.z === this.position2.z)
      this.fireOutput('OnFullyOpen', this);
    else if (o.x === this.position1.x && o.y === this.position1.y && o.z === this.position1.z)
      this.fireOutput('OnFullyClosed', this);
  };

  /** SDK: CFuncMoveLinear::SetPosition. */
  setPosition(fraction: number): void {
    const t = vec3(
      this.position1.x + fraction * (this.position2.x - this.position1.x),
      this.position1.y + fraction * (this.position2.y - this.position1.y),
      this.position1.z + fraction * (this.position2.z - this.position1.z),
    );
    const dx = t.x - this.origin.x;
    const dy = t.y - this.origin.y;
    const dz = t.z - this.origin.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 0.001) this.moveTo(t, this.speed);
  }

  override blocked(other: Entity): void {
    if (this.blockDamage && other.takeDamage !== DAMAGE_EVENTS_ONLY)
      crush(this, other, this.blockDamage);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'open': {
        const o = this.origin;
        if (o.x !== this.position2.x || o.y !== this.position2.y || o.z !== this.position2.z)
          this.moveTo(this.position2, this.speed);
        return true;
      }
      case 'close': {
        const o = this.origin;
        if (o.x !== this.position1.x || o.y !== this.position1.y || o.z !== this.position1.z)
          this.moveTo(this.position1, this.speed);
        return true;
      }
      case 'setposition':
        this.setPosition(atof(value));
        return true;
      case 'setspeed': {
        this.speed = atof(value);
        const dx = this.finalDest.x - this.origin.x;
        const dy = this.finalDest.y - this.origin.y;
        const dz = this.finalDest.z - this.origin.z;
        if (dx * dx + dy * dy + dz * dz > 1e-12) this.linearMove(this.finalDest, this.speed);
        return true;
      }
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── func_rotating ─────────────────────────────────────────────────────────

const SF_BRUSH_ROTATE_START_ON = 1;
const SF_BRUSH_ROTATE_BACKWARDS = 2;
const SF_BRUSH_ROTATE_Z_AXIS = 4;
const SF_BRUSH_ROTATE_X_AXIS = 8;
/** SF_ROTATING_NOT_SOLID. */
const SF_ROTATING_NOT_SOLID = 64;

/** func_rotating (CFuncRotating): spins about an axis at `maxspeed` degrees/s; SetSpeed takes a fraction. */
export class FuncRotating extends ToggleMover {
  maxSpeed = 0;
  fanFriction = 1;
  /** Current spin speed (degrees/s, signed by direction). */
  spinSpeed = 0;
  private reversed = false;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'maxspeed':
        this.maxSpeed = Math.abs(atof(value));
        return true;
      case 'fanfriction':
        this.fanFriction = atof(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  override spawn(): void {
    super.spawn();
    if (this.fanFriction === 0) this.fanFriction = 1;
    if (this.hasSpawnFlags(SF_BRUSH_ROTATE_Z_AXIS)) set(this.moveAng, 0, 0, 1);
    else if (this.hasSpawnFlags(SF_BRUSH_ROTATE_X_AXIS)) set(this.moveAng, 1, 0, 0);
    else set(this.moveAng, 0, 1, 0);
    if (this.hasSpawnFlags(SF_BRUSH_ROTATE_BACKWARDS))
      set(this.moveAng, -this.moveAng.x, -this.moveAng.y, -this.moveAng.z);
    if (this.hasSpawnFlags(SF_ROTATING_NOT_SOLID)) {
      this.solidFlags |= FSOLID_NOT_SOLID;
      this.world.setBrushSolid(this, false);
    }
    this.syncModel();
    if (this.hasSpawnFlags(SF_BRUSH_ROTATE_START_ON)) this.setSpinSpeed(this.maxSpeed);
  }

  /** SDK: CFuncRotating::SetTargetSpeed (applied at once; the spin-up ramp is cosmetic). */
  setSpinSpeed(speed: number): void {
    this.spinSpeed = this.reversed ? -speed : speed;
    set(
      this.angularVelocity,
      this.moveAng.x * this.spinSpeed,
      this.moveAng.y * this.spinSpeed,
      this.moveAng.z * this.spinSpeed,
    );
    if (this.spinSpeed !== 0) this.wake();
  }

  protected override physicsPusher(): void {
    if (this.solidFlags & FSOLID_NOT_SOLID) {
      // Not solid: nothing to push, just turn.
      const a = this.angularVelocity;
      const dt = this.world.frametime;
      this.angles.x = angleMod(this.angles.x + a.x * dt);
      this.angles.y = angleMod(this.angles.y + a.y * dt);
      this.angles.z = angleMod(this.angles.z + a.z * dt);
      this.syncModel();
      if (this.isMoving()) this.setContextThink(this.physicsCtx, this.world.curtime);
      return;
    }
    super.physicsPusher();
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'start':
        this.setSpinSpeed(this.maxSpeed);
        return true;
      case 'stop':
        this.setSpinSpeed(0);
        return true;
      case 'toggle':
        this.setSpinSpeed(this.spinSpeed !== 0 ? 0 : this.maxSpeed);
        return true;
      case 'setspeed':
        this.setSpinSpeed(Math.max(0, Math.min(1, atof(value))) * this.maxSpeed);
        return true;
      case 'reverse':
        this.reversed = !this.reversed;
        this.setSpinSpeed(Math.abs(this.spinSpeed));
        return true;
      case 'startforward':
        this.reversed = false;
        this.setSpinSpeed(this.maxSpeed);
        return true;
      case 'startbackward':
        this.reversed = true;
        this.setSpinSpeed(this.maxSpeed);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── path_track ────────────────────────────────────────────────────────────

export const SF_PATH_DISABLED = 0x01;
export const SF_PATH_ALTREVERSE = 0x04;
export const SF_PATH_DISABLE_TRAIN = 0x08;
export const SF_PATH_TELEPORT = 0x10;
export const SF_PATH_UPHILL = 0x20;
export const SF_PATH_DOWNHILL = 0x40;
export const SF_PATH_ALTERNATE = 0x8000;

export const HILL_TYPE_NONE = 0;
export const HILL_TYPE_UPHILL = 1;
export const HILL_TYPE_DOWNHILL = 2;

/** TrackOrientationType_t. */
export const TRACK_ORIENTATION_FIXED = 0;
export const TRACK_ORIENTATION_FACE_PATH = 1;
export const TRACK_ORIENTATION_FACE_PATH_ANGLES = 2;

/** LookAhead's second result (pNextNext). */
export interface LookAheadResult {
  nextNext: PathTrack | null;
}

export class PathTrack extends MapEntity {
  next: PathTrack | null = null;
  previous: PathTrack | null = null;
  altPath: PathTrack | null = null;
  radius = 0;
  /** m_flSpeed ("speed"): the train's new speed when it arrives here (0 = keep). */
  speed = 0;
  altName = '';
  orientationType = TRACK_ORIENTATION_FACE_PATH;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'radius':
        this.radius = atof(value);
        return true;
      case 'speed':
        this.speed = atof(value);
        return true;
      case 'altpath':
        this.altName = value;
        return true;
      case 'orientationtype':
        this.orientationType = atoi(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  override spawn(): void {
    super.spawn();
    set(this.mins, -8, -8, -8);
    set(this.maxs, 8, 8, 8);
  }

  /** SDK: CPathTrack::Activate → Link. */
  override activate(): void {
    super.activate();
    if (this.targetname !== '') this.link();
  }

  link(): void {
    const target = this.kvString('target');
    if (target) {
      const t = this.world.findByName(target);
      if (t !== this && t instanceof PathTrack) {
        this.next = t;
        t.setPrevious(this);
      }
    }
    if (this.altName) {
      const a = this.world.findByName(this.altName);
      if (a instanceof PathTrack) {
        this.altPath = a;
        a.setPrevious(this);
      }
    }
  }

  setPrevious(prev: PathTrack | null): void {
    if (prev && prev.targetnameLower !== this.altName.toLowerCase()) this.previous = prev;
  }

  isDisabled(): boolean {
    return (this.spawnflags & SF_PATH_DISABLED) !== 0;
  }

  isUpHill(): boolean {
    return (this.spawnflags & SF_PATH_UPHILL) !== 0;
  }

  isDownHill(): boolean {
    return (this.spawnflags & SF_PATH_DOWNHILL) !== 0;
  }

  hillType(): number {
    if (this.isUpHill()) return HILL_TYPE_UPHILL;
    if (this.isDownHill()) return HILL_TYPE_DOWNHILL;
    return HILL_TYPE_NONE;
  }

  /** SDK: CPathTrack::GetNext. */
  getNext(): PathTrack | null {
    if (
      this.altPath &&
      this.spawnflags & SF_PATH_ALTERNATE &&
      !(this.spawnflags & SF_PATH_ALTREVERSE)
    )
      return this.altPath;
    return this.next;
  }

  /** SDK: CPathTrack::GetPrevious. */
  getPrevious(): PathTrack | null {
    if (this.altPath && this.spawnflags & SF_PATH_ALTERNATE && this.spawnflags & SF_PATH_ALTREVERSE)
      return this.altPath;
    return this.previous;
  }

  getNextInDir(forward: boolean): PathTrack | null {
    return forward ? this.getNext() : this.getPrevious();
  }

  /** SDK: CPathTrack::ValidPath. */
  static validPath(p: PathTrack | null, testFlag: number): PathTrack | null {
    if (!p) return null;
    if (testFlag && p.spawnflags & SF_PATH_DISABLED) return null;
    return p;
  }

  /** SDK: CPathTrack::Project. */
  static project(start: PathTrack | null, end: PathTrack | null, origin: Vec3, dist: number): void {
    if (start && end) {
      const dir = vec3(
        end.origin.x - start.origin.x,
        end.origin.y - start.origin.y,
        end.origin.z - start.origin.z,
      );
      normalize(dir);
      set(
        origin,
        end.origin.x + dir.x * dist,
        end.origin.y + dir.y * dist,
        end.origin.z + dir.z * dist,
      );
    }
  }

  /**
   * SDK: CPathTrack::LookAhead. Walks `dist` along the path from `origin`
   * (backwards when negative), leaving the point in `origin`. Returns the
   * node whose segment the point lies on (null at a dead end when `move`).
   */
  lookAhead(
    origin: Vec3,
    distIn: number,
    move: number,
    out: LookAheadResult | null,
  ): PathTrack | null {
    return pathLookAhead(this, origin, distIn, move, out);
  }

  /** SDK: CPathTrack::GetOrientation. */
  getOrientation(forward: boolean, out: Vec3): Vec3 {
    if (this.orientationType === TRACK_ORIENTATION_FACE_PATH_ANGLES) return copy(out, this.angles);
    return pathOrientation(this, forward, out);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'inpass':
        this.fireOutput('OnPass', activator);
        // "path_track_passed": the train watchers adjust for hills.
        for (const w of objectives(this.world).watchers) w.onPathTrackPassed(this);
        return true;
      case 'inteleport':
        this.fireOutput('OnTeleport', activator);
        return true;
      case 'enablealternatepath':
        if (this.altPath) this.spawnflags |= SF_PATH_ALTERNATE;
        return true;
      case 'disablealternatepath':
        if (this.altPath) this.spawnflags &= ~SF_PATH_ALTERNATE;
        return true;
      case 'togglealternatepath':
        if (this.altPath) this.spawnflags ^= SF_PATH_ALTERNATE;
        return true;
      case 'enablepath':
        this.spawnflags &= ~SF_PATH_DISABLED;
        return true;
      case 'disablepath':
        this.spawnflags |= SF_PATH_DISABLED;
        return true;
      case 'togglepath':
        this.spawnflags ^= SF_PATH_DISABLED;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── func_tracktrain ───────────────────────────────────────────────────────

export const SF_TRACKTRAIN_NOPITCH = 0x0001;
export const SF_TRACKTRAIN_NOCONTROL = 0x0002;
export const SF_TRACKTRAIN_FORWARDONLY = 0x0004;
export const SF_TRACKTRAIN_PASSABLE = 0x0008;
export const SF_TRACKTRAIN_FIXED_ORIENTATION = 0x0010;
export const SF_TRACKTRAIN_HL1TRAIN = 0x0080;
export const SF_TRACKTRAIN_USE_MAXSPEED_FOR_PITCH = 0x0100;
export const SF_TRACKTRAIN_UNBLOCKABLE_BY_PLAYER = 0x0200;

const TRAIN_VELOCITY_INSTANTANEOUS = 0;
const TRAIN_VELOCITY_EASE = 2;
const TRAIN_ORIENTATION_FIXED = 0;
const TRAIN_ORIENTATION_AT_PATH_TRACKS = 1;

const lookOut: LookAheadResult = { nextNext: null };
const trainNextPos = vec3();
const trainLook = vec3();
const trainAngles = vec3();
const trainAngles2 = vec3();

export class FuncTrackTrain extends ToggleMover {
  /** m_length ("wheels"). */
  trainLength = 0;
  /** m_height. */
  height = 0;
  /** m_maxSpeed ("startspeed"). */
  maxSpeed = 0;
  bank = 0;
  /** m_flSpeed: signed current speed. */
  trainSpeed = 0;
  oldSpeed = 0;
  desiredSpeed = 0;
  accelToSpeed = false;
  speedChangeTime = 0;
  speedForwardModifier = 1;
  unmodifiedDesiredSpeed = 0;
  accelSpeed = 0;
  decelSpeed = 0;
  manualSpeedChanges = false;
  velocityType = TRAIN_VELOCITY_INSTANTANEOUS;
  orientationType = TRAIN_ORIENTATION_AT_PATH_TRACKS;
  dir = 1;
  path: PathTrack | null = null;
  soundMove = '';
  soundStart = '';
  soundStop = '';
  private soundPlaying = false;
  /** Next() runs every tick while the train is under way (SetThink(Next) with SetNextThink(curtime)). */
  private nextPending = false;
  private deadEndPending = false;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'wheels':
        this.trainLength = atof(value);
        return true;
      case 'height':
        this.height = atof(value);
        return true;
      case 'startspeed':
        this.maxSpeed = atof(value);
        return true;
      case 'bank':
        this.bank = atof(value);
        return true;
      case 'speed':
        this.trainSpeed = atof(value);
        return true;
      case 'movesound':
        this.soundMove = value;
        return true;
      case 'startsound':
        this.soundStart = value;
        return true;
      case 'stopsound':
        this.soundStop = value;
        return true;
      case 'velocitytype':
        this.velocityType = atoi(value);
        return true;
      case 'orientationtype':
        this.orientationType = atoi(value);
        return true;
      case 'manualspeedchanges':
        this.manualSpeedChanges = atoi(value) !== 0;
        return true;
      case 'manualaccelspeed':
        this.accelSpeed = atof(value);
        return true;
      case 'manualdecelspeed':
        this.decelSpeed = atof(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CFuncTrackTrain::Spawn. */
  override spawn(): void {
    super.spawn();
    if (this.maxSpeed === 0) this.maxSpeed = this.trainSpeed === 0 ? 100 : this.trainSpeed;
    set(this.linearVelocity, 0, 0, 0);
    set(this.angularVelocity, 0, 0, 0);
    this.dir = 1;
    if (this.hasSpawnFlags(SF_TRACKTRAIN_UNBLOCKABLE_BY_PLAYER)) this.unblockableByPlayer = true;
    if (this.hasSpawnFlags(SF_TRACKTRAIN_PASSABLE)) {
      this.solidFlags |= FSOLID_NOT_SOLID;
      this.world.setBrushSolid(this, false);
    }
    this.setThink(this.find, this.world.curtime);
  }

  /** The speed the train is heading for (GetDesiredSpeed). */
  getDesiredSpeed(): number {
    return this.desiredSpeed;
  }

  getCurrentSpeed(): number {
    return this.trainSpeed;
  }

  isDirForward(): boolean {
    return this.dir === 1;
  }

  /** SDK: CFuncTrackTrain::SetDirForward. */
  setDirForward(forward: boolean): void {
    if (forward && this.dir !== 1) {
      if (this.path && this.path.getPrevious()) this.path = this.path.getPrevious();
      this.dir = 1;
    } else if (!forward && this.dir !== -1) {
      if (this.path && this.path.getNext()) this.path = this.path.getNext();
      this.dir = -1;
    }
  }

  /** SDK: CFuncTrackTrain::Find — snap onto the first path_track. */
  private readonly find = (): void => {
    const target = this.kvString('target');
    const t = target ? this.world.findByName(target) : null;
    if (!(t instanceof PathTrack)) {
      this.path = null;
      return;
    }
    this.path = t;
    copy(trainNextPos, t.origin);
    copy(trainLook, trainNextPos);
    t.lookAhead(trainLook, this.trainLength, 0, null);
    trainNextPos.z += this.height;
    trainLook.z += this.height;
    if (this.hasSpawnFlags(SF_TRACKTRAIN_FIXED_ORIENTATION)) copy(trainAngles, this.angles);
    else {
      const d = vec3(
        trainLook.x - trainNextPos.x,
        trainLook.y - trainNextPos.y,
        trainLook.z - trainNextPos.z,
      );
      vectorAngles(d, trainAngles);
      if (this.hasSpawnFlags(SF_TRACKTRAIN_NOPITCH)) trainAngles.x = 0;
    }
    copy(this.origin, trainNextPos);
    copy(this.angles, trainAngles);
    this.syncModel();
    this.arriveAtNode(t);
    if (this.trainSpeed !== 0) {
      this.nextPending = true;
      this.setContextThink(this.physicsCtx, this.world.curtime + 0.1);
      this.soundUpdate();
    }
  };

  /** SDK: CFuncTrackTrain::ArriveAtNode. */
  private arriveAtNode(node: PathTrack): void {
    this.firePassInputs(node, node.getNext(), true);
    if (node.hasSpawnFlags(SF_PATH_DISABLE_TRAIN)) this.spawnflags |= SF_TRACKTRAIN_NOCONTROL;
    if (this.spawnflags & SF_TRACKTRAIN_NOCONTROL && node.speed !== 0) this.setSpeed(node.speed);
  }

  /** SDK: CFuncTrackTrain::FirePassInputs. */
  private firePassInputs(start: PathTrack | null, end: PathTrack | null, forward: boolean): void {
    let cur = start;
    let stop = end;
    if (!forward) {
      cur = end;
      stop = start;
    }
    let guard = 0;
    while (cur && cur !== stop && guard++ < 4096) {
      cur.acceptInput('InPass', '', this, this);
      cur = forward ? cur.getNext() : cur.getPrevious();
    }
  }

  /** SDK: CFuncTrackTrain::SetSpeed. */
  setSpeed(speedIn: number, accel = false): void {
    this.accelToSpeed = accel;
    this.unmodifiedDesiredSpeed = speedIn;
    const old = this.trainSpeed;
    let speed = speedIn;
    if (this.speedForwardModifier < 1 && this.dir > 0) speed *= this.speedForwardModifier;
    if (this.accelToSpeed) {
      this.desiredSpeed = Math.abs(speed) * this.dir;
      this.speedChangeTime = this.world.curtime;
      if (this.trainSpeed === 0 && Math.abs(this.desiredSpeed) > 0) this.trainSpeed = 0.1;
      this.start();
      return;
    }
    this.trainSpeed = Math.abs(speed) * this.dir;
    if (this.trainSpeed !== old) {
      if (this.trainSpeed !== 0) {
        if (old === 0) this.start();
        else this.next();
      } else this.stop();
    }
  }

  /** SDK: CFuncTrackTrain::SetSpeedDirAccel. */
  setSpeedDirAccel(newSpeed: number): void {
    this.setDirForward(newSpeed >= 0);
    this.setSpeed(this.maxSpeed * Math.max(0, Math.min(1, Math.abs(newSpeed))), true);
  }

  /** SDK: CFuncTrackTrain::SetSpeedForwardModifier. */
  setSpeedForwardModifier(m: number): void {
    this.speedForwardModifier = Math.max(0, Math.min(1, Math.abs(m)));
    this.setSpeed(this.unmodifiedDesiredSpeed, true);
  }

  private start(): void {
    this.fireOutput('OnStart', this);
    this.next();
  }

  /** SDK: CFuncTrackTrain::Stop. */
  stop(): void {
    set(this.linearVelocity, 0, 0, 0);
    set(this.angularVelocity, 0, 0, 0);
    this.oldSpeed = this.trainSpeed;
    this.trainSpeed = 0;
    this.soundStop2();
    this.nextPending = false;
  }

  /** SDK: CFuncTrackTrain::Next. */
  private next(): void {
    if (!this.trainSpeed) {
      this.soundStop2();
      this.nextPending = false;
      return;
    }
    if (!this.path) {
      this.soundStop2();
      this.trainSpeed = 0;
      this.nextPending = false;
      return;
    }
    this.soundUpdate();
    const nextPos = trainNextPos;
    copy(nextPos, this.origin);
    nextPos.z -= this.height;
    lookOut.nextNext = null;
    let pNext = this.path.lookAhead(nextPos, this.trainSpeed * 0.1, 1, lookOut);
    const pNextNext = lookOut.nextNext as PathTrack | null;
    if (this.manualSpeedChanges && this.trainSpeed < 0 !== this.desiredSpeed < 0) {
      if (!pNext) pNext = this.path;
    }
    nextPos.z += this.height;
    if (pNext) {
      this.updateTrainVelocity(pNext, pNextNext, nextPos);
      this.updateTrainOrientation(pNext, pNextNext);
      if (pNext !== this.path) {
        this.path = pNext;
        this.arriveAtNode(pNext);
        const tele = pNext.getNext();
        if (tele && tele.hasSpawnFlags(SF_PATH_TELEPORT)) this.teleportToPathTrack(tele);
      }
      this.fireOutput('OnNextPoint', pNext);
      this.nextPending = true;
      this.deadEndPending = false;
      this.moveDoneAt = -1;
      this.wake();
    } else {
      this.soundStop2();
      set(
        this.linearVelocity,
        nextPos.x - this.origin.x,
        nextPos.y - this.origin.y,
        nextPos.z - this.origin.z,
      );
      set(this.angularVelocity, 0, 0, 0);
      const v = this.linearVelocity;
      const distance = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      this.oldSpeed = this.trainSpeed;
      this.trainSpeed = 0;
      this.nextPending = false;
      if (distance > 0) {
        const time = distance / Math.abs(this.oldSpeed);
        const s = this.oldSpeed / distance;
        set(v, v.x * s, v.y * s, v.z * s);
        // Velocity was (pos − origin); the SDK scales it by speed/distance (signed).
        if (this.oldSpeed < 0) set(v, -v.x, -v.y, -v.z);
        this.deadEndPending = true;
        this.moveDoneFn = this.deadEnd;
        this.setMoveDoneTime(time);
      } else this.deadEnd();
    }
  }

  /** SDK: CFuncTrackTrain::UpdateTrainVelocity. */
  private updateTrainVelocity(prev: PathTrack, next: PathTrack | null, nextPos: Vec3): void {
    if (this.velocityType !== TRAIN_VELOCITY_INSTANTANEOUS) {
      if (this.accelToSpeed) {
        const prevSpeed = this.trainSpeed;
        const nextSpeed = this.desiredSpeed;
        if (prevSpeed !== nextSpeed) {
          const changeRate =
            Math.abs(nextSpeed) > Math.abs(prevSpeed) ? this.accelSpeed : this.decelSpeed;
          this.trainSpeed = approach(
            this.desiredSpeed,
            this.trainSpeed,
            changeRate * this.world.frametime,
          );
        }
      } else if (next) {
        let prevSpeed = this.trainSpeed;
        if (prev.speed !== 0) prevSpeed = prev.speed;
        let nextSpeed = prevSpeed;
        if (next.speed !== 0) nextSpeed = next.speed;
        if (prevSpeed !== nextSpeed) {
          const sx = next.origin.x - prev.origin.x;
          const sy = next.origin.y - prev.origin.y;
          const sz = next.origin.z - prev.origin.z;
          const segLen = Math.sqrt(sx * sx + sy * sy + sz * sz);
          if (segLen) {
            const cx = this.origin.x - prev.origin.x;
            const cy = this.origin.y - prev.origin.y;
            const cz = this.origin.z - prev.origin.z;
            let p = Math.sqrt(cx * cx + cy * cy + cz * cz) / segLen;
            if (this.velocityType === TRAIN_VELOCITY_EASE) p = p * p * (3 - 2 * p);
            this.trainSpeed = this.dir * (prevSpeed * (1 - p) + nextSpeed * p);
          }
        } else this.trainSpeed = this.dir * prevSpeed;
      }
    }
    const v = this.linearVelocity;
    set(v, nextPos.x - this.origin.x, nextPos.y - this.origin.y, nextPos.z - this.origin.z);
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const s = len > 0 ? Math.abs(this.trainSpeed) / len : 0;
    set(v, v.x * s, v.y * s, v.z * s);
  }

  /** SDK: CFuncTrackTrain::UpdateTrainOrientation (AtPathTracks; the blend types use the same face direction). */
  private updateTrainOrientation(prev: PathTrack, _next: PathTrack | null): void {
    if (
      this.hasSpawnFlags(SF_TRACKTRAIN_FIXED_ORIENTATION) ||
      this.orientationType === TRAIN_ORIENTATION_FIXED
    )
      return;
    if (!this.path) return;
    const front = trainLook;
    copy(front, this.origin);
    front.z -= this.height;
    lookOut.nextNext = null;
    const len = this.trainLength > 0 ? this.trainLength : 100;
    this.path.lookAhead(front, this.isDirForward() ? len : -len, 0, lookOut);
    const nextNode = lookOut.nextNext as PathTrack | null;
    front.z += this.height;
    const face = vec3(front.x - this.origin.x, front.y - this.origin.y, front.z - this.origin.z);
    if (!this.isDirForward()) set(face, -face.x, -face.y, -face.z);
    const angles = trainAngles;
    vectorAngles(face, angles);
    angles.x = angleMod(angles.x);
    angles.y = angleMod(angles.y);
    angles.z = angleMod(angles.z);
    if (
      this.manualSpeedChanges &&
      nextNode &&
      nextNode.orientationType === TRACK_ORIENTATION_FACE_PATH_ANGLES
    ) {
      nextNode.getOrientation(this.isDirForward(), angles);
    }
    const cur = trainAngles2;
    set(cur, angleMod(this.angles.x), angleMod(this.angles.y), angleMod(this.angles.z));
    if (!prev || (face.x === 0 && face.y === 0)) copy(angles, cur);
    this.doUpdateOrientation(cur, angles, this.world.frametime);
  }

  /** SDK: CFuncTrackTrain::DoUpdateOrientation. */
  private doUpdateOrientation(cur: Vec3, target: Vec3, intervalIn: number): void {
    let vx = this.spawnflags & SF_TRACKTRAIN_NOPITCH ? 0 : angleDistance(target.x, cur.x);
    let vy = angleDistance(target.y, cur.y);
    if (Math.abs(vx) < 0.1) vx = 0;
    if (Math.abs(vy) < 0.1) vy = 0;
    const interval = intervalIn === 0 ? 0.1 : intervalIn;
    const av = this.angularVelocity;
    av.x = vx / interval;
    av.y = vy / interval;
    if (this.bank !== 0) {
      if (av.y < -5) av.z = angleDistance(approachAngle(-this.bank, cur.z, this.bank * 2), cur.z);
      else if (av.y > 5)
        av.z = angleDistance(approachAngle(this.bank, cur.z, this.bank * 2), cur.z);
      else av.z = angleDistance(approachAngle(0, cur.z, this.bank * 4), cur.z) * 4;
    }
  }

  /** SDK: CFuncTrackTrain::TeleportToPathTrack. */
  teleportToPathTrack(tele: PathTrack): void {
    copy(trainLook, tele.origin);
    tele.lookAhead(trainLook, this.trainLength, 0, null);
    if (
      !this.hasSpawnFlags(SF_TRACKTRAIN_FIXED_ORIENTATION) &&
      !(
        trainLook.x === tele.origin.x &&
        trainLook.y === tele.origin.y &&
        trainLook.z === tele.origin.z
      )
    ) {
      const pitch = this.angles.x;
      tele.getOrientation(this.isDirForward(), this.angles);
      if (this.hasSpawnFlags(SF_TRACKTRAIN_NOPITCH)) this.angles.x = pitch;
    }
    copy(this.origin, tele.origin);
    set(this.angularVelocity, 0, 0, 0);
    this.syncModel();
    tele.acceptInput('InTeleport', '', this, this);
  }

  /** SDK: CFuncTrackTrain::DeadEnd. */
  private readonly deadEnd = (): void => {
    this.deadEndPending = false;
    this.moveDoneFn = null;
    let track = this.path;
    if (track) {
      let n: PathTrack | null;
      let guard = 0;
      if (this.oldSpeed < 0) {
        do {
          n = PathTrack.validPath(track.getPrevious(), 1);
          if (n) track = n;
        } while (n && guard++ < 4096);
      } else {
        do {
          n = PathTrack.validPath(track.getNext(), 1);
          if (n) track = n;
        } while (n && guard++ < 4096);
      }
    }
    set(this.linearVelocity, 0, 0, 0);
    set(this.angularVelocity, 0, 0, 0);
    if (track) track.acceptInput('InPass', '', this, this);
  };

  protected override afterPhysics(): void {
    // Pushers move first, then think (PhysicsPusher then PhysicsRunThink): Next() picks the new velocity.
    if (this.nextPending && !this.deadEndPending) this.next();
  }

  protected override needsPhysics(): boolean {
    return this.nextPending;
  }

  private soundUpdate(): void {
    if (this.soundPlaying) return;
    if (this.soundStart) this.world.emitSound(this.soundStart, { entity: this.id });
    if (this.soundMove) this.world.emitSound(this.soundMove, { entity: this.id, channel: 6 });
    this.soundPlaying = true;
  }

  private soundStop2(): void {
    if (!this.soundPlaying) return;
    if (this.soundMove) stopSound(this.world, this.id, this.soundMove, 6);
    if (this.soundStop) this.world.emitSound(this.soundStop, { entity: this.id });
    this.soundPlaying = false;
  }

  /** SDK: CFuncTrackTrain::Blocked. Players never block an unblockable train (pushMove leaves them be). */
  override blocked(other: Entity): void {
    const onTrain =
      (other.isPlayer() ? (other as Player).move.flags & FL_ONGROUND : other.flags & FL_ONGROUND) &&
      other.groundEntity === this.id;
    if (onTrain) {
      const delta = Math.min(Math.abs(this.trainSpeed), 50);
      if (!other.velocity.z) other.velocity.z += delta;
      return;
    }
    const v = vec3(
      other.origin.x - this.origin.x,
      other.origin.y - this.origin.y,
      other.origin.z - this.origin.z,
    );
    normalize(v);
    set(other.velocity, v.x * this.blockDamage, v.y * this.blockDamage, v.z * this.blockDamage);
    if (this.unblockableByPlayer && other.isPlayer()) return;
    if (this.blockDamage <= 0 || other.takeDamage === DAMAGE_NO) return;
    crush(this, other, this.blockDamage);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'stop':
        this.stop();
        return true;
      case 'resume':
        this.trainSpeed = this.oldSpeed;
        this.start();
        return true;
      case 'reverse':
        this.setDirForward(!this.isDirForward());
        this.setSpeed(this.trainSpeed);
        return true;
      case 'startforward':
        this.setDirForward(true);
        this.setSpeed(this.maxSpeed);
        return true;
      case 'startbackward':
        this.setDirForward(false);
        this.setSpeed(this.maxSpeed);
        return true;
      case 'toggle':
        this.setSpeed(this.trainSpeed === 0 ? this.maxSpeed : 0);
        return true;
      case 'setspeed':
        this.setSpeed(this.maxSpeed * Math.max(0, Math.min(1, atof(value))));
        return true;
      case 'setspeedreal':
        this.setSpeed(Math.max(0, Math.min(this.maxSpeed, atof(value))));
        return true;
      case 'setspeeddir': {
        const s = atof(value);
        this.setDirForward(s >= 0);
        this.setSpeed(this.maxSpeed * Math.max(0, Math.min(1, Math.abs(s))));
        return true;
      }
      case 'setspeeddiraccel':
        this.setSpeedDirAccel(atof(value));
        return true;
      case 'setspeedforwardmodifier':
        this.setSpeedForwardModifier(atof(value));
        return true;
      case 'teleporttopathtrack': {
        const t = this.world.findByName(value);
        if (t instanceof PathTrack) {
          this.teleportToPathTrack(t);
          this.path = t;
        }
        return true;
      }
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override onRemove(): void {
    this.soundStop2();
    super.onRemove();
  }
}

registerEntityClass('func_door', FuncDoor);
registerEntityClass('func_water', FuncDoor);
registerEntityClass('func_door_rotating', FuncDoorRotating);
registerEntityClass('func_movelinear', FuncMoveLinear);
registerEntityClass('momentary_door', FuncMoveLinear);
registerEntityClass('func_rotating', FuncRotating);
registerEntityClass('path_track', PathTrack);
registerEntityClass('func_tracktrain', FuncTrackTrain);

const lookCx = vec3();
const orientDir = vec3();

/** CPathTrack::LookAhead's walk, from `start`. */
function pathLookAhead(
  start: PathTrack,
  origin: Vec3,
  distIn: number,
  move: number,
  out: LookAheadResult | null,
): PathTrack | null {
  let current = start;
  const originalDist = distIn;
  let dist = distIn;
  let forward = true;
  if (dist < 0) {
    dist = -dist;
    forward = false;
  }
  const cx = copy(lookCx, origin);
  while (dist > 0) {
    const nextNode = PathTrack.validPath(current.getNextInDir(forward), move);
    if (!nextNode) {
      if (!move) PathTrack.project(current.getNextInDir(!forward), current, origin, dist);
      return null;
    }
    const n = current.getNextInDir(forward)!;
    const dx = n.origin.x - cx.x;
    const dy = n.origin.y - cx.y;
    const dz = n.origin.z - cx.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!length && !PathTrack.validPath(n.getNextInDir(forward), move)) {
      if (out) out.nextNext = null;
      if (dist === originalDist) return null;
      return n;
    }
    if (length > dist) {
      const f = dist / length;
      set(origin, cx.x + dx * f, cx.y + dy * f, cx.z + dz * f);
      if (out) out.nextNext = n;
      return current;
    }
    dist -= length;
    cx.x = n.origin.x;
    cx.y = n.origin.y;
    cx.z = n.origin.z;
    current = n;
    copy(origin, cx);
  }
  if (out) out.nextNext = current.getNextInDir(forward);
  return current;
}

/** CPathTrack::GetOrientation for FACE_PATH_DIRECTION. */
function pathOrientation(node: PathTrack, forward: boolean, out: Vec3): Vec3 {
  let prev: PathTrack | null = node;
  let next = node.getNextInDir(forward);
  if (!next) {
    prev = node.getNextInDir(!forward);
    next = node;
  }
  if (!prev) return copy(out, node.angles);
  set(
    orientDir,
    next.origin.x - prev.origin.x,
    next.origin.y - prev.origin.y,
    next.origin.z - prev.origin.z,
  );
  return vectorAngles(orientDir, out);
}
