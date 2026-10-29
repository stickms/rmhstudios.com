/**
 * Brush entities (SDK: doors.cpp CBaseDoor, bmodels.cpp CFuncBrush /
 * CFuncRotating, buttons.cpp CBaseButton, trains.cpp CFuncTrain /
 * CFuncTrackTrain, func_break.cpp, physobj.cpp CPhysBox, func_ladder.cpp).
 *
 * Every solid brush entity gets a physics body from its brushes (kinematic,
 * posed when it moves) so props collide with it; traces use the map's own
 * brush model collision. Movers move through `SpWorld.moveBrush`, which pushes
 * the player out of their way and carries a player standing on them; a
 * parented mover moves in its parent's frame.
 */

import { angleVectors, copy, dot, vec3, type Vec3 } from '../../tf2-game/core/vec';
import type { Entity } from '../../tf2-game/sim/entity';
import { DAMAGE_YES, FSOLID_NOT_SOLID, MOVETYPE_PUSH } from '../../tf2-game/sim/entity';
import { NO_ENTITY } from '../../tf2-game/core/types';
import type { DamageInfo } from '../../tf2-game/sim/damage';
import { brushVertices } from '../physics/brush-hulls';
import { PHYS_GROUP, type PhysBody } from '../physics/physics-world';
import { DMG_CRUSH } from '../constants';
import { registerSp, SpEntity, USE_TOGGLE } from './base';
import { PathCorner, PathTrack } from './logic';

// ─── Base ───────────────────────────────────────────────────────────────────

/** A brush entity with an optional physics stand-in. */
export class SpBrush extends SpEntity {
  phys: PhysBody | null = null;
  /** Solid to physics props (and the player through the map collision). */
  brushSolid = true;

  override spawn(): void {
    super.spawn();
    this.brushSolid = this.bspModel > 0 && this.sp.mapCollision.isModelSolid(this.bspModel);
    if (this.brushSolid) this.createBody();
  }

  /** Convex hulls of the model's brushes, model space. */
  protected brushHulls(): Float32Array[] {
    const out: Float32Array[] = [];
    if (this.bspModel <= 0) return out;
    const bsp = this.sp.bsp;
    const list = this.sp.mapCollision.modelBrushes(this.bspModel);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      // Physics collides with solid, window, grate, moveable brushes.
      if (!(bsp.brushes.contents[b] & (0x1 | 0x2 | 0x8 | 0x4000))) continue;
      const v = brushVertices(bsp, b);
      if (v) out.push(v);
    }
    return out;
  }

  protected createBody(membership: number = PHYS_GROUP.BRUSH): void {
    if (this.phys || this.bspModel <= 0) return;
    const hulls = this.brushHulls();
    if (hulls.length === 0) return;
    this.phys = this.sp.physics.createBody({ entity: this.id, kind: 'kinematic', hulls, origin: this.origin, angles: this.angles, membership, filter: 0xffff, noTrace: true });
  }

  /** Brush solidity for traces and physics. */
  setSolid(on: boolean): void {
    this.brushSolid = on;
    this.sp.setBrushSolid(this, on);
    if (on && !this.phys) this.createBody();
    this.phys?.setGroups(on ? PHYS_GROUP.BRUSH : 0, 0xffff);
  }

  /** Pushes the current pose to the physics stand-in. */
  syncBody(): void {
    this.phys?.setKinematicTarget(this.origin, this.angles);
  }

  /** Moves to a world pose (pushing / carrying the player); false when blocked. */
  moveTo(origin: Vec3, angles: Vec3): boolean {
    if (this.parent !== NO_ENTITY) {
      // In the parent's frame: shift the stored offset; followParent places us.
      const p = this.sp.entity(this.parent);
      if (p) {
        this.parentOffset.x += origin.x - this.origin.x;
        this.parentOffset.y += origin.y - this.origin.y;
        this.parentOffset.z += origin.z - this.origin.z;
      }
      const at = (this as unknown as { anglesAtSet?: Vec3 }).anglesAtSet;
      if (at) {
        at.x += angles.x - this.angles.x;
        at.y += angles.y - this.angles.y;
        at.z += angles.z - this.angles.z;
      }
      copy(this.origin, origin);
      copy(this.angles, angles);
      this.sp.syncBrushModel(this);
      this.syncBody();
      return true;
    }
    const ok = this.sp.moveBrush(this, origin, angles);
    this.syncBody();
    return ok;
  }

  override onRemove(): void {
    if (this.phys) this.sp.physics.removeBody(this.phys);
    this.phys = null;
  }

  restorePhysics(): void {
    if (this.phys && this.phys.removed) this.phys = null;
    if (!this.phys && this.brushSolid) this.createBody();
    this.syncBody();
  }

  protected sound(name: string, stop = false): void {
    if (name && name !== '0' && !(this.spawnflags & 4096)) this.sp.emitSound(name, { entity: this.id, stop });
  }
}

// ─── func_brush / func_wall / func_illusionary / func_clip_vphysics ─────────

/** SDK: CFuncBrush (Solidity 0 toggle, 1 never, 2 always; invert_exclusion + excludednpc). */
export class FuncBrush extends SpBrush {
  disabled = false;

  override spawn(): void {
    super.spawn();
    const solidity = this.kvNumber('Solidity', 0);
    if (this.classname === 'func_illusionary' || solidity === 1) this.setSolid(false);
    if (this.kvBool('StartDisabled')) this.turn(false);
  }

  /** func_brush that only blocks a class (excludednpc + invert_exclusion) does not block the player. */
  passableToPlayer(): boolean {
    const ex = this.kvString('excludednpc').toLowerCase();
    if (!ex) return false;
    return this.kvBool('invert_exclusion') ? ex !== 'player' : ex === 'player';
  }

  /** Whether this brush blocks a class (the energy ball asks). */
  blocksClass(cls: string): boolean {
    const ex = this.kvString('excludednpc').toLowerCase();
    if (!ex) return true;
    const match = ex === cls.toLowerCase();
    return this.kvBool('invert_exclusion') ? match : !match;
  }

  private turn(on: boolean): void {
    this.disabled = !on;
    if (on) this.effects &= ~0x20;
    else this.effects |= 0x20;
    const solidity = this.kvNumber('Solidity', 0);
    if (this.classname === 'func_illusionary' || solidity === 1) return;
    this.setSolid(solidity === 2 ? true : on);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
      case 'turnon':
        this.turn(true);
        return true;
      case 'disable':
      case 'turnoff':
        this.turn(false);
        return true;
      case 'toggle':
        this.turn(this.disabled);
        return true;
      case 'disableshadow':
      case 'enableshadow':
      case 'setexcluded':
      case 'setinvert':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** func_clip_vphysics: blocks physics objects only. */
export class FuncClipVPhysics extends SpBrush {
  override spawn(): void {
    super.spawn();
    this.sp.setBrushSolid(this, false);
    this.createBody(PHYS_GROUP.VPHYSICS_CLIP);
    if (this.kvBool('StartDisabled')) this.phys?.setGroups(0, 0);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'enable' || lc === 'disable') {
      this.phys?.setGroups(lc === 'enable' ? PHYS_GROUP.VPHYSICS_CLIP : 0, lc === 'enable' ? 0xffff : 0);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

// ─── Doors ──────────────────────────────────────────────────────────────────

const TS_AT_TOP = 0;
const TS_AT_BOTTOM = 1;
const TS_GOING_UP = 2;
const TS_GOING_DOWN = 3;

/** SDK: CBaseDoor (func_door), linear. */
export class FuncDoor extends SpBrush {
  readonly pos1 = vec3();
  readonly pos2 = vec3();
  readonly ang1 = vec3();
  readonly ang2 = vec3();
  speed = 100;
  wait = 3;
  state = TS_AT_BOTTOM;
  locked = false;
  dmg = 0;
  forceClosed = false;
  moveDir = vec3();
  /** 0…1 along pos1→pos2. */
  progress = 0;
  protected rotating = false;

  override spawn(): void {
    super.spawn();
    this.moveType = MOVETYPE_PUSH;
    this.speed = this.kvNumber('speed', 100) || 100;
    this.wait = this.kvNumber('wait', 3);
    this.dmg = this.kvNumber('dmg', 0);
    this.forceClosed = this.kvBool('forceclosed');
    this.locked = (this.spawnflags & 2048) !== 0;
    this.setupPositions();
    if (this.spawnflags & 8) this.setSolid(false); // passable
    const startOpen = (this.spawnflags & 1) !== 0 || this.kvNumber('spawnpos', 0) === 1;
    if (startOpen) {
      this.state = TS_AT_TOP;
      this.progress = 1;
      this.applyProgress();
    }
  }

  protected setupPositions(): void {
    copy(this.pos1, this.origin);
    copy(this.ang1, this.angles);
    const md = this.kv?.getVec3('movedir') ?? vec3();
    angleVectors(md, this.moveDir);
    const size = vec3(this.maxs.x - this.mins.x, this.maxs.y - this.mins.y, this.maxs.z - this.mins.z);
    const lip = this.kvNumber('lip', 0);
    const d = Math.abs(this.moveDir.x * (size.x - 2)) + Math.abs(this.moveDir.y * (size.y - 2)) + Math.abs(this.moveDir.z * (size.z - 2)) - lip;
    this.pos2.x = this.pos1.x + this.moveDir.x * d;
    this.pos2.y = this.pos1.y + this.moveDir.y * d;
    this.pos2.z = this.pos1.z + this.moveDir.z * d;
    copy(this.ang2, this.ang1);
  }

  /** Total travel (units or degrees). */
  protected travel(): number {
    return Math.hypot(this.pos2.x - this.pos1.x, this.pos2.y - this.pos1.y, this.pos2.z - this.pos1.z) || 1;
  }

  protected applyProgress(): boolean {
    const t = this.progress;
    const o = vec3(this.pos1.x + (this.pos2.x - this.pos1.x) * t, this.pos1.y + (this.pos2.y - this.pos1.y) * t, this.pos1.z + (this.pos2.z - this.pos1.z) * t);
    const a = vec3(this.ang1.x + (this.ang2.x - this.ang1.x) * t, this.ang1.y + (this.ang2.y - this.ang1.y) * t, this.ang1.z + (this.ang2.z - this.ang1.z) * t);
    return this.moveTo(o, a);
  }

  isOpen(): boolean {
    return this.state === TS_AT_TOP || this.state === TS_GOING_UP;
  }

  open(activator: Entity | null): void {
    if (this.state === TS_GOING_UP || this.state === TS_AT_TOP) {
      // Re-opening an open door restarts its return timer.
      if (this.state === TS_AT_TOP && this.wait >= 0 && !(this.spawnflags & 32)) this.setThink(() => this.close(null), this.world.curtime + this.wait);
      return;
    }
    this.state = TS_GOING_UP;
    this.fireOutput('OnOpen', activator);
    this.sound(this.kvString('noise1'));
    this.setThink(null, -1);
  }

  close(activator: Entity | null): void {
    if (this.state === TS_GOING_DOWN || this.state === TS_AT_BOTTOM) return;
    this.state = TS_GOING_DOWN;
    this.fireOutput('OnClose', activator);
    this.sound(this.kvString('noise1'));
    this.setThink(null, -1);
  }

  simulate(): void {
    if (this.state !== TS_GOING_UP && this.state !== TS_GOING_DOWN) {
      this.velocity.x = this.velocity.y = this.velocity.z = 0;
      return;
    }
    const step = (this.speed * this.sp.tick) / this.travel();
    const before = this.progress;
    const target = this.state === TS_GOING_UP ? 1 : 0;
    this.progress = target > before ? Math.min(1, before + step) : Math.max(0, before - step);
    copy(oldOrigin, this.origin);
    if (!this.applyProgress()) {
      this.progress = before;
      this.blocked();
      return;
    }
    const dt = this.sp.tick;
    this.velocity.x = (this.origin.x - oldOrigin.x) / dt;
    this.velocity.y = (this.origin.y - oldOrigin.y) / dt;
    this.velocity.z = (this.origin.z - oldOrigin.z) / dt;
    if (this.progress === target) this.arrived();
  }

  protected arrived(): void {
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.sound(this.kvString('noise1'), true);
    this.sound(this.kvString('noise2'));
    if (this.state === TS_GOING_UP) {
      this.state = TS_AT_TOP;
      this.fireOutput('OnFullyOpen', null);
      if (this.wait >= 0 && !(this.spawnflags & 32)) this.setThink(() => this.close(null), this.world.curtime + this.wait);
    } else {
      this.state = TS_AT_BOTTOM;
      this.fireOutput('OnFullyClosed', null);
    }
  }

  /** SDK: CBaseDoor::Blocked — hurt the blocker, then reverse unless forced closed. */
  protected blocked(): void {
    const p = this.sp.player;
    if (this.dmg > 0) this.sp.damage(p, this.dmg, DMG_CRUSH, this, this);
    const opening = this.state === TS_GOING_UP;
    this.fireOutput(opening ? 'OnBlockedOpening' : 'OnBlockedClosing', p);
    if (this.forceClosed && !opening) return;
    if (this.wait >= 0) this.state = opening ? TS_GOING_DOWN : TS_GOING_UP;
  }

  override isUsable(): boolean {
    return (this.spawnflags & 256) !== 0 && !(this.spawnflags & 32768);
  }

  override use(activator: Entity): boolean {
    if (this.locked) {
      this.fireOutput('OnLockedUse', activator);
      this.sound(this.kvString('locked_sound'));
      return true;
    }
    if (this.isOpen() && (this.spawnflags & 8192 || this.wait < 0)) this.close(activator);
    else this.open(activator);
    return true;
  }

  override touch(other: Entity): void {
    if (!(this.spawnflags & 1024) || !other.isPlayer() || this.locked) return;
    this.open(other);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'open':
        this.open(activator);
        return true;
      case 'close':
        this.close(activator);
        return true;
      case 'toggle':
        if (this.isOpen()) this.close(activator);
        else this.open(activator);
        return true;
      case 'lock':
        this.locked = true;
        return true;
      case 'unlock':
        this.locked = false;
        return true;
      case 'setspeed':
        this.speed = parseFloat(value) || this.speed;
        return true;
      case 'setposition': {
        this.progress = Math.min(1, Math.max(0, parseFloat(value) || 0));
        this.applyProgress();
        return true;
      }
      case 'disableshadow':
      case 'enableshadow':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** SDK: CRotDoor (func_door_rotating): rotates `distance` degrees about its origin. */
export class FuncDoorRotating extends FuncDoor {
  protected override setupPositions(): void {
    copy(this.pos1, this.origin);
    copy(this.pos2, this.origin);
    copy(this.ang1, this.angles);
    const dist = this.kvNumber('distance', 90);
    const axis = vec3(0, 0, 0);
    if (this.spawnflags & 64) axis.z = 1;
    else if (this.spawnflags & 128) axis.x = 1;
    else axis.y = 1;
    const sign = this.spawnflags & 2 ? -1 : 1;
    this.ang2.x = this.ang1.x + axis.x * dist * sign;
    this.ang2.y = this.ang1.y + axis.y * dist * sign;
    this.ang2.z = this.ang1.z + axis.z * dist * sign;
    this.rotating = true;
  }

  protected override travel(): number {
    return Math.max(1, Math.abs(this.ang2.x - this.ang1.x) + Math.abs(this.ang2.y - this.ang1.y) + Math.abs(this.ang2.z - this.ang1.z));
  }
}

// ─── Buttons ────────────────────────────────────────────────────────────────

/** SDK: CBaseButton (func_button). */
export class FuncButton extends FuncDoor {
  override spawn(): void {
    super.spawn();
    this.locked = (this.spawnflags & 2048) !== 0;
    if (this.health > 0) this.takeDamage = DAMAGE_YES;
  }

  protected override setupPositions(): void {
    super.setupPositions();
    if (this.spawnflags & 1) copy(this.pos2, this.pos1); // don't move
  }

  override isUsable(): boolean {
    return (this.spawnflags & 1024) !== 0;
  }

  /** SDK: CBaseButton::ButtonActivate. */
  press(activator: Entity | null): void {
    if (this.locked) {
      this.fireOutput('OnUseLocked', activator);
      this.sound(this.kvString('locked_sound') && this.kvString('locked_sound') !== '0' ? `Buttons.snd${this.kvString('locked_sound')}` : '');
      return;
    }
    if (this.state === TS_GOING_UP || this.state === TS_GOING_DOWN) return;
    if (this.state === TS_AT_TOP) {
      // Toggle buttons go back out on the next press.
      if (this.spawnflags & 32) {
        this.close(activator);
        this.fireOutput('OnOut', activator);
      }
      return;
    }
    const s = this.kvNumber('sounds', 0);
    if (s) this.sp.emitSound(`Buttons.snd${s}`, { entity: this.id });
    this.fireOutput('OnPressed', activator);
    this.state = TS_GOING_UP;
    if (this.pos2.x === this.pos1.x && this.pos2.y === this.pos1.y && this.pos2.z === this.pos1.z) {
      this.progress = 1;
      this.arrived();
    }
  }

  protected override arrived(): void {
    if (this.state === TS_GOING_UP) {
      this.state = TS_AT_TOP;
      this.fireOutput('OnIn', null);
      if (!(this.spawnflags & 32) && this.wait >= 0) this.setThink(() => this.close(null), this.world.curtime + Math.max(this.wait, 0.1));
    } else {
      this.state = TS_AT_BOTTOM;
      this.fireOutput('OnOut', null);
    }
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
  }

  override close(_activator: Entity | null = null): void {
    if (this.state !== TS_AT_TOP) return;
    this.state = TS_GOING_DOWN;
    if (this.pos2.x === this.pos1.x && this.pos2.y === this.pos1.y && this.pos2.z === this.pos1.z) {
      this.progress = 0;
      this.arrived();
    }
  }

  override use(activator: Entity): boolean {
    this.press(activator);
    return true;
  }

  override touch(other: Entity): void {
    if (this.spawnflags & 256 && other.isPlayer()) this.press(other);
  }

  override onTakeDamage(info: DamageInfo): number {
    if (this.health <= 0) return 0;
    this.fireOutput('OnDamaged', this.sp.entity(info.attacker));
    this.press(this.sp.entity(info.attacker));
    return info.damage;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'press':
        this.press(activator);
        return true;
      case 'pressin':
        if (this.state === TS_AT_BOTTOM) this.press(activator);
        return true;
      case 'pressout':
        this.close(activator);
        return true;
      case 'lock':
        this.locked = true;
        return true;
      case 'unlock':
        this.locked = false;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── func_rotating ──────────────────────────────────────────────────────────

/** SDK: CFuncRotating — spins about an axis (spawnflags 1 start on, 2 reverse, 4 X, 8 Y). */
export class FuncRotating extends SpBrush {
  speed = 0;
  maxSpeed = 100;
  readonly axis = vec3(0, 0, 1);

  override spawn(): void {
    super.spawn();
    this.maxSpeed = this.kvNumber('maxspeed', 100);
    if (this.spawnflags & 4) {
      this.axis.z = 0;
      this.axis.x = 1;
    } else if (this.spawnflags & 8) {
      this.axis.z = 0;
      this.axis.y = 1;
    }
    if (this.spawnflags & 2) this.axis.x = this.axis.y = this.axis.z = -(this.axis.x + this.axis.y + this.axis.z);
    if (this.spawnflags & 1) this.speed = this.maxSpeed;
  }

  simulate(): void {
    if (this.speed === 0) return;
    const d = this.speed * this.sp.tick;
    // Pitch (Y axis) / yaw (Z axis) / roll (X axis) in Source's angle order.
    const a = vec3(this.angles.x + this.axis.y * d, this.angles.y + this.axis.z * d, this.angles.z + this.axis.x * d);
    this.moveTo(this.origin, a);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'start':
      case 'startforward':
        this.speed = this.maxSpeed;
        return true;
      case 'startbackward':
        this.speed = -this.maxSpeed;
        return true;
      case 'stop':
        this.speed = 0;
        return true;
      case 'toggle':
        this.speed = this.speed ? 0 : this.maxSpeed;
        return true;
      case 'reverse':
        this.speed = -this.speed;
        return true;
      case 'setspeed':
        this.speed = this.maxSpeed * (parseFloat(value) || 0);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── Trains ─────────────────────────────────────────────────────────────────

/** SDK: CFuncTrackTrain — moves along path_track nodes. */
export class FuncTrackTrain extends SpBrush {
  maxSpeed = 0;
  speed = 0;
  /** Node we are heading to and the one we left. */
  next: PathTrack | null = null;
  prevNode: PathTrack | null = null;
  height = 0;
  moving = false;

  override spawn(): void {
    super.spawn();
    this.moveType = MOVETYPE_PUSH;
    this.maxSpeed = this.kvNumber('startspeed', 100);
    this.speed = this.kvNumber('speed', 0);
    this.height = this.kvNumber('height', 0);
    if (this.spawnflags & 8) this.setSolid(false); // passable
  }

  override activate(): void {
    super.activate();
    // SDK: CFuncTrackTrain::Activate schedules Find 0.1 s later, after every parent link exists.
    this.setThink(() => this.find(), this.world.curtime + 0.1);
  }

  /** SDK: CFuncTrackTrain::Find — snap to the first node facing along the path, then ArriveAtNode. */
  private find(): void {
    const t = this.sp.findByName(this.kvString('target'));
    if (!(t instanceof PathTrack)) return;
    const pos = vec3(t.origin.x, t.origin.y, t.origin.z + this.height);
    const ang = vec3(this.angles.x, this.angles.y, this.angles.z);
    const n = t.next();
    if (n && this.facesTravel()) {
      const dx = n.origin.x - t.origin.x;
      const dy = n.origin.y - t.origin.y;
      if (Math.hypot(dx, dy) > 1e-3) ang.y = (Math.atan2(dy, dx) * 180) / Math.PI;
    }
    copy(this.origin, pos);
    copy(this.angles, ang);
    this.sp.syncBrushModel(this);
    this.syncBody();
    this.prevNode = t;
    this.next = n;
    t.fireOutput('OnPass', this);
    if (this.speed !== 0) this.moving = true;
  }

  private facesTravel(): boolean {
    return this.kvNumber('orientationtype', 1) !== 0 && !(this.spawnflags & 16);
  }

  simulate(): void {
    if (!this.moving || this.speed === 0 || !this.next) {
      this.velocity.x = this.velocity.y = this.velocity.z = 0;
      return;
    }
    let budget = Math.abs(this.speed) * this.sp.tick;
    const pos = vec3(this.origin.x, this.origin.y, this.origin.z);
    let guard = 0;
    while (budget > 0 && this.next && guard++ < 16) {
      const target = vec3(this.next.origin.x, this.next.origin.y, this.next.origin.z + this.height);
      const d = vec3(target.x - pos.x, target.y - pos.y, target.z - pos.z);
      const len = Math.hypot(d.x, d.y, d.z);
      if (len <= budget) {
        copy(pos, target);
        budget -= len;
        this.passNode(this.next);
        continue;
      }
      pos.x += (d.x / len) * budget;
      pos.y += (d.y / len) * budget;
      pos.z += (d.z / len) * budget;
      budget = 0;
    }
    const ang = vec3(this.angles.x, this.angles.y, this.angles.z);
    if (this.facesTravel()) {
      const dx = pos.x - this.origin.x;
      const dy = pos.y - this.origin.y;
      if (Math.hypot(dx, dy) > 1e-3) {
        let yaw = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (this.speed < 0) yaw += 180;
        ang.y = yaw;
      }
    }
    copy(oldOrigin, this.origin);
    if (!this.moveTo(pos, ang)) {
      if (this.kvNumber('dmg', 0) > 0) this.sp.damage(this.sp.player, this.kvNumber('dmg', 0), DMG_CRUSH, this, this);
      return;
    }
    const dt = this.sp.tick;
    this.velocity.x = (this.origin.x - oldOrigin.x) / dt;
    this.velocity.y = (this.origin.y - oldOrigin.y) / dt;
    this.velocity.z = (this.origin.z - oldOrigin.z) / dt;
  }

  private passNode(node: PathTrack): void {
    node.fireOutput('OnPass', this);
    const s = node.kvNumber('speed', 0);
    if (s > 0 && this.speed !== 0) this.speed = Math.sign(this.speed) * s;
    this.prevNode = node;
    // path_track spawnflag 8: disable train when passed.
    if (node.spawnflags & 8) {
      this.stop();
      return;
    }
    this.next = this.speed >= 0 ? node.next() : node.previous();
    if (!this.next) this.stop();
  }

  stop(): void {
    if (this.moving) {
      const ss = this.kvString('StopSound');
      if (ss) this.sp.emitSound(ss, { entity: this.id });
      const ms = this.kvString('MoveSound');
      if (ms) this.sp.emitSound(ms, { entity: this.id, stop: true });
    }
    this.moving = false;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
  }

  start(speed: number): void {
    this.speed = speed;
    if (speed === 0) {
      this.stop();
      return;
    }
    const forward = speed > 0;
    // Heading: from the last node forward, or back to the previous.
    if (this.prevNode) this.next = forward ? (this.next && this.isAhead(this.next) ? this.next : this.prevNode.next()) : this.prevNode.previous() ?? null;
    if (!this.next) {
      const t = this.sp.findByName(this.kvString('target'));
      if (t instanceof PathTrack) this.next = forward ? t.next() : t.previous();
    }
    if (!this.moving) {
      const ms = this.kvString('MoveSound');
      if (ms) this.sp.emitSound(ms, { entity: this.id, loop: true });
    }
    this.moving = true;
  }

  private isAhead(n: PathTrack): boolean {
    return this.prevNode ? this.prevNode.next() === n : true;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const v = parseFloat(value) || 0;
    switch (input.toLowerCase()) {
      case 'startforward':
        this.start(this.maxSpeed);
        return true;
      case 'startbackward':
        this.start(-this.maxSpeed);
        return true;
      case 'stop':
        this.stop();
        return true;
      case 'resume':
        this.start(this.speed || this.maxSpeed);
        return true;
      case 'toggle':
        if (this.moving) this.stop();
        else this.start(this.speed || this.maxSpeed);
        return true;
      case 'reverse':
        this.start(-(this.speed || this.maxSpeed));
        return true;
      case 'setspeed':
        this.start(this.maxSpeed * Math.min(1, Math.max(0, v)) * (this.speed < 0 ? -1 : 1));
        return true;
      case 'setspeedreal':
        this.start(v);
        return true;
      case 'setspeeddir':
        this.start(this.maxSpeed * v);
        return true;
      case 'setmaxspeed':
        this.maxSpeed = v;
        return true;
      case 'teleporttopathtrack': {
        const t = this.sp.findByName(value);
        if (t instanceof PathTrack) {
          this.moveTo(vec3(t.origin.x, t.origin.y, t.origin.z + this.height), this.angles);
          this.prevNode = t;
          this.next = t.next();
        }
        return true;
      }
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** SDK: CFuncTrain — moves between path_corners (stopping `wait` at each). */
export class FuncTrain extends SpBrush {
  speed = 100;
  target: PathCorner | null = null;
  moving = false;
  waitUntil = 0;

  override spawn(): void {
    super.spawn();
    this.moveType = MOVETYPE_PUSH;
    this.speed = this.kvNumber('speed', 100) || 100;
  }

  override activate(): void {
    super.activate();
    const t = this.sp.findByName(this.kvString('target'));
    if (t instanceof PathCorner) {
      // The train's origin is placed so its mins sit on the first corner (HL1 style).
      this.moveTo(vec3(t.origin.x, t.origin.y, t.origin.z), this.angles);
      this.target = t.next() as PathCorner | null;
    }
  }

  simulate(): void {
    if (!this.moving || !this.target || this.sp.curtime < this.waitUntil) return;
    const t = this.target;
    const d = vec3(t.origin.x - this.origin.x, t.origin.y - this.origin.y, t.origin.z - this.origin.z);
    const len = Math.hypot(d.x, d.y, d.z);
    const step = this.speed * this.sp.tick;
    if (len <= step) {
      this.moveTo(vec3(t.origin.x, t.origin.y, t.origin.z), this.angles);
      t.fireOutput('OnPass', this);
      const wait = t.kvNumber('wait', 0);
      if (wait === -1) this.moving = false;
      else this.waitUntil = this.sp.curtime + wait;
      const s = t.kvNumber('speed', 0);
      if (s > 0) this.speed = s;
      const n = t.next();
      this.target = n instanceof PathCorner ? n : null;
      return;
    }
    this.moveTo(vec3(this.origin.x + (d.x / len) * step, this.origin.y + (d.y / len) * step, this.origin.z + (d.z / len) * step), this.angles);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'start':
        this.moving = true;
        return true;
      case 'stop':
        this.moving = false;
        return true;
      case 'toggle':
        this.moving = !this.moving;
        return true;
      case 'setspeed':
        this.speed = parseFloat(value) || this.speed;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── Breakables and physboxes ───────────────────────────────────────────────

/** SDK: CBreakable (func_breakable): breaks at zero health or on Break. */
export class FuncBreakable extends SpBrush {
  override spawn(): void {
    super.spawn();
    if (this.health > 0 && !(this.spawnflags & 1)) this.takeDamage = DAMAGE_YES;
  }

  breakNow(activator: Entity | null): void {
    if (this.removed) return;
    this.fireOutput('OnBreak', activator);
    this.sp.emit({ type: 'effect', kind: 'break', pos: this.worldSpaceCenter(vec3()), entity: this.id });
    this.sp.emitSound(this.kvNumber('material', 0) === 0 ? 'Breakable.MatGlass' : 'Breakable.Crate', { pos: this.worldSpaceCenter(vec3()) });
    this.world.remove(this);
  }

  override onTakeDamage(info: DamageInfo): number {
    if (this.takeDamage !== DAMAGE_YES) return 0;
    this.health -= info.damage;
    this.fireOutput('OnHealthChanged', this.sp.entity(info.attacker), String(Math.max(0, this.health)));
    if (this.health <= 0) this.breakNow(this.sp.entity(info.attacker));
    return info.damage;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'break') {
      this.breakNow(activator);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** SDK: CPhysBox (func_physbox): a brush that is a physics object. */
export class FuncPhysbox extends SpBrush {
  preventPickup = false;

  override spawn(): void {
    // A dynamic body instead of the kinematic stand-in; the map collision stops tracing the model.
    Object.getPrototypeOf(SpBrush.prototype).spawn.call(this);
    this.sp.setBrushSolid(this, false);
    this.solidFlags &= ~FSOLID_NOT_SOLID;
    const hulls = this.brushHulls();
    const mass = this.kvNumber('massScale', 0) > 0 ? this.kvNumber('massScale', 1) * 30 : 30;
    if (hulls.length > 0) {
      this.phys = this.sp.physics.createBody({ entity: this.id, kind: 'dynamic', hulls, origin: this.origin, angles: this.angles, mass, surface: 'wood_crate' });
      if (this.phys) {
        this.sp.registerBody(this, this.phys);
        if (this.spawnflags & 8 || this.kvBool('motiondisabled')) this.phys.setMotionEnabled(false);
      }
    }
    this.preventPickup = (this.spawnflags & 0x20000) !== 0;
  }

  canBePickedUp(): boolean {
    return !this.preventPickup;
  }

  touchCandidate(): boolean {
    return true;
  }

  syncFromBody(): void {
    const b = this.phys;
    if (!b) return;
    b.getOrigin(this.origin);
    b.getAngles(this.angles);
    this.sp.syncBrushModel(this);
  }
}

// ─── Ladders ────────────────────────────────────────────────────────────────

/** func_useableladder: +use near it climbs between its two points (point0 bottom, point1 top). */
export class FuncUseableLadder extends SpEntity {
  readonly bottom = vec3();
  readonly top = vec3();
  disabled = false;

  override spawn(): void {
    super.spawn();
    const p0 = this.kv?.getVec3('point0') ?? vec3();
    const p1 = this.kv?.getVec3('point1') ?? vec3();
    const lo = p0.z <= p1.z ? p0 : p1;
    const hi = p0.z <= p1.z ? p1 : p0;
    copy(this.bottom, lo);
    copy(this.top, hi);
    this.disabled = this.kvBool('StartDisabled');
    this.mins.x = Math.min(lo.x, hi.x) - 16 - this.origin.x;
    this.mins.y = Math.min(lo.y, hi.y) - 16 - this.origin.y;
    this.mins.z = lo.z - this.origin.z;
    this.maxs.x = Math.max(lo.x, hi.x) + 16 - this.origin.x;
    this.maxs.y = Math.max(lo.y, hi.y) + 16 - this.origin.y;
    this.maxs.z = hi.z + 72 - this.origin.z;
  }

  override isUsable(): boolean {
    return !this.disabled;
  }

  override use(activator: Entity, useType: number): boolean {
    void useType;
    const p = this.sp.player;
    if (activator !== p || this.disabled) return false;
    p.mountLadder(this);
    return true;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'forceplayertogeton':
        this.sp.player.mountLadder(this);
        return true;
      case 'forceplayertogetoff':
        this.sp.player.dismountLadder();
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

const oldOrigin = vec3();

registerSp(FuncBrush, 'func_brush', 'func_wall', 'func_wall_toggle', 'func_illusionary', 'func_lod', 'func_monitor', 'func_reflective_glass');
registerSp(FuncClipVPhysics, 'func_clip_vphysics');
registerSp(FuncDoor, 'func_door', 'func_movelinear');
registerSp(FuncDoorRotating, 'func_door_rotating');
registerSp(FuncButton, 'func_button');
registerSp(FuncRotating, 'func_rotating');
registerSp(FuncTrackTrain, 'func_tracktrain');
registerSp(FuncTrain, 'func_train');
registerSp(FuncBreakable, 'func_breakable');
registerSp(FuncPhysbox, 'func_physbox');
registerSp(FuncUseableLadder, 'func_useableladder');
registerSp(SpEntity, 'func_ladderendpoint', 'info_ladder', 'info_ladder_dismount');

export { dot, USE_TOGGLE };
