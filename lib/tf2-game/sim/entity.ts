/**
 * The base entity (the SDK's CBaseEntity, server side): identity, transform,
 * bounds, solidity, team, health, think scheduling, touch, I/O, and the
 * network record. Every simulated thing — players, projectiles, triggers,
 * pickups, buildings, map logic — extends it.
 *
 * Map entities are built in three steps like the engine's
 * MapEntity_ParseAllEntities: construct (by classname, see
 * entity-registry.ts), `applyKeyValues()` from the entity lump, `spawn()`.
 * After every map entity has spawned the world calls `activate()` on each.
 */

import { NO_ENTITY } from '../core/types';
import { copy, vec3, type Vec3 } from '../core/vec';
import { MOVETYPE_NONE } from '../core/constants';
import type { BspEntity } from '../formats/keyvalues';
import { EntityOutput, parseAddOutput, parseOutputAction } from './io';
import { NET_BRUSH, NET_ENTITY, type NetRecord, type NetSchema } from './net-schema';
import type { DamageInfo } from './damage';
import type { GameWorld } from './world';

// ─── Solidity (const.h SolidType_t / SolidFlags_t) ─────────────────────────
export const SOLID_NONE = 0;
export const SOLID_BSP = 1;
export const SOLID_BBOX = 2;
export const SOLID_OBB = 3;
export const SOLID_VPHYSICS = 6;

export const FSOLID_NOT_SOLID = 0x0004;
export const FSOLID_TRIGGER = 0x0008;
export const FSOLID_NOT_STANDABLE = 0x0010;

// ─── Effects (const.h EF_*) ─────────────────────────────────────────────────
export const EF_BONEMERGE = 0x001;
export const EF_NOINTERP = 0x008;
export const EF_NOSHADOW = 0x010;
export const EF_NODRAW = 0x020;
export const EF_ITEM_BLINK = 0x100;

// ─── Damage reception (DAMAGE_*) ────────────────────────────────────────────
export const DAMAGE_NO = 0;
export const DAMAGE_EVENTS_ONLY = 1;
export const DAMAGE_YES = 2;
export const DAMAGE_AIM = 3;

// ─── Move types missing from core/constants (MoveType_t) ───────────────────
export const MOVETYPE_STEP = 3;
export const MOVETYPE_VPHYSICS = 6;
export const MOVETYPE_PUSH = 7;

// ─── MoveCollide_t ──────────────────────────────────────────────────────────
export const MOVECOLLIDE_DEFAULT = 0;
export const MOVECOLLIDE_FLY_BOUNCE = 1;
export const MOVECOLLIDE_FLY_CUSTOM = 2;
export const MOVECOLLIDE_FLY_SLIDE = 3;

// ─── Collision groups (const.h Collision_Group_t + tf_shareddefs.h) ────────
export const COLLISION_GROUP_NONE = 0;
export const COLLISION_GROUP_DEBRIS = 1;
export const COLLISION_GROUP_DEBRIS_TRIGGER = 2;
export const COLLISION_GROUP_INTERACTIVE_DEBRIS = 3;
export const COLLISION_GROUP_INTERACTIVE = 4;
export const COLLISION_GROUP_PLAYER = 5;
export const COLLISION_GROUP_BREAKABLE_GLASS = 6;
export const COLLISION_GROUP_VEHICLE = 7;
export const COLLISION_GROUP_PLAYER_MOVEMENT = 8;
export const COLLISION_GROUP_NPC = 9;
export const COLLISION_GROUP_IN_VEHICLE = 10;
export const COLLISION_GROUP_WEAPON = 11;
export const COLLISION_GROUP_VEHICLE_CLIP = 12;
export const COLLISION_GROUP_PROJECTILE = 13;
export const COLLISION_GROUP_DOOR_BLOCKER = 14;
export const COLLISION_GROUP_PASSABLE_DOOR = 15;
export const COLLISION_GROUP_DISSOLVING = 16;
export const COLLISION_GROUP_PUSHAWAY = 17;
export const COLLISION_GROUP_NPC_ACTOR = 18;
export const COLLISION_GROUP_NPC_SCRIPTED = 19;
export const TF_COLLISIONGROUP_GRENADES = 20;
export const TFCOLLISION_GROUP_OBJECT = 21;
export const TFCOLLISION_GROUP_OBJECT_SOLIDTOPLAYERMOVEMENT = 22;
export const TFCOLLISION_GROUP_COMBATOBJECT = 23;
export const TFCOLLISION_GROUP_ROCKETS = 24;
export const TFCOLLISION_GROUP_RESPAWNROOMS = 25;
export const TFCOLLISION_GROUP_TANK = 26;
export const TFCOLLISION_GROUP_ROCKET_BUT_NOT_WITH_OTHER_ROCKETS = 27;

// ─── Render modes (const.h RenderMode_t) ────────────────────────────────────
export const RENDER_NORMAL = 0;
export const RENDER_TRANS_COLOR = 1;
export const RENDER_NONE = 10;

/** Entity flags beyond core/constants' FL_* subset (const.h names; bits chosen not to collide with that subset). */
export const FL_CLIENT = 1 << 8;
export const FL_FAKECLIENT = 1 << 20;
export const FL_OBJECT = 1 << 27;
export const FL_BASEVELOCITY = 1 << 23;

/** Life states (const.h LIFE_*). */
export const LIFE_ALIVE = 0;
export const LIFE_DYING = 1;
export const LIFE_DEAD = 2;
export const LIFE_RESPAWNABLE = 3;

/** True when the key looks like an output connection ("OnX" / "OutValue"). */
function isOutputKey(key: string, value: string): boolean {
  const k = key.toLowerCase();
  if (!(k.startsWith('on') || k.startsWith('out'))) return false;
  if (value.includes('\x1b')) return true;
  let commas = 0;
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 44) commas++;
  return commas >= 4;
}

const parseColor = (v: string): number => {
  const p = v.trim().split(/\s+/).map((n) => parseInt(n, 10) || 0);
  return ((p[0] & 255) << 16) | ((p[1] & 255) << 8) | (p[2] & 255);
};

export class Entity {
  /** Set when the entity is added to a world. */
  world!: GameWorld;
  /** Slot in `world.entities`; players use 1…MAX_PLAYERS. */
  id = 0;
  /** Bumped every time the slot is reused (the SDK's handle serial number). */
  serial = 0;
  /** Lower-case classname. */
  readonly classname: string;
  private _targetname = '';
  private _targetnameLower = '';

  readonly origin: Vec3 = vec3();
  readonly angles: Vec3 = vec3();
  readonly velocity: Vec3 = vec3();
  /** Velocity added by conveyors / trigger_push for one tick (FL_BASEVELOCITY). */
  readonly baseVelocity: Vec3 = vec3();
  /** Bounds relative to origin (WorldAlignMins/Maxs). */
  readonly mins: Vec3 = vec3();
  readonly maxs: Vec3 = vec3();

  team = 0;
  solid = SOLID_NONE;
  solidFlags = 0;
  collisionGroup = COLLISION_GROUP_NONE;
  /** CONTENTS_* a trace sees when it hits this entity's box. */
  contents = 0x1;
  moveType = MOVETYPE_NONE;
  moveCollide = MOVECOLLIDE_DEFAULT;
  /** Brush model index ("*N"), or -1. */
  bspModel = -1;
  /** Studio model path for the renderer ('' when none). */
  model = '';
  skin = 0;
  body = 0;
  modelScale = 1;
  renderMode = RENDER_NORMAL;
  renderAlpha = 255;
  renderColor = 0xffffff;
  flags = 0;
  effects = 0;
  health = 0;
  maxHealth = 0;
  takeDamage = DAMAGE_NO;
  /** Owner entity id (projectile → shooter, building → engineer). */
  owner: number = NO_ENTITY;
  /** Movement parent id (SetParent), NO_ENTITY when none. */
  parent: number = NO_ENTITY;
  parentName = '';
  /** Offset from the parent's origin while parented. */
  readonly parentOffset: Vec3 = vec3();
  /** curtime at which `think()` runs next; -1 = never. */
  nextThink = -1;
  /** Optional think function (SetThink); `think()` calls it by default. */
  thinkFn: (() => void) | null = null;
  spawnflags = 0;
  gravity = 1;
  friction = 1;
  elasticity = 1;
  /** Ground entity id while resting on something. */
  groundEntity: number = NO_ENTITY;
  /** Raw lump keys (null for entities created at runtime). */
  kv: BspEntity | null = null;
  readonly outputs = new Map<string, EntityOutput>();
  /** Set by world.remove(); the slot frees on the next tick boundary. */
  removed = false;
  /** curtime when the entity was created. */
  spawnTime = 0;
  /** Map entities are re-created on full round restarts unless preserved. */
  fromMap = false;
  /** Survives CleanUpMap (players, rules proxies, team entities). */
  preserved = false;

  constructor(classname: string) {
    this.classname = classname.toLowerCase();
  }

  get targetname(): string {
    return this._targetname;
  }

  set targetname(v: string) {
    this._targetname = v;
    this._targetnameLower = v.toLowerCase();
  }

  get targetnameLower(): string {
    return this._targetnameLower;
  }

  get alive(): boolean {
    return !this.removed;
  }

  isPlayer(): boolean {
    return false;
  }

  /** CBaseObject — buildings override. */
  isBaseObject(): boolean {
    return false;
  }

  isSolid(): boolean {
    return this.solid !== SOLID_NONE && (this.solidFlags & FSOLID_NOT_SOLID) === 0;
  }

  isTrigger(): boolean {
    return (this.solidFlags & FSOLID_TRIGGER) !== 0;
  }

  inSameTeam(other: Entity | null): boolean {
    return !!other && this.team !== 0 && this.team === other.team;
  }

  hasSpawnFlags(f: number): boolean {
    return (this.spawnflags & f) !== 0;
  }

  // ─── Keyvalues & spawning ────────────────────────────────────────────────

  /**
   * Applies the lump's keys. Standard keys are handled here (CBaseEntity::
   * KeyValue); outputs are parsed generically; subclasses read their own
   * keys from `this.kv` in `spawn()` or override `keyValue`.
   */
  applyKeyValues(kv: BspEntity): void {
    this.kv = kv;
    this.fromMap = true;
    for (const [k, v] of kv.props) {
      if (isOutputKey(k, v)) {
        this.output(k).add(parseOutputAction(v));
        continue;
      }
      this.keyValue(k.toLowerCase(), v);
    }
  }

  /** Handles one key (lower-case). Return true when consumed. */
  keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'targetname':
        this.targetname = value;
        return true;
      case 'origin': {
        const p = value.trim().split(/\s+/).map(Number);
        this.origin.x = p[0] || 0;
        this.origin.y = p[1] || 0;
        this.origin.z = p[2] || 0;
        return true;
      }
      case 'angles': {
        const p = value.trim().split(/\s+/).map(Number);
        this.angles.x = p[0] || 0;
        this.angles.y = p[1] || 0;
        this.angles.z = p[2] || 0;
        return true;
      }
      case 'angle': {
        const y = parseFloat(value);
        if (y === -1) this.angles.x = -90;
        else if (y === -2) this.angles.x = 90;
        else this.angles.y = Number.isFinite(y) ? y : 0;
        return true;
      }
      case 'model':
        if (value.startsWith('*')) this.bspModel = parseInt(value.slice(1), 10) || 0;
        else this.model = value;
        return true;
      case 'skin':
        this.skin = parseInt(value, 10) || 0;
        return true;
      case 'body':
        this.body = parseInt(value, 10) || 0;
        return true;
      case 'spawnflags':
        this.spawnflags = parseInt(value, 10) || 0;
        return true;
      case 'teamnum':
        this.team = parseInt(value, 10) || 0;
        return true;
      case 'parentname':
        this.parentName = value;
        return true;
      case 'rendermode':
        this.renderMode = parseInt(value, 10) || 0;
        return true;
      case 'renderamt':
        this.renderAlpha = Math.max(0, Math.min(255, parseInt(value, 10) || 0));
        return true;
      case 'rendercolor':
        this.renderColor = parseColor(value);
        return true;
      case 'health':
        this.health = parseInt(value, 10) || 0;
        return true;
      case 'max_health':
        this.maxHealth = parseInt(value, 10) || 0;
        return true;
      case 'modelscale':
        this.modelScale = parseFloat(value) || 1;
        return true;
      case 'gravity':
        this.gravity = parseFloat(value) || 0;
        return true;
      case 'effects':
        this.effects = parseInt(value, 10) || 0;
        return true;
      default:
        return false;
    }
  }

  kvString(key: string, fallback = ''): string {
    return this.kv?.get(key) ?? fallback;
  }

  kvNumber(key: string, fallback = 0): number {
    return this.kv ? this.kv.getNumber(key, fallback) : fallback;
  }

  kvBool(key: string, fallback = false): boolean {
    const v = this.kv?.get(key);
    if (v === undefined) return fallback;
    return (parseInt(v, 10) || 0) !== 0;
  }

  /** Called once after keyvalues; set up solidity, models, thinks. */
  spawn(): void {
    // Brush entities pick up their model's bounds from the collision world.
    if (this.bspModel > 0) this.world.applyBrushModelBounds(this);
  }

  /** Called after every map entity has spawned (CBaseEntity::Activate). Resolve names here. */
  activate(): void {
    if (this.parentName !== '') {
      const p = this.world.findByName(this.parentName);
      if (p) this.setParent(p);
    }
  }

  /** Runs when nextThink comes due. Default: the think function, if any. */
  think(): void {
    const fn = this.thinkFn;
    if (fn) fn.call(this);
  }

  setThink(fn: (() => void) | null, at: number): void {
    this.thinkFn = fn;
    this.nextThink = fn ? at : -1;
  }

  /** SDK: SUB_Remove. */
  readonly subRemove = (): void => {
    this.world.remove(this);
  };

  /** Touch callbacks (the engine's PhysicsTouchTriggers / PhysicsImpact). */
  startTouch(_other: Entity): void {}
  touch(_other: Entity): void {}
  endTouch(_other: Entity): void {}

  /** Called when the entity is removed from the world. */
  onRemove(): void {}

  // ─── Damage ──────────────────────────────────────────────────────────────

  /**
   * SDK: CBaseEntity::OnTakeDamage. Returns the damage actually taken
   * (0 when ignored). Subclasses (players, buildings, breakables) override.
   */
  onTakeDamage(info: DamageInfo): number {
    if (this.takeDamage === DAMAGE_NO || this.takeDamage === DAMAGE_EVENTS_ONLY) return 0;
    const amount = info.damage;
    this.health -= amount;
    if (this.health <= 0) this.onKilled(info);
    return amount;
  }

  /** SDK: CBaseEntity::Event_Killed. */
  onKilled(_info: DamageInfo): void {
    this.takeDamage = DAMAGE_NO;
    this.world.remove(this);
  }

  /** SDK: CBaseEntity::TakeHealth. Returns the amount actually given. */
  takeHealth(amount: number, _damageType = 0): number {
    if (this.takeDamage === DAMAGE_NO) return 0;
    const max = this.maxHealth > 0 ? this.maxHealth : Infinity;
    const before = this.health;
    this.health = Math.min(max, this.health + amount);
    return this.health - before;
  }

  // ─── Collision ───────────────────────────────────────────────────────────

  /**
   * SDK: CBaseEntity::ShouldCollide — the entity's half of the collision
   * rules (the game rules' ShouldCollide is the other half).
   */
  shouldCollide(_collisionGroup: number, _contentsMask: number): boolean {
    return true;
  }

  worldSpaceCenter(out: Vec3): Vec3 {
    out.x = this.origin.x + (this.mins.x + this.maxs.x) * 0.5;
    out.y = this.origin.y + (this.mins.y + this.maxs.y) * 0.5;
    out.z = this.origin.z + (this.mins.z + this.maxs.z) * 0.5;
    return out;
  }

  /** CollisionProp()->CalcNearestPoint: the point of the box closest to `p`. */
  nearestPoint(p: Vec3, out: Vec3): Vec3 {
    out.x = Math.min(Math.max(p.x, this.origin.x + this.mins.x), this.origin.x + this.maxs.x);
    out.y = Math.min(Math.max(p.y, this.origin.y + this.mins.y), this.origin.y + this.maxs.y);
    out.z = Math.min(Math.max(p.z, this.origin.z + this.mins.z), this.origin.z + this.maxs.z);
    return out;
  }

  setSize(mins: Vec3, maxs: Vec3): void {
    copy(this.mins, mins);
    copy(this.maxs, maxs);
  }

  /** SDK: CBaseEntity::Teleport. */
  teleport(origin: Vec3 | null, angles: Vec3 | null, velocity: Vec3 | null): void {
    if (origin) copy(this.origin, origin);
    if (angles) copy(this.angles, angles);
    if (velocity) copy(this.velocity, velocity);
    this.effects |= EF_NOINTERP;
    this.groundEntity = NO_ENTITY;
  }

  setParent(parent: Entity | null): void {
    if (!parent) {
      this.parent = NO_ENTITY;
      return;
    }
    this.parent = parent.id;
    this.parentOffset.x = this.origin.x - parent.origin.x;
    this.parentOffset.y = this.origin.y - parent.origin.y;
    this.parentOffset.z = this.origin.z - parent.origin.z;
  }

  // ─── I/O ─────────────────────────────────────────────────────────────────

  /** The named output, created on first use (case-insensitive). */
  output(name: string): EntityOutput {
    const k = name.toLowerCase();
    let o = this.outputs.get(k);
    if (!o) {
      o = new EntityOutput(name);
      this.outputs.set(k, o);
    }
    return o;
  }

  /** Fires an output if anything is connected to it. */
  fireOutput(name: string, activator: Entity | null, value = '', delay = 0): void {
    const o = this.outputs.get(name.toLowerCase());
    if (o && o.connected) o.fire(this.world.io, activator, this, value, delay);
  }

  /**
   * SDK: CBaseEntity::AcceptInput. The base handles the inputs every entity
   * has; subclasses handle theirs first and call super for the rest.
   * Returns true when the input was handled.
   */
  acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'kill':
        this.world.remove(this);
        return true;
      case 'killhierarchy':
        this.world.forEachEntity((e) => {
          if (e.parent === this.id) e.acceptInput('KillHierarchy', '', activator, caller);
        });
        this.world.remove(this);
        return true;
      case 'addoutput': {
        const parsed = parseAddOutput(value);
        if (parsed) this.output(parsed.output).add(parsed.action);
        else {
          const sp = value.indexOf(' ');
          if (sp > 0) this.keyValue(value.slice(0, sp).toLowerCase(), value.slice(sp + 1).trim());
        }
        return true;
      }
      case 'fireuser1':
        this.fireOutput('OnUser1', activator);
        return true;
      case 'fireuser2':
        this.fireOutput('OnUser2', activator);
        return true;
      case 'fireuser3':
        this.fireOutput('OnUser3', activator);
        return true;
      case 'fireuser4':
        this.fireOutput('OnUser4', activator);
        return true;
      case 'setparent': {
        const p = value === '' ? null : this.world.findByName(value, this, activator, caller);
        this.setParent(p);
        return true;
      }
      case 'clearparent':
        this.setParent(null);
        return true;
      case 'setteam':
      case 'setteamnum':
        this.changeTeam(parseInt(value, 10) || 0);
        return true;
      case 'alpha':
        this.renderAlpha = Math.max(0, Math.min(255, parseInt(value, 10) || 0));
        return true;
      case 'color':
        this.renderColor = parseColor(value);
        return true;
      case 'disabledraw':
        this.effects |= EF_NODRAW;
        return true;
      case 'enabledraw':
        this.effects &= ~EF_NODRAW;
        return true;
      case 'skin':
        this.skin = parseInt(value, 10) || 0;
        return true;
      case 'sethealth':
        this.health = parseInt(value, 10) || 0;
        return true;
      case 'addhealth':
        this.health += parseInt(value, 10) || 0;
        return true;
      case 'removehealth':
        this.health -= parseInt(value, 10) || 0;
        return true;
      default:
        return false;
    }
  }

  /** SDK: CBaseEntity::ChangeTeam. */
  changeTeam(team: number): void {
    this.team = team;
  }

  // ─── Network ─────────────────────────────────────────────────────────────

  /**
   * The net type this entity sends, or null when it is not networked
   * (logic entities, invisible triggers). Brush entities send 'brush' so
   * moving doors render where they are.
   */
  netSchema(): NetSchema | null {
    if (this.bspModel > 0) return NET_BRUSH;
    if (this.model !== '' && (this.effects & EF_NODRAW) === 0) return NET_ENTITY;
    return null;
  }

  /** Fills the base fields; subclasses call super then add theirs. */
  writeNet(out: NetRecord): void {
    out.ox = this.origin.x;
    out.oy = this.origin.y;
    out.oz = this.origin.z;
    out.pitch = this.angles.x;
    out.yaw = this.angles.y;
    out.roll = this.angles.z;
    out.model = this.model;
    out.bspModel = this.bspModel;
    out.skin = this.skin;
    out.body = this.body;
    out.effects = this.effects;
    out.team = this.team;
    out.renderMode = this.renderMode;
    out.renderAlpha = this.renderAlpha;
    out.renderColor = this.renderColor;
    out.parent = this.parent;
    out.owner = this.owner;
    if ('solid' in out) out.solid = this.isSolid();
  }
}

/**
 * A point entity with no behaviour (info_target, info_teleport_destination,
 * unknown classnames). Kept so I/O and lookups that name it still resolve.
 */
export class PointEntity extends Entity {}
