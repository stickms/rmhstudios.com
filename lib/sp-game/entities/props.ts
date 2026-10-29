/**
 * Model props (SDK: props.cpp — CPhysicsProp, CDynamicProp, CPropDoorRotating;
 * item_healthcharger/suitcharger; physconstraint.cpp).
 *
 * - prop_physics(_override): a rigid body from the model's .phy with its mass
 *   (massScale applied), damping and inertia; spawnflags 1 start asleep, 4
 *   debris, 8 motion disabled, 256 OnPlayerUse, 512 no pickup. Outputs
 *   OnPlayerPickup / OnPhysGunPickup / OnPhysGunDrop / OnPlayerUse /
 *   OnAwakened / OnBreak / OnHealthChanged / OnOutOfWorld. Fizzlers dissolve it.
 * - prop_dynamic(_override): animated model; SetAnimation / SetDefaultAnimation
 *   (OnAnimationDone when a sequence ends), collision from its .phy as a
 *   kinematic body (solid 6) or its hull box (solid 2), Enable/DisableCollision.
 * - prop_door_rotating: a hinged model door opening away from its user.
 * - Constraints: ballsocket, hinge, length (rope), thruster.
 */

import { angleVectors, copy, vec3, type Vec3 } from '../../tf2-game/core/vec';
import type { Entity } from '../../tf2-game/sim/entity';
import { COLLISION_GROUP_DEBRIS, DAMAGE_YES, FSOLID_NOT_SOLID, MOVETYPE_PUSH, MOVETYPE_VPHYSICS, SOLID_BBOX, SOLID_NONE, SOLID_VPHYSICS } from '../../tf2-game/sim/entity';
import type { DamageInfo } from '../../tf2-game/sim/damage';
import { PHYS_GROUP, type PhysBody } from '../physics/physics-world';
import type { SpPlayer } from '../player/sp-player';
import { registerSp, SpEntity } from './base';
import { matFromAngles, matMulVec } from '../math';

const BOX_HULL = (mins: Vec3, maxs: Vec3): Float32Array =>
  new Float32Array([
    mins.x, mins.y, mins.z, maxs.x, mins.y, mins.z, mins.x, maxs.y, mins.z, maxs.x, maxs.y, mins.z,
    mins.x, mins.y, maxs.z, maxs.x, mins.y, maxs.z, mins.x, maxs.y, maxs.z, maxs.x, maxs.y, maxs.z,
  ]);

/** prop_data health from the model's $keyvalues ("prop_data" { "base" … "health" "n" }). */
function propDataHealth(kv: string): number {
  const m = /"prop_data"\s*\{[^}]*"health"\s*"(\d+)"/i.exec(kv);
  return m ? parseInt(m[1], 10) : 0;
}

// ─── prop_physics ───────────────────────────────────────────────────────────

export class PropPhysics extends SpEntity {
  phys: PhysBody | null = null;
  preventPickup = false;
  motionDisabled = false;
  private wasAsleep = true;
  private synced = false;
  dissolving = false;
  private outOfWorldZ = -Infinity;

  override spawn(): void {
    super.spawn();
    this.moveType = MOVETYPE_VPHYSICS;
    this.solid = SOLID_VPHYSICS;
    this.preventPickup = (this.spawnflags & 512) !== 0;
    this.motionDisabled = (this.spawnflags & 8) !== 0;
    if (this.spawnflags & 4) this.collisionGroup = COLLISION_GROUP_DEBRIS;
    const info = this.model ? this.sp.assets.model(this.model) : null;
    const h = (this.kv?.has('health') ? this.kvNumber('health', 0) : 0) || (info ? propDataHealth(info.keyValues) : 0);
    if (h > 0) {
      this.health = h;
      this.takeDamage = DAMAGE_YES;
    }
    const ws = this.sp.worldEntity.kv?.getVec3('world_mins');
    if (ws) this.outOfWorldZ = ws.z - 128;
    this.createBody();
  }

  protected createBody(): void {
    const info = this.model ? this.sp.assets.model(this.model) : null;
    const phys = info?.physics;
    if (!info) return;
    const hulls = phys && phys.hulls.length > 0 ? phys.hulls : [BOX_HULL(info.mins, info.maxs)];
    const massScale = this.kvNumber('massScale', 0);
    const mass = (phys?.mass ?? 10) * (massScale > 0 ? massScale : 1);
    const debris = this.collisionGroup === COLLISION_GROUP_DEBRIS;
    this.phys = this.sp.physics.createBody({
      entity: this.id,
      kind: 'dynamic',
      hulls,
      origin: this.origin,
      angles: this.angles,
      mass,
      damping: phys?.damping ?? 0,
      rotDamping: phys?.rotDamping ?? 0,
      inertia: (phys?.inertia ?? 1) * (this.kvNumber('inertiaScale', 1) || 1),
      surface: phys?.surfaceProp || info.surfaceProp || 'default',
      startAsleep: (this.spawnflags & 1) !== 0,
      membership: debris ? PHYS_GROUP.DEBRIS : PHYS_GROUP.PROP,
      filter: debris ? PHYS_GROUP.WORLD | PHYS_GROUP.BRUSH | PHYS_GROUP.PORTAL_WALL_0 | PHYS_GROUP.PORTAL_WALL_1 | PHYS_GROUP.DEBRIS : undefined,
      noTrace: debris,
    });
    if (!this.phys) return;
    this.sp.registerBody(this, this.phys);
    if (this.motionDisabled) this.phys.setMotionEnabled(false);
    this.syncFromBody();
  }

  /** Copies the body's pose into the entity (and the touch bounds). */
  syncFromBody(): void {
    const b = this.phys;
    if (!b || b.removed) return;
    const asleepNow = b.isSleeping();
    if (asleepNow && this.wasAsleep && this.synced) return;
    this.synced = true;
    b.getOrigin(this.origin);
    b.getAngles(this.angles);
    b.getVelocity(this.velocity);
    b.fastBounds(bmins, bmaxs);
    this.mins.x = bmins.x - this.origin.x;
    this.mins.y = bmins.y - this.origin.y;
    this.mins.z = bmins.z - this.origin.z;
    this.maxs.x = bmaxs.x - this.origin.x;
    this.maxs.y = bmaxs.y - this.origin.y;
    this.maxs.z = bmaxs.z - this.origin.z;
    const asleep = b.isSleeping();
    if (this.wasAsleep && !asleep && this.world.curtime > 0.1) this.fireOutput('OnAwakened', this);
    this.wasAsleep = asleep;
    if (this.origin.z < this.outOfWorldZ) {
      this.outOfWorldZ = -Infinity;
      this.fireOutput('OnOutOfWorld', this);
    }
  }

  touchCandidate(): boolean {
    return !!this.phys && !this.dissolving;
  }

  canBePickedUp(): boolean {
    return !!this.phys && !this.preventPickup && !this.dissolving && this.phys.isMotionEnabled();
  }

  onPickedUp(player: SpPlayer): void {
    this.fireOutput('OnPhysGunPickup', player);
    this.fireOutput('OnPlayerPickup', player);
    if (this.spawnflags & 256) this.fireOutput('OnPlayerUse', player);
  }

  /** When the player last threw it (metrocops react to being hit). */
  thrownAt = 0;

  onDropped(player: SpPlayer, thrown: boolean): void {
    if (thrown) this.thrownAt = this.world.curtime;
    this.fireOutput('OnPhysGunDrop', player);
    if (thrown) this.fireOutput('OnPhysGunPunt', player);
  }

  override isUsable(): boolean {
    return !!this.phys;
  }

  override use(activator: Entity): boolean {
    if (this.spawnflags & 256) this.fireOutput('OnPlayerUse', activator);
    return true;
  }

  /** Fizzler: dissolves (SDK: CEntityDissolve) and fires the cleanser's output through the caller. */
  dissolve(): void {
    if (this.dissolving) return;
    this.dissolving = true;
    const p = this.sp.player;
    if (p.held && p.held.id === this.id) p.drop(false);
    if (this.phys) {
      this.phys.setGravityEnabled(false);
      const v = this.phys.getVelocity(vec3());
      this.phys.setVelocity({ x: v.x * 0.1, y: v.y * 0.1, z: 10 });
    }
    this.sp.emit({ type: 'effect', kind: 'dissolve', pos: { ...this.origin }, entity: this.id });
    this.sp.emitSound('Prop.Fizzled', { entity: this.id });
    this.fireOutput('OnFizzled', this);
    this.setThink(() => this.world.remove(this), this.world.curtime + 1);
  }

  breakNow(activator: Entity | null): void {
    if (this.removed) return;
    this.fireOutput('OnBreak', activator);
    this.sp.emit({ type: 'effect', kind: 'break', pos: { ...this.origin }, entity: this.id });
    this.world.remove(this);
  }

  override onTakeDamage(info: DamageInfo): number {
    if (this.takeDamage !== DAMAGE_YES || this.health <= 0) return 0;
    this.health -= info.damage;
    this.fireOutput('OnHealthChanged', this.sp.entity(info.attacker), String(Math.max(0, this.health)));
    if (this.health <= 0) this.breakNow(this.sp.entity(info.attacker));
    return info.damage;
  }

  override onRemove(): void {
    this.sp.unregisterBody(this);
    this.phys = null;
  }

  /** Checkpoint restore: a body destroyed since the save comes back. */
  restorePhysics(): void {
    if (!this.phys || this.phys.removed) {
      this.phys = null;
      this.dissolving = false;
      this.createBody();
    }
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const b = this.phys;
    switch (input.toLowerCase()) {
      case 'enablemotion':
        this.motionDisabled = false;
        b?.setMotionEnabled(true);
        b?.wake();
        return true;
      case 'disablemotion':
        this.motionDisabled = true;
        b?.setMotionEnabled(false);
        return true;
      case 'wake':
        b?.wake();
        return true;
      case 'sleep':
        b?.rb.sleep();
        return true;
      case 'break':
        this.breakNow(activator);
        return true;
      case 'enablepuntsound':
      case 'disablepuntsound':
      case 'enabledamageforces':
      case 'disabledamageforces':
      case 'disableshadow':
      case 'enableshadow':
      case 'ignite':
      case 'physdamagescale':
      case 'setbodygroup':
        return true;
      case 'enablepickup':
        this.preventPickup = false;
        return true;
      case 'disablepickup':
        this.preventPickup = true;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

const bmins = vec3();
const bmaxs = vec3();

// ─── prop_dynamic ───────────────────────────────────────────────────────────

/** SDK: CDynamicProp. */
export class PropDynamic extends SpEntity {
  phys: PhysBody | null = null;
  defaultAnim = '';
  animDone = true;
  animEndsAt = -1;
  collisionOn = true;
  /** DisableCollision was used (animation heuristics leave collision alone). */
  collisionForcedOff = false;
  enabled = true;
  private boxSolid = false;
  contents = 1;

  override spawn(): void {
    super.spawn();
    this.solid = this.kvNumber('solid', SOLID_VPHYSICS);
    this.defaultAnim = this.kvString('DefaultAnim');
    const info = this.model ? this.sp.assets.model(this.model) : null;
    if (info) {
      copy(this.mins, info.mins);
      copy(this.maxs, info.maxs);
    }
    if (this.solid === SOLID_VPHYSICS && info?.physics && info.physics.hulls.length > 0) {
      this.phys = this.sp.physics.createBody({ entity: this.id, kind: 'kinematic', hulls: info.physics.hulls, origin: this.origin, angles: this.angles, membership: PHYS_GROUP.BRUSH, filter: 0xffff, surface: info.physics.surfaceProp });
    } else if ((this.solid === SOLID_BBOX || this.solid === SOLID_VPHYSICS) && info && info.maxs.x > info.mins.x) {
      this.boxSolid = true;
      this.sp.collision.addBox(this);
      this.phys = this.sp.physics.createBody({ entity: this.id, kind: 'kinematic', hulls: [BOX_HULL(info.mins, info.maxs)], origin: this.origin, angles: this.angles, membership: PHYS_GROUP.BRUSH, filter: 0xffff, noTrace: true });
    }
    if (this.phys) this.sp.registerBody(this, this.phys);
    if (this.solid === SOLID_NONE) this.solidFlags |= FSOLID_NOT_SOLID;
    if (this.kvBool('StartDisabled')) this.setEnabled(false);
    this.moveType = MOVETYPE_PUSH;
    if (this.defaultAnim) this.playSequence(this.defaultAnim, 1, true);
    else if (info && info.sequences.length > 0) this.anim = { sequence: info.sequences[0].name, startTime: 0, rate: 1, loop: info.sequences[0].looping, duration: info.sequences[0].duration };
  }

  override isSolid(): boolean {
    return this.boxSolid && this.collisionOn && this.enabled;
  }

  private setCollision(on: boolean): void {
    this.collisionOn = on;
    this.phys?.setGroups(on && this.enabled ? PHYS_GROUP.BRUSH : 0, 0xffff);
    if (this.phys) this.phys.noTrace = !(on && this.enabled) || this.boxSolid;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.effects &= ~0x20;
    else this.effects |= 0x20;
    this.setCollision(this.collisionOn);
  }

  /** Plays a sequence; when it ends, OnAnimationDone and the default animation. */
  setAnimation(name: string): void {
    // Animated collision (bone followers) is not simulated: an "open" sequence opens the
    // way (droppers, hatches, covers), a "close" sequence shuts it — unless the map
    // switched collision off itself.
    if (this.phys && !this.collisionForcedOff) {
      if (/open/i.test(name)) this.setCollision(false);
      else if (/close/i.test(name)) this.setCollision(true);
    }
    const d = this.playSequence(name, this.anim?.rate ?? 1, false);
    const seq = this.findSequence(name);
    if (seq && seq.looping) {
      this.animEndsAt = -1;
      return;
    }
    this.animEndsAt = this.world.curtime + Math.max(d, this.sp.tick);
    this.setContextThink(this.animCtx, this.animEndsAt);
  }

  private readonly animCtx = this.context(() => {
    this.animEndsAt = -1;
    this.fireOutput('OnAnimationDone', this);
    if (this.defaultAnim) this.playSequence(this.defaultAnim, 1, true);
  });

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'setanimation':
        this.setAnimation(value);
        return true;
      case 'setdefaultanimation':
        this.defaultAnim = value;
        if (this.animEndsAt < 0 && value) this.playSequence(value, 1, true);
        return true;
      case 'setplaybackrate':
        if (this.anim) this.anim.rate = parseFloat(value) || 0;
        return true;
      case 'enable':
      case 'turnon':
        this.setEnabled(true);
        return true;
      case 'disable':
      case 'turnoff':
        this.setEnabled(false);
        return true;
      case 'enablecollision':
        this.collisionForcedOff = false;
        this.setCollision(true);
        return true;
      case 'disablecollision':
        this.collisionForcedOff = true;
        this.setCollision(false);
        return true;
      case 'setbodygroup':
        this.extra = { ...(this.extra ?? {}), bodygroup: parseInt(value, 10) || 0 };
        return true;
      case 'disableshadow':
      case 'enableshadow':
      case 'setparentattachmentmaintainoffset':
      case 'setlightingorigin':
      case 'setlightingoriginhack':
        return true;
      case 'setparentattachment':
        this.extra = { ...(this.extra ?? {}), parentAttachment: value };
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override onRemove(): void {
    if (this.phys) {
      this.sp.bodiesByEntity.delete(this.id);
      this.sp.physics.removeBody(this.phys);
    }
    this.phys = null;
    this.sp.collision.removeBox(this);
  }
}

// ─── prop_door_rotating ─────────────────────────────────────────────────────

const DOOR_CLOSED = 0;
const DOOR_OPENING = 1;
const DOOR_OPEN = 2;
const DOOR_CLOSING = 3;

/** SDK: CPropDoorRotating. */
export class PropDoorRotating extends PropDynamic {
  closedYaw = 0;
  openYaw = 90;
  doorState = DOOR_CLOSED;
  locked = false;
  speed = 100;
  distance = 90;
  private target = 0;

  override spawn(): void {
    super.spawn();
    this.closedYaw = this.angles.y;
    this.distance = this.kvNumber('distance', 90);
    this.speed = this.kvNumber('speed', 100) || 100;
    this.locked = (this.spawnflags & 2048) !== 0;
    const spawnpos = this.kvNumber('spawnpos', 0);
    if (spawnpos === 1 || spawnpos === 2) {
      this.angles.y = this.closedYaw + (spawnpos === 1 ? this.distance : -this.distance);
      this.doorState = DOOR_OPEN;
      this.syncPose();
    } else if (spawnpos === 3) {
      const ajar = this.kv?.getVec3('ajarangles');
      if (ajar) this.angles.y = ajar.y;
      // Ajar: closed for logic, a +use swings it fully open.
      this.doorState = DOOR_CLOSED;
      this.syncPose();
    }
  }

  private syncPose(): void {
    this.phys?.setKinematicTarget(this.origin, this.angles);
    if (this.phys) this.phys.setPose(this.origin, this.angles);
  }

  override isUsable(): boolean {
    return !(this.spawnflags & 32768);
  }

  /** Opens away from `from` (SDK: CPropDoorRotating::OpenAwayFrom by the door's facing). */
  openDoor(from: Entity | null): void {
    if (this.locked) return;
    if (this.doorState === DOOR_OPEN || this.doorState === DOOR_OPENING) return;
    let dir = 1;
    const opendir = this.kvNumber('opendir', 0);
    if (opendir === 1) dir = 1;
    else if (opendir === 2) dir = -1;
    else if (from) {
      // Swing away from the user: the end pose whose panel centre lies farther from them.
      const cx = (this.mins.x + this.maxs.x) / 2;
      const cy = (this.mins.y + this.maxs.y) / 2;
      const far = (yaw: number): number => {
        const r = (yaw * Math.PI) / 180;
        const px = this.origin.x + cx * Math.cos(r) - cy * Math.sin(r);
        const py = this.origin.y + cx * Math.sin(r) + cy * Math.cos(r);
        return Math.hypot(px - from.origin.x, py - from.origin.y);
      };
      dir = far(this.closedYaw + this.distance) >= far(this.closedYaw - this.distance) ? 1 : -1;
    }
    this.target = this.closedYaw + dir * this.distance;
    this.doorState = DOOR_OPENING;
    this.fireOutput('OnOpen', from);
    this.sp.emitSound(this.kvString('soundopen'), { entity: this.id });
  }

  closeDoor(from: Entity | null): void {
    if (this.doorState === DOOR_CLOSED || this.doorState === DOOR_CLOSING) return;
    this.target = this.closedYaw;
    this.doorState = DOOR_CLOSING;
    this.fireOutput('OnClose', from);
    this.sp.emitSound(this.kvString('soundmove'), { entity: this.id });
  }

  simulate(): void {
    if (this.doorState !== DOOR_OPENING && this.doorState !== DOOR_CLOSING) return;
    const step = this.speed * this.sp.tick;
    const d = this.target - this.angles.y;
    const prev = this.angles.y;
    this.angles.y = Math.abs(d) <= step ? this.target : prev + Math.sign(d) * step;
    // Would the door swing into the player? Then it's blocked.
    this.phys?.setPose(this.origin, this.angles);
    const p = this.sp.player;
    const tr = this.sp.traceHull(p.origin, p.origin, p.mins, p.maxs, 0x1, (id) => id === this.id);
    if (tr.startSolid && tr.entity === this.id) {
      this.angles.y = prev;
      this.phys?.setPose(this.origin, this.angles);
      const closing = this.doorState === DOOR_CLOSING;
      this.fireOutput(closing ? 'OnBlockedClosing' : 'OnBlockedOpening', p);
      if (!this.kvBool('forceclosed') || !closing) this.doorState = closing ? DOOR_OPEN : DOOR_CLOSED;
      return;
    }
    this.syncPose();
    if (this.angles.y === this.target) {
      if (this.doorState === DOOR_OPENING) {
        this.doorState = DOOR_OPEN;
        this.fireOutput('OnFullyOpen', null);
        const rd = this.kvNumber('returndelay', -1);
        if (rd >= 0) this.setThink(() => this.closeDoor(null), this.world.curtime + rd);
      } else {
        this.doorState = DOOR_CLOSED;
        this.fireOutput('OnFullyClosed', null);
        this.sp.emitSound(this.kvString('soundclose'), { entity: this.id });
      }
    }
  }

  override use(activator: Entity): boolean {
    if (this.locked) {
      this.fireOutput('OnLockedUse', activator);
      this.sp.emitSound(this.kvString('soundlocked'), { entity: this.id });
      return true;
    }
    if (this.doorState === DOOR_OPEN || this.doorState === DOOR_OPENING) {
      if (this.spawnflags & 8192) this.closeDoor(activator);
    } else this.openDoor(activator);
    return true;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'open':
        this.openDoor(activator);
        return true;
      case 'openawayfrom':
        this.openDoor(this.sp.findByName(value, this, activator, caller));
        return true;
      case 'close':
        this.closeDoor(activator);
        return true;
      case 'toggle':
        if (this.doorState === DOOR_CLOSED || this.doorState === DOOR_CLOSING) this.openDoor(activator);
        else this.closeDoor(activator);
        return true;
      case 'lock':
        this.locked = true;
        return true;
      case 'unlock':
        this.locked = false;
        return true;
      case 'setrotationdistance':
        this.distance = parseFloat(value) || this.distance;
        return true;
      case 'setspeed':
        this.speed = parseFloat(value) || this.speed;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── Chargers ───────────────────────────────────────────────────────────────

/** item_suitcharger / item_healthcharger: +use charges the suit (needs the HEV) or health. */
export class ItemCharger extends PropDynamic {
  juice = 75;

  override spawn(): void {
    if (!this.model) this.model = this.classname === 'item_suitcharger' ? 'models/props_combine/suit_charger001.mdl' : 'models/props_combine/health_charger001.mdl';
    super.spawn();
    this.juice = this.classname === 'item_suitcharger' ? 75 : 50;
  }

  override isUsable(): boolean {
    return true;
  }

  override use(activator: Entity): boolean {
    const p = this.sp.player;
    if (activator !== p) return false;
    const suit = this.classname === 'item_suitcharger';
    if (this.juice <= 0 || (suit && !p.hasSuit)) {
      this.sp.emitSound(suit ? 'SuitRecharge.Deny' : 'WallHealth.Deny', { entity: this.id });
      return true;
    }
    const give = Math.min(this.juice, suit ? 100 - p.armor : 100 - p.health);
    if (give <= 0) return true;
    if (suit) p.armor += give;
    else p.health += give;
    this.juice -= give;
    this.fireOutput('OutRemainingCharge', p, String(this.juice));
    if (this.juice <= 0) this.fireOutput('OnEmpty', p);
    this.sp.emitSound(suit ? 'SuitRecharge.Start' : 'WallHealth.Start', { entity: this.id });
    return true;
  }
}

// ─── Constraints ────────────────────────────────────────────────────────────

/** phys_ballsocket / phys_hinge / phys_lengthconstraint / phys_ragdollconstraint. */
export class PhysConstraint extends SpEntity {
  private made = false;

  override activate(): void {
    super.activate();
    this.setThink(() => this.make(), this.world.curtime + 0.02);
  }

  private bodyOf(name: string): PhysBody | null {
    if (!name) return null;
    const e = this.sp.findByName(name);
    return e ? (this.sp.bodiesByEntity.get(e.id) ?? null) : null;
  }

  private make(): void {
    if (this.made) return;
    const a = this.bodyOf(this.kvString('attach1'));
    const b = this.bodyOf(this.kvString('attach2'));
    const first = a ?? b;
    const second = a ? b : null;
    if (!first || first.kind !== 'dynamic') return;
    this.made = true;
    const ph = this.sp.physics;
    if (this.classname === 'phys_hinge') {
      const axisPoint = this.kv?.getVec3('hingeaxis') ?? vec3(this.origin.x, this.origin.y, this.origin.z + 1);
      const axis = vec3(axisPoint.x - this.origin.x, axisPoint.y - this.origin.y, axisPoint.z - this.origin.z);
      const l = Math.hypot(axis.x, axis.y, axis.z) || 1;
      ph.addHingeJoint(first, second, this.origin, vec3(axis.x / l, axis.y / l, axis.z / l));
    } else if (this.classname === 'phys_lengthconstraint') {
      const pb = this.kv?.getVec3('attachpoint') ?? this.origin;
      const length = Math.hypot(pb.x - this.origin.x, pb.y - this.origin.y, pb.z - this.origin.z) + this.kvNumber('addlength', 0);
      ph.addLengthJoint(first, second, this.origin, pb, length);
    } else {
      ph.addBallJoint(first, second, this.origin);
    }
  }
}

/** phys_thruster: a constant push on its attached body while active. */
export class PhysThruster extends SpEntity {
  active = false;

  simulate(): void {
    if (!this.active) return;
    const e = this.sp.findByName(this.kvString('attach1'));
    const b = e ? this.sp.bodiesByEntity.get(e.id) : undefined;
    if (!b) return;
    const f = vec3();
    angleVectors(this.angles, f);
    const force = this.kvNumber('force', 0) * this.sp.tick;
    b.applyImpulse({ x: f.x * force, y: f.y * force, z: f.z * force });
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'activate':
        this.active = true;
        return true;
      case 'deactivate':
        this.active = false;
        return true;
      case 'scale':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerSp(PropPhysics, 'prop_physics', 'prop_physics_override', 'prop_physics_multiplayer', 'prop_physics_respawnable');
registerSp(PropDynamic, 'prop_dynamic', 'prop_dynamic_override', 'prop_dynamic_ornament');
registerSp(PropDoorRotating, 'prop_door_rotating');
registerSp(ItemCharger, 'item_suitcharger', 'item_healthcharger');
registerSp(PhysConstraint, 'phys_ballsocket', 'phys_hinge', 'phys_lengthconstraint', 'phys_ragdollconstraint');
registerSp(PhysThruster, 'phys_thruster');
registerSp(SpEntity, 'phys_constraintsystem');

export { matFromAngles, matMulVec };
