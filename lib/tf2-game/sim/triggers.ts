/**
 * Triggers and the generic trigger-like brush entities (triggers.cpp,
 * func_respawnroom.cpp, func_regenerate.cpp, func_no_build.cpp,
 * filters.cpp, tf_filters.cpp):
 *
 * - `BaseTrigger` (CBaseTrigger): enable/disable, spawnflag + filter
 *   checks (PassesTriggerFilters), the touching list and the OnStartTouch /
 *   OnStartTouchAll / OnEndTouch / OnEndTouchAll outputs.
 * - trigger_multiple / trigger_once, trigger_hurt, trigger_push,
 *   trigger_teleport (+ info_teleport_destination).
 * - func_respawnroom / func_respawnroomvisualizer, func_regenerate,
 *   func_nobuild.
 * - filter_activator_name, filter_activator_class, filter_activator_team,
 *   filter_activator_tfteam, filter_multi.
 *
 * The world decides who touches what each tick (world.updateTriggerTouches)
 * and calls startTouch / touch / endTouch here.
 */

import { copy, vec3, angleVectors, type Vec3 } from '../core/vec';
import { CONTENTS_BLUETEAM, CONTENTS_REDTEAM, MOVETYPE_NONE, TEAM_UNASSIGNED, TF_TEAM_BLUE, TF_TEAM_RED } from '../core/constants';
import { NO_ENTITY } from '../core/types';
import {
  COLLISION_GROUP_PLAYER_MOVEMENT,
  DAMAGE_NO,
  Entity,
  FL_BASEVELOCITY,
  FSOLID_NOT_SOLID,
  FSOLID_TRIGGER,
  MOVETYPE_PUSH,
  SOLID_BSP,
  TFCOLLISION_GROUP_RESPAWNROOMS,
} from './entity';
import { registerEntityClass } from './entity-registry';
import { createDamageInfo, DMG_GENERIC, TF_DMG_CUSTOM_TRIGGER_HURT, type DamageInfo } from './damage';
import { TF_REGENERATE_NEXT_USE_TIME, type Player } from './player';
import { TF_COND } from './conditions';
import { GR_STATE_TEAM_WIN } from './rules';

// Trigger spawnflags (triggers.h).
export const SF_TRIGGER_ALLOW_CLIENTS = 0x01;
export const SF_TRIGGER_ALLOW_NPCS = 0x02;
export const SF_TRIGGER_ALLOW_PUSHABLES = 0x04;
export const SF_TRIGGER_ALLOW_PHYSICS = 0x08;
export const SF_TRIGGER_ONLY_PLAYER_ALLY_NPCS = 0x10;
export const SF_TRIGGER_ONLY_CLIENTS_IN_VEHICLES = 0x20;
export const SF_TRIGGER_ALLOW_ALL = 0x40;
export const SF_TRIG_PUSH_ONCE = 0x80;
export const SF_TRIGGER_ONLY_CLIENTS_OUT_OF_VEHICLES = 0x200;
export const SF_TRIG_TOUCH_DEBRIS = 0x400;
export const SF_TRIGGER_DISALLOW_BOTS = 0x1000;
/** trigger_teleport: keep the toucher's angles. */
export const SF_TELEPORT_PRESERVE_ANGLES = 0x20;

// ─── Filters ───────────────────────────────────────────────────────────────

/** SDK: CBaseFilter — `Negated` flips the result; TestActivator fires OnPass/OnFail. */
export class BaseFilter extends Entity {
  negated = false;

  override spawn(): void {
    super.spawn();
    this.negated = this.kvBool('Negated');
  }

  /** CBaseFilter::PassesFilter. */
  passesFilter(caller: Entity | null, entity: Entity): boolean {
    const pass = this.passesFilterImpl(caller, entity);
    return this.negated ? !pass : pass;
  }

  protected passesFilterImpl(_caller: Entity | null, _entity: Entity): boolean {
    return true;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'testactivator') {
      if (activator) {
        if (this.passesFilter(caller, activator)) this.fireOutput('OnPass', activator);
        else this.fireOutput('OnFail', activator);
      }
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** filter_activator_name. */
export class FilterName extends BaseFilter {
  protected override passesFilterImpl(_caller: Entity | null, entity: Entity): boolean {
    const name = this.kvString('filtername').toLowerCase();
    if (name.endsWith('*')) return entity.targetnameLower.startsWith(name.slice(0, -1));
    return entity.targetnameLower === name;
  }
}

/** filter_activator_class. */
export class FilterClass extends BaseFilter {
  protected override passesFilterImpl(_caller: Entity | null, entity: Entity): boolean {
    return entity.classname === this.kvString('filterclass').toLowerCase();
  }
}

/** filter_activator_team (filters.cpp: m_iFilterTeam). */
export class FilterTeam extends BaseFilter {
  protected override passesFilterImpl(_caller: Entity | null, entity: Entity): boolean {
    return entity.team === this.kvNumber('filterteam', 0);
  }
}

/**
 * filter_activator_tfteam (CFilterTFTeam): the entity's team must match the
 * filter's TeamNum — except that the winners pass every filter in the bonus
 * round (so their doors open).
 */
export class FilterTFTeam extends BaseFilter {
  controlPointName = '';

  override spawn(): void {
    super.spawn();
    this.controlPointName = this.kvString('controlpoint');
  }

  override passesFilter(caller: Entity | null, entity: Entity): boolean {
    const rules = this.world.rules;
    if (rules.state === GR_STATE_TEAM_WIN && rules.winningTeam === entity.team) return !this.negated;
    return super.passesFilter(caller, entity);
  }

  protected override passesFilterImpl(_caller: Entity | null, entity: Entity): boolean {
    return entity.team === this.team;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'roundactivate') {
      if (this.controlPointName) {
        const cp = this.world.findByName(this.controlPointName);
        if (cp) this.changeTeam(cp.team);
      }
      return true;
    }
    if (lc === 'roundspawn') return true;
    return super.acceptInput(input, value, activator, caller);
  }
}

/** filter_multi (CFilterMultiple): Filter01..05 with AND (0) or OR (1). */
export class FilterMulti extends BaseFilter {
  private filters: BaseFilter[] = [];
  private filterType = 0;

  override activate(): void {
    super.activate();
    this.filterType = this.kvNumber('FilterType', 0);
    this.filters = [];
    for (let i = 1; i <= 10; i++) {
      const n = this.kvString(`Filter${i < 10 ? '0' : ''}${i}`);
      if (!n) continue;
      const f = this.world.findByName(n);
      if (f instanceof BaseFilter) this.filters.push(f);
    }
  }

  protected override passesFilterImpl(caller: Entity | null, entity: Entity): boolean {
    if (this.filters.length === 0) return true;
    if (this.filterType === 0) return this.filters.every((f) => f.passesFilter(caller, entity));
    return this.filters.some((f) => f.passesFilter(caller, entity));
  }
}

registerEntityClass('filter_activator_name', FilterName);
registerEntityClass('filter_activator_class', FilterClass);
registerEntityClass('filter_activator_team', FilterTeam);
registerEntityClass('filter_activator_tfteam', FilterTFTeam);
registerEntityClass('filter_multi', FilterMulti);

// ─── Base trigger ──────────────────────────────────────────────────────────

/** SDK: CBaseTrigger. */
export class BaseTrigger extends Entity {
  disabled = false;
  filterName = '';
  filter: BaseFilter | null = null;
  /** Entities that passed the filters and are touching (m_hTouchingEntities), in touch order. */
  readonly touching: Entity[] = [];

  override spawn(): void {
    super.spawn();
    this.solid = SOLID_BSP;
    this.solidFlags |= FSOLID_TRIGGER | FSOLID_NOT_SOLID;
    this.disabled = this.kvBool('StartDisabled');
    this.filterName = this.kvString('filtername');
    if (this.bspModel > 0) this.world.setBrushSolid(this, false);
    this.world.registerTrigger(this);
  }

  override activate(): void {
    super.activate();
    if (this.filterName) {
      const f = this.world.findByName(this.filterName);
      this.filter = f instanceof BaseFilter ? f : null;
    }
  }

  override isTrigger(): boolean {
    return true;
  }

  /** Whether the world should even consider `other` for this trigger (cheap pre-test). */
  wantsToucher(other: Entity): boolean {
    if (other.isPlayer()) return true;
    return this.hasSpawnFlags(SF_TRIGGER_ALLOW_ALL | SF_TRIGGER_ALLOW_NPCS | SF_TRIGGER_ALLOW_PHYSICS | SF_TRIG_TOUCH_DEBRIS);
  }

  /** SDK: CBaseTrigger::PassesTriggerFilters. */
  passesTriggerFilters(other: Entity): boolean {
    const allowed =
      this.hasSpawnFlags(SF_TRIGGER_ALLOW_ALL) ||
      (this.hasSpawnFlags(SF_TRIGGER_ALLOW_CLIENTS) && other.isPlayer()) ||
      (this.hasSpawnFlags(SF_TRIGGER_ALLOW_PHYSICS) && !other.isPlayer() && other.moveType !== MOVETYPE_PUSH) ||
      (this.hasSpawnFlags(SF_TRIGGER_ALLOW_NPCS) && other.isBaseObject());
    if (!allowed) return false;
    if (other.isPlayer()) {
      const p = other as Player;
      if (!p.alive) return false;
      if (this.hasSpawnFlags(SF_TRIGGER_ONLY_CLIENTS_IN_VEHICLES)) return false;
      if (this.hasSpawnFlags(SF_TRIGGER_DISALLOW_BOTS) && p.isBot) return false;
    }
    return this.filter ? this.filter.passesFilter(this, other) : true;
  }

  isTouching(other: Entity): boolean {
    return this.touching.includes(other);
  }

  /** SDK: CBaseTrigger::StartTouch. */
  override startTouch(other: Entity): void {
    if (!this.passesTriggerFilters(other)) return;
    let added = false;
    if (!this.touching.includes(other)) {
      this.touching.push(other);
      added = true;
    }
    this.fireOutput('OnStartTouch', other);
    if (added && this.touching.length === 1) {
      this.fireOutput('OnStartTouchAll', other);
      this.startTouchAll();
    }
  }

  /** SDK: CBaseTrigger::EndTouch. */
  override endTouch(other: Entity): void {
    const i = this.touching.indexOf(other);
    if (i < 0) return;
    this.touching.splice(i, 1);
    this.fireOutput('OnEndTouch', other);
    // Drop dead/removed touchers like the SDK's sweep.
    for (let j = this.touching.length - 1; j >= 0; j--) {
      const e = this.touching[j];
      if (e.removed || (e.isPlayer() && !e.alive)) this.touching.splice(j, 1);
    }
    if (this.touching.length === 0) {
      this.fireOutput('OnEndTouchAll', other);
      this.endTouchAll();
    }
  }

  protected startTouchAll(): void {}
  protected endTouchAll(): void {}

  /** Volume test used by the world's touch pass. */
  touchesBox(mins: Vec3, maxs: Vec3): boolean {
    if (this.bspModel > 0) return this.world.boxTouchesBrushEntity(this, mins, maxs);
    return (
      mins.x < this.origin.x + this.maxs.x &&
      maxs.x > this.origin.x + this.mins.x &&
      mins.y < this.origin.y + this.maxs.y &&
      maxs.y > this.origin.y + this.mins.y &&
      mins.z < this.origin.z + this.maxs.z &&
      maxs.z > this.origin.z + this.mins.z
    );
  }

  /** SDK: CBaseEntity::CollisionProp()->...PointIsWithin. */
  pointIsWithin(p: Vec3): boolean {
    if (this.bspModel > 0) return this.world.pointInBrushEntity(this, p);
    return (
      p.x >= this.origin.x + this.mins.x &&
      p.x <= this.origin.x + this.maxs.x &&
      p.y >= this.origin.y + this.mins.y &&
      p.y <= this.origin.y + this.maxs.y &&
      p.z >= this.origin.z + this.mins.z &&
      p.z <= this.origin.z + this.maxs.z
    );
  }

  enable(): void {
    if (!this.disabled) return;
    this.disabled = false;
    // Re-touch whoever is inside now (PhysicsTouchTriggers on next pass).
    this.world.resetTriggerTouches(this);
  }

  disable(): void {
    if (this.disabled) return;
    this.disabled = true;
    this.world.endAllTouches(this);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.enable();
        return true;
      case 'disable':
        this.disable();
        return true;
      case 'toggle':
        if (this.disabled) this.enable();
        else this.disable();
        return true;
      case 'touchtest':
        if (this.touching.length > 0) this.fireOutput('OnTouching', activator);
        else this.fireOutput('OnNotTouching', activator);
        return true;
      case 'starttouch':
        if (activator) this.startTouch(activator);
        return true;
      case 'endtouch':
        if (activator) this.endTouch(activator);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override onRemove(): void {
    this.world.unregisterTrigger(this);
  }
}

/** trigger_multiple: OnTrigger, then waits `wait` seconds (default 0.2). */
export class TriggerMultiple extends BaseTrigger {
  wait = 0.2;
  private readyAt = 0;
  private spent = false;

  override spawn(): void {
    super.spawn();
    const w = this.kvNumber('wait', 0);
    this.wait = w === 0 ? 0.2 : w;
  }

  override touch(other: Entity): void {
    if (this.disabled || this.spent) return;
    if (this.passesTriggerFilters(other)) this.activateMultiTrigger(other);
  }

  /** SDK: CTriggerMultiple::ActivateMultiTrigger. */
  activateMultiTrigger(activator: Entity): void {
    const t = this.world.curtime;
    if (this.readyAt > t) return;
    this.fireOutput('OnTrigger', activator);
    if (this.wait > 0) this.readyAt = t + this.wait;
    else {
      // trigger_once: stop touching and remove shortly after.
      this.spent = true;
      this.setThink(this.subRemove, t + 0.1);
    }
  }
}

/** trigger_once: a trigger_multiple with wait −1. */
export class TriggerOnce extends TriggerMultiple {
  override spawn(): void {
    super.spawn();
    this.wait = -1;
  }
}

/** DAMAGEMODEL_DOUBLE_FORGIVENESS (trigger_hurt "damagemodel" 1). */
const DAMAGEMODEL_DOUBLE_FORGIVENESS = 1;
const TRIGGER_HURT_FORGIVE_TIME = 3.0;

/** trigger_hurt: `damage` per second, applied every half second to everyone inside. */
export class TriggerHurt extends BaseTrigger {
  damage = 10;
  originalDamage = 10;
  damageCap = 20;
  damageType = DMG_GENERIC;
  damageModel = 0;
  noDmgForce = false;
  private dmgResetTime = 0;
  private readonly hurtThisPass = new Set<Entity>();
  private readonly info: DamageInfo = createDamageInfo();
  private readonly center = vec3();

  override spawn(): void {
    super.spawn();
    this.damage = this.kvNumber('damage', 10);
    this.originalDamage = this.damage;
    this.damageCap = this.kvNumber('damagecap', 20);
    this.damageType = this.kvNumber('damagetype', 0);
    this.damageModel = this.kvNumber('damagemodel', 0);
    this.noDmgForce = this.kvBool('nodmgforce');
  }

  override touch(_other: Entity): void {
    if (this.disabled) return;
    if (!this.thinkFn) this.setThink(this.hurtThink, this.world.curtime);
  }

  readonly hurtThink = (): void => {
    if (this.hurtAllTouchers(0.5) <= 0) this.setThink(null, -1);
    else this.nextThink = this.world.curtime + 0.5;
  };

  override endTouch(other: Entity): void {
    // Anyone who leaves without having been hurt takes half a second's worth now.
    if (this.passesTriggerFilters(other) && !this.hurtThisPass.has(other)) this.hurtEntity(other, this.damage * 0.5);
    super.endTouch(other);
  }

  /** SDK: CTriggerHurt::HurtEntity. */
  hurtEntity(other: Entity, amount: number): boolean {
    if (other.takeDamage === DAMAGE_NO || !this.passesTriggerFilters(other)) return false;
    if (amount < 0) other.takeHealth(-amount, this.damageType);
    else {
      const info = this.info;
      info.attacker = this.id;
      info.inflictor = this.id;
      info.damage = amount;
      info.baseDamage = amount;
      info.damageForForce = 0;
      info.damageType = this.damageType;
      info.customKill = TF_DMG_CUSTOM_TRIGGER_HURT;
      info.critType = 0;
      info.weaponId = 0;
      info.killIcon = 'trigger_hurt';
      this.world.brushCenter(this, this.center);
      other.nearestPoint(this.center, info.position);
      this.world.applyDamage(other, info);
    }
    this.fireOutput(other.isPlayer() ? 'OnHurtPlayer' : 'OnHurt', other);
    this.hurtThisPass.add(other);
    return true;
  }

  /** SDK: CTriggerHurt::HurtAllTouchers. */
  hurtAllTouchers(dt: number): number {
    let count = 0;
    this.hurtThisPass.clear();
    const list = this.world.triggerLinks(this);
    for (const e of list) if (this.hurtEntity(e, this.damage * dt)) count++;
    if (this.damageModel === DAMAGEMODEL_DOUBLE_FORGIVENESS) {
      if (count === 0) {
        if (this.world.curtime > this.dmgResetTime) this.damage = this.originalDamage;
      } else {
        this.damage = Math.min(this.damage * 2, this.damageCap);
        this.dmgResetTime = this.world.curtime + TRIGGER_HURT_FORGIVE_TIME;
      }
    }
    return count;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'setdamage') {
      this.damage = parseFloat(value) || 0;
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** trigger_push: sets a base velocity of `speed` along `pushdir`. */
export class TriggerPush extends BaseTrigger {
  readonly pushDir = vec3(0, 0, 1);
  speed = 100;
  private readonly push = vec3();

  override spawn(): void {
    super.spawn();
    const a = this.kv?.getVec3('pushdir') ?? { x: 0, y: 0, z: 0 };
    angleVectors(a, this.pushDir);
    const s = this.kvNumber('speed', 0);
    this.speed = s === 0 ? 100 : s;
  }

  /** SDK: CTriggerPush::Touch. */
  override touch(other: Entity): void {
    if (this.disabled) return;
    if (other.moveType === MOVETYPE_PUSH || other.moveType === MOVETYPE_NONE) return;
    if (!other.isSolid() && !other.isPlayer()) return;
    if (!this.passesTriggerFilters(other)) return;
    if (other.parent !== NO_ENTITY) return;
    const p = this.push;
    p.x = this.pushDir.x * this.speed;
    p.y = this.pushDir.y * this.speed;
    p.z = this.pushDir.z * this.speed;
    if (this.hasSpawnFlags(SF_TRIG_PUSH_ONCE)) {
      other.velocity.x += p.x;
      other.velocity.y += p.y;
      other.velocity.z += p.z;
      if (p.z > 0) this.world.clearGround(other);
      this.world.remove(this);
      return;
    }
    if (other.flags & FL_BASEVELOCITY) {
      p.x += other.baseVelocity.x;
      p.y += other.baseVelocity.y;
      p.z += other.baseVelocity.z;
    }
    if (p.z > 0 && this.world.isOnGround(other)) {
      this.world.clearGround(other);
      other.origin.z += 1;
    }
    copy(other.baseVelocity, p);
    other.flags |= FL_BASEVELOCITY;
  }
}

/** trigger_teleport: moves touchers to the `target` entity (optionally relative to a landmark). */
export class TriggerTeleport extends BaseTrigger {
  private readonly dest = vec3();

  /** SDK: CTriggerTeleport::Touch. */
  override touch(other: Entity): void {
    if (this.disabled || !this.passesTriggerFilters(other)) return;
    const targetName = this.kvString('target');
    const target = targetName ? this.world.findByName(targetName, this, other, other) : null;
    if (!target) return;
    const landmarkName = this.kvString('landmark');
    const landmark = landmarkName ? this.world.findByName(landmarkName, this, other, other) : null;
    const d = this.dest;
    copy(d, target.origin);
    if (landmark) {
      d.x += other.origin.x - landmark.origin.x;
      d.y += other.origin.y - landmark.origin.y;
      d.z += other.origin.z - landmark.origin.z;
    }
    const keepAngles = !!landmark || this.hasSpawnFlags(SF_TELEPORT_PRESERVE_ANGLES);
    this.world.teleportEntity(other, d, keepAngles ? null : target.angles, null);
  }
}

registerEntityClass('trigger_multiple', TriggerMultiple);
registerEntityClass('trigger_once', TriggerOnce);
registerEntityClass('trigger_hurt', TriggerHurt);
registerEntityClass('trigger_push', TriggerPush);
registerEntityClass('trigger_teleport', TriggerTeleport);

// ─── TF trigger brushes ────────────────────────────────────────────────────

/** func_respawnroom: the team's spawn room (class changes are instant inside). */
export class FuncRespawnRoom extends BaseTrigger {
  active = true;
  originalTeam = 0;
  readonly visualizers: FuncRespawnRoomVisualizer[] = [];

  override spawn(): void {
    super.spawn();
    // Every player counts, whatever the spawnflags (CFuncRespawnRoom::Spawn adds SF_TRIGGER_ALLOW_ALL).
    this.spawnflags |= SF_TRIGGER_ALLOW_ALL;
    this.collisionGroup = TFCOLLISION_GROUP_RESPAWNROOMS;
  }

  override activate(): void {
    super.activate();
    this.originalTeam = this.team;
  }

  override wantsToucher(other: Entity): boolean {
    return other.isPlayer();
  }

  override startTouch(other: Entity): void {
    if (other.isPlayer() && !this.touching.includes(other)) {
      const p = other as Player;
      p.respawnTouchCount++;
      if (this.active && (this.team === TEAM_UNASSIGNED || this.team === p.team)) p.ownRespawnRoomCount++;
    }
    super.startTouch(other);
  }

  override endTouch(other: Entity): void {
    if (other.isPlayer() && this.touching.includes(other)) {
      const p = other as Player;
      p.respawnTouchCount = Math.max(0, p.respawnTouchCount - 1);
      if (this.active && (this.team === TEAM_UNASSIGNED || this.team === p.team)) {
        p.ownRespawnRoomCount = Math.max(0, p.ownRespawnRoomCount - 1);
      }
    }
    super.endTouch(other);
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.world.endAllTouches(this);
    this.active = active;
    for (const v of this.visualizers) v.setActive(active);
    this.world.resetTriggerTouches(this);
  }

  override changeTeam(team: number): void {
    this.world.endAllTouches(this);
    super.changeTeam(team);
    for (const v of this.visualizers) v.changeTeam(team);
    this.world.resetTriggerTouches(this);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'setactive':
        this.setActive(true);
        return true;
      case 'setinactive':
        this.setActive(false);
        return true;
      case 'toggleactive':
        this.setActive(!this.active);
        return true;
      case 'roundactivate': {
        // SDK: CFuncRespawnRoom::InputRoundActivate — unassigned rooms take the team of a spawn inside.
        if (this.originalTeam === TEAM_UNASSIGNED) {
          let team = TEAM_UNASSIGNED;
          this.world.forEachEntity((e) => {
            if (team === TEAM_UNASSIGNED && e.classname === 'info_player_teamspawn' && e.team > 1) {
              const disabled = (e as unknown as { disabled?: boolean }).disabled;
              if (!disabled && this.pointIsWithin(e.origin)) team = e.team;
            }
          });
          this.changeTeam(team);
        }
        return true;
      }
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/**
 * func_respawnroomvisualizer: the shimmering wall at a spawn room door, solid
 * to the enemies of the room's team (only for player movement), open in the
 * bonus round.
 */
export class FuncRespawnRoomVisualizer extends Entity {
  room: FuncRespawnRoom | null = null;
  solidToEnemies = true;
  active = true;

  override spawn(): void {
    super.spawn();
    this.solid = SOLID_BSP;
    this.solidToEnemies = this.kvBool('solid_to_enemies', true);
    this.collisionGroup = TFCOLLISION_GROUP_RESPAWNROOMS;
    this.updateContents();
  }

  override activate(): void {
    super.activate();
    this.linkRoom();
  }

  private linkRoom(): void {
    const name = this.kvString('respawnroomname');
    const r = name ? this.world.findByName(name) : null;
    if (r instanceof FuncRespawnRoom) {
      this.room = r;
      if (!r.visualizers.includes(this)) r.visualizers.push(this);
      this.changeTeam(r.team);
    }
  }

  /** SDK: CFuncRespawnRoomVisualizer::ShouldCollide — only player movement, only enemies (via the mask). */
  override shouldCollide(collisionGroup: number, contentsMask: number): boolean {
    if (this.world.rules.state === GR_STATE_TEAM_WIN) return false;
    if (this.team === TEAM_UNASSIGNED || !this.active || !this.solidToEnemies) return false;
    if (collisionGroup !== COLLISION_GROUP_PLAYER_MOVEMENT) return false;
    if (this.team === TF_TEAM_BLUE) return (contentsMask & CONTENTS_BLUETEAM) !== 0;
    if (this.team === TF_TEAM_RED) return (contentsMask & CONTENTS_REDTEAM) !== 0;
    return true;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.updateContents();
  }

  override changeTeam(team: number): void {
    super.changeTeam(team);
    this.updateContents();
  }

  /** Brush contents carry the team bit so only the enemy team's movement mask reaches the filter. */
  private updateContents(): void {
    if (this.bspModel <= 0) return;
    const solid = this.active && this.solidToEnemies && (this.team === TF_TEAM_RED || this.team === TF_TEAM_BLUE);
    this.world.setBrushContents(this, solid ? (this.team === TF_TEAM_BLUE ? CONTENTS_BLUETEAM : CONTENTS_REDTEAM) : 0);
    this.world.setBrushSolid(this, solid);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'roundactivate':
        this.linkRoom();
        return true;
      case 'setsolid':
        this.solidToEnemies = (parseInt(value, 10) || 0) !== 0;
        this.updateContents();
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** func_regenerate: the resupply cabinet's volume. */
export class FuncRegenerate extends BaseTrigger {
  associatedModel: Entity | null = null;

  override spawn(): void {
    super.spawn();
    this.spawnflags |= SF_TRIGGER_ALLOW_CLIENTS;
  }

  override activate(): void {
    super.activate();
    const name = this.kvString('associatedmodel');
    this.associatedModel = name ? this.world.findByName(name) : null;
  }

  /** SDK: CRegenerateZone::Touch. */
  override touch(other: Entity): void {
    if (this.disabled || !other.isPlayer()) return;
    const p = other as Player;
    if (!p.alive) return;
    const world = this.world;
    if (p.nextRegenTime > world.curtime) return;
    if (p.cond.has(TF_COND.TAUNTING)) return;
    const rules = world.rules;
    if (rules.state !== GR_STATE_TEAM_WIN) {
      if (this.team && p.team !== this.team) return;
    } else if (rules.winningTeam !== p.team) return;
    if (rules.inStalemate()) return;
    this.regenerate(p);
  }

  /** SDK: CRegenerateZone::Regenerate. */
  regenerate(p: Player): void {
    const world = this.world;
    p.regenerate();
    p.nextRegenTime = world.curtime + TF_REGENERATE_NEXT_USE_TIME;
    world.emitSound('Regenerate.Touch', { entity: p.id, to: p.id });
    if (this.associatedModel) {
      this.associatedModel.acceptInput('SetAnimation', 'open', this, this);
      world.io.addEventTo(this.associatedModel, 'SetAnimation', 'close', TF_REGENERATE_NEXT_USE_TIME - 1, this, this);
    }
  }
}

/** func_nobuild: buildings can't be placed inside (the buildings module queries `world.inNoBuildZone`). */
export class FuncNoBuild extends BaseTrigger {
  allowSentry = false;
  allowDispenser = false;
  allowTeleporters = false;

  override spawn(): void {
    super.spawn();
    this.allowSentry = this.kvBool('AllowSentry');
    this.allowDispenser = this.kvBool('AllowDispenser');
    this.allowTeleporters = this.kvBool('AllowTeleporters');
  }

  override wantsToucher(): boolean {
    return false;
  }

  /** SDK: CFuncNoBuild::PreventsBuildOf (objectType: OBJ_*). */
  preventsBuildOf(objectType: number): boolean {
    if (objectType === 2) return !this.allowSentry;
    if (objectType === 0) return !this.allowDispenser;
    if (objectType === 1) return !this.allowTeleporters;
    return true;
  }
}

registerEntityClass('func_respawnroom', FuncRespawnRoom);
registerEntityClass('func_respawnroomvisualizer', FuncRespawnRoomVisualizer);
registerEntityClass('func_regenerate', FuncRegenerate);
registerEntityClass('func_nobuild', FuncNoBuild);
