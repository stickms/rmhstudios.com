/**
 * The game world: the engine's entity list and server frame plus the
 * services every entity uses (the SDK spreads this across CGlobalEntityList,
 * CServerGameDLL::GameFrame, IEngineTrace, CTFGameRules and the
 * lag-compensation manager).
 *
 * One `step()` is one server tick, in Source's order:
 *   1. each player's queued user commands (PlayerRunCommand; a tick with no
 *      command repeats the last one, at most MAX_CMDS_PER_TICK run);
 *      then each player's per-tick think (conditions, regen, afterburn);
 *   2. entity thinks and physics (MOVETYPE_FLY/FLYGRAVITY toss, parents);
 *   3. trigger touches (StartTouch / Touch / EndTouch);
 *   4. game rules (round state machine, respawn waves) and the mode;
 *   5. the entity I/O event queue;
 *   6. the lag-compensation history.
 *
 * Traces go through the composite collision world: the map (BSP brushes,
 * displacements, static props, brush entities — MapCollision) and then the
 * entities' boxes, with the TF collision rules (CTFGameRules::ShouldCollide
 * + each entity's ShouldCollide, team contents for player movement).
 */

import { UniformRandomStream } from '../core/random';
import {
  emptyTrace,
  emptyUserCmd,
  NO_ENTITY,
  WORLD_ENTITY,
  HITGROUP_GENERIC,
  type CollisionWorld,
  type TraceFilter,
  type TraceResult,
  type UserCmd,
} from '../core/types';
import {
  CONTENTS_HITBOX,
  CONTENTS_MONSTER,
  FL_ONGROUND,
  MASK_SHOT,
  MOVETYPE_NONE,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  SV_GRAVITY,
  TICK_INTERVAL,
} from '../core/constants';
import { angleVectors, copy, normalize, set, vec3, type Vec3 } from '../core/vec';
import type { BspEntity } from '../formats/keyvalues';
import {
  COLLISION_GROUP_BREAKABLE_GLASS,
  COLLISION_GROUP_DEBRIS,
  COLLISION_GROUP_DEBRIS_TRIGGER,
  COLLISION_GROUP_DISSOLVING,
  COLLISION_GROUP_DOOR_BLOCKER,
  COLLISION_GROUP_IN_VEHICLE,
  COLLISION_GROUP_INTERACTIVE,
  COLLISION_GROUP_INTERACTIVE_DEBRIS,
  COLLISION_GROUP_NONE,
  COLLISION_GROUP_NPC,
  COLLISION_GROUP_PASSABLE_DOOR,
  COLLISION_GROUP_PLAYER,
  COLLISION_GROUP_PLAYER_MOVEMENT,
  COLLISION_GROUP_PROJECTILE,
  COLLISION_GROUP_PUSHAWAY,
  COLLISION_GROUP_VEHICLE,
  COLLISION_GROUP_VEHICLE_CLIP,
  COLLISION_GROUP_WEAPON,
  DAMAGE_NO,
  EF_NOINTERP,
  Entity,
  FL_BASEVELOCITY,
  FL_FAKECLIENT,
  LIFE_ALIVE,
  LIFE_DEAD,
  LIFE_DYING,
  SOLID_BBOX,
  SOLID_BSP,
  SOLID_NONE,
  FSOLID_NOT_SOLID,
  TF_COLLISIONGROUP_GRENADES,
  TFCOLLISION_GROUP_COMBATOBJECT,
  TFCOLLISION_GROUP_RESPAWNROOMS,
  TFCOLLISION_GROUP_ROCKET_BUT_NOT_WITH_OTHER_ROCKETS,
  TFCOLLISION_GROUP_ROCKETS,
} from './entity';
import { createEntity } from './entity-registry';
import type { SimEvent, EffectEvent } from './events';
import { IoSystem, type IoHost } from './io';
import { Player, MAX_CMDS_PER_TICK, TF_DEATH_ANIMATION_TIME } from './player';
import { GameRules, type GameMode, type RulesOptions } from './rules';
import { SpawnSystem } from './spawn';
import { LagCompensation } from './lagcomp';
import { BaseProjectile, isTossMoveType, physicsToss } from './physics';
import { radiusDamage, createDamageInfo, copyDamageInfo, type DamageInfo, type RadiusDamageInfo } from './damage';
import { createHitboxTraceResult, traceHitboxSet } from './hitboxes';
import type { FireBulletsParams, SoundOptions, SpawnProjectileParams, WeaponHost } from './weapon-api';
import type { NetSchema } from './net-schema';
import { BaseObject } from './building-api';
import type { MapCollision } from '../world/map-collision';
import type { LoadedMap } from './map-loader';
// Entity classes register themselves on import.
import './triggers';
import './pickups';
import './logic';

/** Player entity ids are 1…MAX_PLAYERS. */
export const MAX_PLAYERS = 32;
/** Seconds before a freed entity slot may be reused (handle serial safety). */
export const ENTITY_SLOT_REUSE_DELAY = 1.0;
/** coordsize.h DIST_EPSILON. */
const DIST_EPSILON = 0.03125;

/** Entities a trigger can register as a touch volume (triggers, pickups, dropped packs). */
export interface TouchVolume {
  readonly id: number;
  removed: boolean;
  disabled?: boolean;
  wantsToucher(other: Entity): boolean;
  touchesBox(mins: Vec3, maxs: Vec3): boolean;
  startTouch(other: Entity): void;
  touch(other: Entity): void;
  endTouch(other: Entity): void;
}

export interface GameWorldOptions {
  /** Seed for the server's random stream (core/random.ts). */
  seed: number;
  friendlyFire: boolean;
  /** tf_preround_push_from_damage_enable (0). */
  preroundPushFromDamage: boolean;
  /** False for a predicting client: no authoritative damage, spawning or events. */
  isServer: boolean;
  /** sv_unlag. */
  lagCompensation: boolean;
  rules: Partial<RulesOptions>;
}

export interface GameWorldInit {
  /** A loaded map (map-loader.ts). Omit to supply `collision` directly (tests). */
  map?: LoadedMap | null;
  /** The map's collision world when there is no LoadedMap (e.g. the BoxWorld test fixture). */
  collision?: CollisionWorld;
  /** Entity lump to spawn when there is no LoadedMap. */
  entities?: readonly BspEntity[];
  mode?: GameMode | null;
  options?: Partial<GameWorldOptions>;
  /**
   * The tick the world starts on (a level change keeps the match's tick count running, so clients'
   * clocks and acknowledgements carry on across it). Default 0.
   */
  startTick?: number;
}

const defaultOptions = (): GameWorldOptions => ({
  seed: 1,
  friendlyFire: false,
  preroundPushFromDamage: false,
  isServer: true,
  lagCompensation: true,
  rules: {},
});

/** Classes CleanUpMap never re-creates (s_PreserveEnts + the world). */
const PRESERVED_CLASSNAMES = new Set([
  'worldspawn',
  'player',
  'tf_gamerules',
  'tf_team',
  'tf_team_manager',
  'tf_player_manager',
  'tf_objective_resource',
  'keyframe_rope',
  'move_rope',
  'tf_logic_training',
  'tf_logic_training_mode',
  'tf_logic_bonusround',
  'tf_logic_medieval',
  'tf_logic_cp_timer',
  'vote_controller',
  'monster_resource',
  'entity_rocket',
  'entity_carrier',
  'entity_sign',
  'entity_saucer',
  'entity_soldier_statue',
]);

/**
 * SDK: CTFGameRules::ShouldCollide over CGameRules::ShouldCollide — the
 * group-pair half of the collision rules.
 */
export function shouldCollideGroups(g0: number, g1: number): boolean {
  if (g0 > g1) {
    const t = g0;
    g0 = g1;
    g1 = t;
  }
  // CTFGameRules
  if (g0 === COLLISION_GROUP_PLAYER_MOVEMENT && g1 === COLLISION_GROUP_WEAPON) return false;
  if (g0 === COLLISION_GROUP_PLAYER_MOVEMENT && g1 === COLLISION_GROUP_PROJECTILE) return false;
  const rocket = g1 === TFCOLLISION_GROUP_ROCKETS || g1 === TFCOLLISION_GROUP_ROCKET_BUT_NOT_WITH_OTHER_ROCKETS;
  if (g0 === COLLISION_GROUP_PLAYER && rocket) return true;
  if (g0 === COLLISION_GROUP_PLAYER_MOVEMENT && rocket) return false;
  if (g0 === COLLISION_GROUP_WEAPON && rocket) return false;
  if (g0 === TF_COLLISIONGROUP_GRENADES && rocket) return false;
  if (g0 === COLLISION_GROUP_PROJECTILE && rocket) return false;
  if (g0 === TFCOLLISION_GROUP_ROCKETS && g1 === TFCOLLISION_GROUP_ROCKET_BUT_NOT_WITH_OTHER_ROCKETS) return false;
  if (g0 === TFCOLLISION_GROUP_ROCKET_BUT_NOT_WITH_OTHER_ROCKETS && g1 === TFCOLLISION_GROUP_ROCKET_BUT_NOT_WITH_OTHER_ROCKETS) {
    return false;
  }
  if (g0 === COLLISION_GROUP_PLAYER && g1 === TF_COLLISIONGROUP_GRENADES) return false;
  if (g0 === COLLISION_GROUP_PLAYER_MOVEMENT && g1 === TF_COLLISIONGROUP_GRENADES) return false;
  if (g1 === TFCOLLISION_GROUP_RESPAWNROOMS) return g0 === COLLISION_GROUP_PLAYER || g0 === COLLISION_GROUP_PLAYER_MOVEMENT;
  if (g0 === TF_COLLISIONGROUP_GRENADES && g1 === TF_COLLISIONGROUP_GRENADES) return false;
  if (g0 === COLLISION_GROUP_PLAYER_MOVEMENT && g1 === TFCOLLISION_GROUP_COMBATOBJECT) return false;
  if (g0 === COLLISION_GROUP_PLAYER && g1 === TFCOLLISION_GROUP_COMBATOBJECT) return false;
  // CGameRules
  if ((g0 === COLLISION_GROUP_PLAYER || g0 === COLLISION_GROUP_PLAYER_MOVEMENT) && g1 === COLLISION_GROUP_PUSHAWAY) return false;
  if (g0 === COLLISION_GROUP_DEBRIS && g1 === COLLISION_GROUP_PUSHAWAY) return true;
  if (g0 === COLLISION_GROUP_IN_VEHICLE || g1 === COLLISION_GROUP_IN_VEHICLE) return false;
  if (g1 === COLLISION_GROUP_DOOR_BLOCKER && g0 !== COLLISION_GROUP_NPC) return false;
  if (g0 === COLLISION_GROUP_PLAYER && g1 === COLLISION_GROUP_PASSABLE_DOOR) return false;
  if (g0 === COLLISION_GROUP_DEBRIS || g0 === COLLISION_GROUP_DEBRIS_TRIGGER) return false;
  if ((g0 === COLLISION_GROUP_DISSOLVING || g1 === COLLISION_GROUP_DISSOLVING) && g0 !== COLLISION_GROUP_NONE) return false;
  if (g0 === COLLISION_GROUP_INTERACTIVE_DEBRIS && g1 === COLLISION_GROUP_INTERACTIVE_DEBRIS) return false;
  if (g0 === COLLISION_GROUP_INTERACTIVE_DEBRIS && (g1 === COLLISION_GROUP_PLAYER_MOVEMENT || g1 === COLLISION_GROUP_PLAYER)) {
    return false;
  }
  if (g0 === COLLISION_GROUP_BREAKABLE_GLASS && g1 === COLLISION_GROUP_BREAKABLE_GLASS) return false;
  if (g1 === COLLISION_GROUP_INTERACTIVE && g0 !== COLLISION_GROUP_NONE) return false;
  if (g1 === COLLISION_GROUP_PROJECTILE) {
    if (g0 === COLLISION_GROUP_DEBRIS || g0 === COLLISION_GROUP_WEAPON || g0 === COLLISION_GROUP_PROJECTILE) return false;
  }
  if (g1 === COLLISION_GROUP_WEAPON) {
    if (g0 === COLLISION_GROUP_VEHICLE || g0 === COLLISION_GROUP_PLAYER || g0 === COLLISION_GROUP_NPC) return false;
  }
  if (g0 === COLLISION_GROUP_VEHICLE_CLIP || g1 === COLLISION_GROUP_VEHICLE_CLIP) return g0 === COLLISION_GROUP_VEHICLE;
  return true;
}

/**
 * The standard trace filter (CTraceFilterSimple): skips the pass entity,
 * entities it owns and its owner, then applies the collision rules.
 */
export class EntityTraceFilter {
  pass: Entity | null = null;
  group = COLLISION_GROUP_NONE;
  /** Skip every entity on this team (CTraceFilterIgnoreTeammates); 0 = none. */
  ignoreTeam = 0;
  /** Skip all players (CTraceFilterIgnorePlayers). */
  ignorePlayers = false;
  private readonly world: GameWorld;
  readonly fn: TraceFilter;

  constructor(world: GameWorld) {
    this.world = world;
    this.fn = (id, mask) => this.shouldHit(id, mask);
  }

  set(pass: Entity | null, group: number): this {
    this.pass = pass;
    this.group = group;
    this.ignoreTeam = 0;
    this.ignorePlayers = false;
    return this;
  }

  shouldHit(id: number, mask: number): boolean {
    if (id === WORLD_ENTITY) return true;
    const e = this.world.entity(id);
    if (!e) return true;
    const pass = this.pass;
    if (pass) {
      if (e === pass) return false;
      if (e.owner === pass.id) return false;
      if (pass.owner === e.id) return false;
    }
    if (this.ignorePlayers && e.isPlayer()) return false;
    if (this.ignoreTeam && e.team === this.ignoreTeam && (e.isPlayer() || e.isBaseObject())) return false;
    if (!shouldCollideGroups(this.group, e.collisionGroup)) return false;
    return e.shouldCollide(this.group, mask);
  }
}

/** A worldspawn stand-in (entity 0). Exported for checkpoints (sim/checkpoint/catalog.ts names classes by export). */
export class WorldSpawn extends Entity {
  constructor() {
    super('worldspawn');
    this.preserved = true;
  }
}

const boxScratchMins = vec3();
const boxScratchMaxs = vec3();
const hbResult = createHitboxTraceResult();
const bulletFwd = vec3();
const bulletRight = vec3();
const bulletUp = vec3();
const bulletDir = vec3();
const bulletEnd = vec3();
const bulletTrace = emptyTrace();
const centerScratch = vec3();

export class GameWorld implements CollisionWorld, WeaponHost {
  readonly options: GameWorldOptions;
  readonly map: LoadedMap | null;
  /** The map half of collision (MapCollision, or a test fixture). */
  readonly mapCollision: CollisionWorld;
  /** The MapCollision when there is one (brush entity transforms, trigger volumes). */
  readonly brushes: MapCollision | null;
  readonly entities: (Entity | undefined)[] = [];
  readonly events: SimEvent[] = [];
  readonly io: IoSystem;
  readonly rules: GameRules;
  readonly spawns: SpawnSystem;
  readonly lagcomp: LagCompensation;
  /** The server's random stream (fall damage spread, ammo pack toss…). Never Math.random. */
  readonly random: UniformRandomStream;
  readonly worldEntity: Entity;
  curtime = 0;
  tickCount = 0;
  /**
   * sv_gravity (units/s²): what MOVETYPE_FLYGRAVITY entities fall by — pipes, stickies, syringes,
   * dropped packs — each times its own gravity scale (PhysicsAddGravityMove). Players read theirs
   * from their move parameters (the console sets both).
   */
  gravity = SV_GRAVITY;
  readonly frametime = TICK_INTERVAL;

  private readonly serials: number[] = [];
  private readonly freeSlots: Array<{ id: number; at: number }> = [];
  private nextId = MAX_PLAYERS + 1;
  private readonly bboxEntities: Entity[] = [];
  private readonly touchVolumes: TouchVolume[] = [];
  private readonly touchLinks = new Map<TouchVolume, Entity[]>();
  private readonly mapEntities: readonly BspEntity[];
  private readonly sharedStream = new UniformRandomStream(0);
  private readonly filterRing: EntityTraceFilter[];
  private filterRingIndex = 0;
  private readonly worldOnlyFilter: TraceFilter;
  private readonly touchMins = vec3();
  private readonly touchMaxs = vec3();
  private readonly touchCandidates: Entity[] = [];
  private firstRound = true;
  /** Each brush model's solidity as MapCollision placed it (restored when CleanUpMap re-creates its entity). */
  private initialModelSolid: Uint8Array = new Uint8Array(0);
  private inTouchPass = false;
  private readonly pendingUnregister: TouchVolume[] = [];

  constructor(init: GameWorldInit = {}) {
    if (init.startTick && init.startTick > 0) {
      this.tickCount = Math.floor(init.startTick);
      this.curtime = this.tickCount * TICK_INTERVAL;
    }
    this.options = { ...defaultOptions(), ...init.options };
    this.map = init.map ?? null;
    const collision = this.map ? this.map.collision : init.collision;
    if (!collision) throw new Error('GameWorld needs a map or a collision world');
    this.mapCollision = collision;
    this.brushes = this.map ? this.map.collision : null;
    this.mapEntities = this.map ? this.map.entities : (init.entities ?? []);
    this.random = new UniformRandomStream(this.options.seed);
    this.io = new IoSystem(this.ioHost());
    this.rules = this.createRules(this.options.rules);
    this.rules.mode = init.mode ?? null;
    this.spawns = this.createSpawnSystem();
    this.lagcomp = new LagCompensation(this);
    this.lagcomp.enabled = this.options.lagCompensation;
    this.filterRing = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new EntityTraceFilter(this));
    this.worldOnlyFilter = (id) => {
      const e = this.entity(id);
      return !e || (!e.isPlayer() && !(e instanceof BaseProjectile));
    };
    if (this.brushes) {
      const n = this.brushes.modelCount;
      this.initialModelSolid = new Uint8Array(n);
      for (let i = 1; i < n; i++) this.initialModelSolid[i] = this.brushes.isModelSolid(i) ? 1 : 0;
    }
    this.worldEntity = new WorldSpawn();
    this.addEntityAt(this.worldEntity, 0);
    this.spawnMapEntities();
    this.rules.mode?.init?.(this.rules);
  }

  /**
   * The game rules this world runs (TF2's round machine). Another game on the engine overrides it
   * (lib/csgo-game's CsGameRules). Called from the constructor: it must not read subclass fields.
   */
  protected createRules(options: Partial<RulesOptions>): GameRules {
    return new GameRules(this, options);
  }

  /** The spawn-point service (TF2's info_player_teamspawn rules); overridable like `createRules`. */
  protected createSpawnSystem(): SpawnSystem {
    return new SpawnSystem(this);
  }

  /** A new player entity for `addPlayer` (TF2's Player; another game's world makes its own). */
  protected createPlayer(name: string): Player {
    return new Player(name);
  }

  private ioHost(): IoHost {
    return {
      now: () => this.curtime,
      forEachEntity: (fn: (e: Entity) => void) => this.forEachEntity(fn),
      firstPlayer: () => this.firstPlayer(),
    };
  }

  /** Installs (or replaces) the game mode and runs its init. */
  setMode(mode: GameMode | null): void {
    this.rules.mode = mode;
    mode?.init?.(this.rules);
  }

  get isServer(): boolean {
    return this.options.isServer;
  }

  tickToTime(tick: number): number {
    return tick * TICK_INTERVAL;
  }

  // ─── Entity list ─────────────────────────────────────────────────────────

  entity(id: number): Entity | null {
    if (id < 0) return null;
    const e = this.entities[id];
    return e && !e.removed ? e : null;
  }

  player(id: number): Player | null {
    const e = this.entity(id);
    return e && e.isPlayer() ? (e as Player) : null;
  }

  isPlayerId(id: number): boolean {
    return id >= 1 && id <= MAX_PLAYERS && !!this.entities[id] && !this.entities[id]!.removed;
  }

  /** Every live entity in id order. */
  forEachEntity(fn: (e: Entity) => void): void {
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && !e.removed) fn(e);
    }
  }

  forEachPlayer(fn: (p: Player) => void): void {
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = this.entities[i];
      if (e && !e.removed) fn(e as Player);
    }
  }

  players(): Player[] {
    const out: Player[] = [];
    this.forEachPlayer((p) => out.push(p));
    return out;
  }

  firstPlayer(): Entity | null {
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = this.entities[i];
      if (e && !e.removed) return e;
    }
    return null;
  }

  private addEntityAt(e: Entity, id: number): void {
    e.world = this;
    e.id = id;
    this.serials[id] = (this.serials[id] ?? 0) + 1;
    e.serial = this.serials[id];
    e.spawnTime = this.curtime;
    this.entities[id] = e;
    if (e.solid !== SOLID_NONE || e.isPlayer()) this.bboxEntities.push(e);
  }

  private allocateId(): number {
    const now = this.curtime;
    for (let i = 0; i < this.freeSlots.length; i++) {
      if (this.freeSlots[i].at <= now) {
        const id = this.freeSlots[i].id;
        this.freeSlots.splice(i, 1);
        return id;
      }
    }
    return this.nextId++;
  }

  /** Adds an entity (not spawned yet). Returns it. */
  add<T extends Entity>(e: T): T {
    this.addEntityAt(e, this.allocateId());
    return e;
  }

  /**
   * Creates, adds, initialises and spawns an entity by classname (the SDK's
   * CreateEntityByName + DispatchSpawn + Activate). `init` runs before spawn.
   */
  spawnEntity(classname: string, init?: (e: Entity) => void): Entity {
    const e = this.add(createEntity(classname));
    init?.(e);
    e.spawn();
    if (!e.removed) e.activate();
    if (!e.removed && e.solid !== SOLID_NONE && e.bspModel <= 0 && !this.bboxEntities.includes(e)) this.bboxEntities.push(e);
    return e;
  }

  /** Marks an entity removed (UTIL_Remove); its slot is reusable after ENTITY_SLOT_REUSE_DELAY. */
  remove(e: Entity): void {
    if (e.removed || e === this.worldEntity) return;
    e.removed = true;
    this.endTouchesOf(e);
    e.onRemove();
    if (e.bspModel > 0 && this.brushes) this.brushes.setModelSolid(e.bspModel, false);
    if (e.id > MAX_PLAYERS) this.freeSlots.push({ id: e.id, at: this.curtime + ENTITY_SLOT_REUSE_DELAY });
  }

  /** Finds the first entity with this targetname (procedural names allowed). */
  findByName(name: string, searching: Entity | null = null, activator: Entity | null = null, caller: Entity | null = null): Entity | null {
    const out: Entity[] = [];
    this.io.findByName(name, searching, activator, caller, out);
    return out[0] ?? null;
  }

  findAllByName(name: string): Entity[] {
    return this.io.findByName(name, null, null, null, []);
  }

  findAllByClassname(classname: string): Entity[] {
    return this.io.findByClassname(classname, []);
  }

  // ─── Map entities ────────────────────────────────────────────────────────

  /** MapEntity_ParseAllEntities: construct, keyvalues, spawn; then Activate everything. */
  private spawnMapEntities(): void {
    const created: Entity[] = [];
    for (const kv of this.mapEntities) {
      const cls = kv.classname.toLowerCase();
      if (cls === 'worldspawn') {
        this.worldEntity.kv = kv;
        continue;
      }
      if (cls === 'player' || cls === '') continue;
      const e = this.add(createEntity(cls));
      e.applyKeyValues(kv);
      created.push(e);
    }
    for (const e of created) if (!e.removed) e.spawn();
    for (const e of created) if (!e.removed) e.activate();
    this.rebuildBBoxList();
  }

  /**
   * SDK: CTeamplayRoundBasedRules::CleanUpMap — remove everything but players
   * and preserved entities, clear the event queue, re-create the map's
   * entities from the lump. Skipped on the very first round (just loaded).
   */
  cleanUpMap(): void {
    if (this.firstRound) {
      this.firstRound = false;
      return;
    }
    this.forEachEntity((e) => {
      if (e.isPlayer() || e.preserved || e === this.worldEntity) return;
      if (PRESERVED_CLASSNAMES.has(e.classname)) return;
      this.remove(e);
    });
    this.io.clear();
    // Entities are gone for good: their slots may be reused at once (AllowImmediateEdictReuse).
    for (const s of this.freeSlots) s.at = this.curtime;
    const created: Entity[] = [];
    for (const kv of this.mapEntities) {
      const cls = kv.classname.toLowerCase();
      if (cls === 'worldspawn' || cls === 'player' || PRESERVED_CLASSNAMES.has(cls)) continue;
      const e = this.add(createEntity(cls));
      e.applyKeyValues(kv);
      created.push(e);
    }
    for (const e of created) if (!e.removed) e.spawn();
    for (const e of created) if (!e.removed) e.activate();
    this.spawns.reset();
    this.rebuildBBoxList();
  }

  // ─── Players ─────────────────────────────────────────────────────────────

  /** Adds a player in the first free player slot. */
  addPlayer(name: string, opts: { bot?: boolean; userId?: string } = {}): Player {
    let id = -1;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = this.entities[i];
      if (!e || e.removed) {
        id = i;
        break;
      }
    }
    if (id < 0) throw new Error('server full');
    const p = this.createPlayer(name);
    p.isBot = !!opts.bot;
    if (p.isBot) p.flags |= FL_FAKECLIENT;
    p.userId = opts.userId;
    this.addEntityAt(p, id);
    p.attach();
    this.lagcomp.reset(id);
    return p;
  }

  /** A player leaves: dies without credit, their buildings go, the slot frees. */
  removePlayer(id: number): void {
    const p = this.player(id);
    if (!p) return;
    if (p.alive) p.commitSuicide();
    this.forEachEntity((e) => {
      if (e instanceof BaseObject && e.builder === id) e.detonate();
      else if (e.owner === id && e instanceof BaseProjectile) this.remove(e);
    });
    this.remove(p);
    this.lagcomp.reset(id);
  }

  /** Queues a user command for the next tick (from the network or a bot). */
  queueCommand(playerId: number, cmd: UserCmd): void {
    const p = this.player(playerId);
    if (p) p.pendingCmds.push(cmd);
  }

  // ─── The tick ────────────────────────────────────────────────────────────

  /** One server tick. `inputs` adds commands per player id before running. */
  step(inputs?: ReadonlyMap<number, readonly UserCmd[]> | null): void {
    this.tickCount++;
    this.curtime = this.tickCount * TICK_INTERVAL;
    this.rebuildBBoxList();
    if (inputs) for (const [id, cmds] of inputs) for (const c of cmds) this.queueCommand(id, c);

    // 1. Players: commands, then the per-tick think.
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = this.entities[i];
      if (!e || e.removed) continue;
      const p = e as Player;
      this.runPlayerCommands(p);
      if (p.removed) continue;
      p.flags &= ~FL_BASEVELOCITY;
      set(p.baseVelocity, 0, 0, 0);
      p.serverThink();
      if (p.lifeState === LIFE_DYING && this.curtime >= p.deathTime + TF_DEATH_ANIMATION_TIME) p.lifeState = LIFE_DEAD;
    }

    // 2. Thinks and physics.
    const list = this.entities;
    for (let i = MAX_PLAYERS + 1; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed) continue;
      if (e.nextThink >= 0 && e.nextThink <= this.curtime + 1e-9) {
        e.nextThink = -1;
        e.think();
        if (e.removed) continue;
      }
      if (e.parent !== NO_ENTITY) this.followParent(e);
      else if (isTossMoveType(e.moveType)) {
        e.flags &= ~FL_BASEVELOCITY;
        physicsToss(this, e, this.frametime);
        set(e.baseVelocity, 0, 0, 0);
      }
    }

    // 3. Trigger touches.
    this.updateTouches();

    // 4. Rules (and the mode).
    this.rules.think();

    // 5. I/O.
    this.io.service();

    // 6. Lag compensation history.
    this.lagcomp.record();
  }

  private runPlayerCommands(p: Player): void {
    const q = p.pendingCmds;
    if (q.length === 0) {
      const repeat = p.lastCmd;
      repeat.weaponSelect = 0;
      p.runCommand(repeat);
      return;
    }
    // Keep the newest commands when a burst arrives (bounded CPU per tick).
    const start = Math.max(0, q.length - MAX_CMDS_PER_TICK);
    for (let i = start; i < q.length && !p.removed; i++) p.runCommand(q[i]);
    q.length = 0;
  }

  private followParent(e: Entity): void {
    const parent = this.entity(e.parent);
    if (!parent) {
      e.parent = NO_ENTITY;
      return;
    }
    const pa = parent.angles;
    const pa0 = e.parentAnglesAtSet;
    if (pa.x === pa0.x && pa.y === pa0.y && pa.z === pa0.z) {
      e.origin.x = parent.origin.x + e.parentOffset.x;
      e.origin.y = parent.origin.y + e.parentOffset.y;
      e.origin.z = parent.origin.z + e.parentOffset.z;
    } else {
      // The parent turned since we were attached: carry the offset (and our angles) round with it.
      angleMatrixRows(pa0, followM0);
      angleMatrixRows(pa, followM1);
      const o = e.parentOffset;
      // local = M0ᵀ · offset; world = M1 · local.
      const lx = followM0[0] * o.x + followM0[3] * o.y + followM0[6] * o.z;
      const ly = followM0[1] * o.x + followM0[4] * o.y + followM0[7] * o.z;
      const lz = followM0[2] * o.x + followM0[5] * o.y + followM0[8] * o.z;
      e.origin.x = parent.origin.x + followM1[0] * lx + followM1[1] * ly + followM1[2] * lz;
      e.origin.y = parent.origin.y + followM1[3] * lx + followM1[4] * ly + followM1[5] * lz;
      e.origin.z = parent.origin.z + followM1[6] * lx + followM1[7] * ly + followM1[8] * lz;
      // Our rotation follows the parent's: R = M1 · M0ᵀ · R0 (MatrixAngles of the composition).
      angleMatrixRows(e.anglesAtSet, followM2);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          // (M0ᵀ · R0)[r][c]
          followM3[r * 3 + c] = followM0[r] * followM2[c] + followM0[3 + r] * followM2[3 + c] + followM0[6 + r] * followM2[6 + c];
        }
      }
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          followM2[r * 3 + c] = followM1[r * 3] * followM3[c] + followM1[r * 3 + 1] * followM3[3 + c] + followM1[r * 3 + 2] * followM3[6 + c];
        }
      }
      matrixAngles(followM2, e.angles);
    }
    if (e.bspModel > 0) this.syncBrushModel(e);
  }

  /** Rebuilds the list of box entities traces test (players, buildings, projectiles, pickups). */
  private rebuildBBoxList(): void {
    const l = this.bboxEntities;
    l.length = 0;
    const list = this.entities;
    for (let i = 1; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed || e.bspModel > 0) continue;
      if (e.solid !== SOLID_NONE || e.isPlayer()) l.push(e);
    }
  }

  // ─── Events and effects ──────────────────────────────────────────────────

  /** Takes the events produced since the last drain. */
  drainEvents(): SimEvent[] {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  emitSound(name: string, opts: SoundOptions = {}): void {
    if (!this.isServer) return;
    this.events.push({
      type: 'sound',
      name,
      entity: opts.entity,
      pos: opts.pos ? { x: opts.pos.x, y: opts.pos.y, z: opts.pos.z } : this.soundOrigin(opts.entity),
      volume: opts.volume,
      pitch: opts.pitch,
      channel: opts.channel ?? 0,
      notTo: opts.predictedBy,
      to: opts.to,
    });
  }

  /**
   * Where an entity's sound starts, sent with it (as Source's sound messages carry an origin): a
   * client that does not have the entity — out of its PVS, or a point entity that is never
   * networked — still attenuates it from there instead of playing it everywhere at full volume.
   * Players are in every snapshot, so their sounds go without (the client follows them anyway).
   */
  private soundOrigin(entity: number | undefined): Vec3 | undefined {
    if (!entity) return undefined;
    const e = this.entity(entity);
    if (!e || e.isPlayer()) return undefined;
    return e.worldSpaceCenter({ x: 0, y: 0, z: 0 });
  }

  emitEffect(effect: Omit<EffectEvent, 'type'>): void {
    if (!this.isServer) return;
    this.events.push({ type: 'effect', ...effect });
  }

  /** A seeded stream for this command (SharedRandomFloat). Reused; read before calling again. */
  sharedRandom(seed: number): UniformRandomStream {
    this.sharedStream.setSeed(seed);
    return this.sharedStream;
  }

  // ─── Collision ───────────────────────────────────────────────────────────

  /** A filter object owned by the caller (create once, reuse). */
  createEntityFilter(pass: Entity | null, group: number): TraceFilter {
    return new EntityTraceFilter(this).set(pass, group).fn;
  }

  /** A long-lived filter object (its `fn` is the TraceFilter). Keep the object, not just `fn`: a checkpoint rebuilds `fn` from it. */
  createEntityFilterObject(pass: Entity | null, group: number): EntityTraceFilter {
    return new EntityTraceFilter(this).set(pass, group);
  }

  /** A short-lived filter from a small ring (valid until 8 more are taken). */
  entityFilter(pass: Entity | null, group: number): TraceFilter {
    const f = this.filterRing[this.filterRingIndex];
    this.filterRingIndex = (this.filterRingIndex + 1) & 7;
    return f.set(pass, group).fn;
  }

  /** The ring filter object itself, for callers that tweak ignoreTeam/ignorePlayers. */
  entityFilterObject(pass: Entity | null, group: number): EntityTraceFilter {
    const f = this.filterRing[this.filterRingIndex];
    this.filterRingIndex = (this.filterRingIndex + 1) & 7;
    return f.set(pass, group);
  }

  /** CollisionWorld.traceHull: the map, then entity boxes. */
  traceHull(
    start: Vec3,
    end: Vec3,
    mins: Vec3,
    maxs: Vec3,
    mask: number,
    filter: TraceFilter | null,
    out: TraceResult,
  ): TraceResult {
    this.mapCollision.traceHull(start, end, mins, maxs, mask, filter, out);
    if (out.allSolid) return out;
    const list = this.bboxEntities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.removed || !e.isSolid() || e.isTrigger() || e.bspModel > 0) continue;
      if (!(e.contents & mask)) continue;
      if (filter && !filter(e.id, mask)) continue;
      this.clipToBox(e, start, end, mins, maxs, out);
      if (out.allSolid) break;
    }
    return out;
  }

  traceLine(start: Vec3, end: Vec3, mask: number, filter: TraceFilter | null, out: TraceResult): TraceResult {
    return this.traceHull(start, end, ZERO, ZERO, mask, filter, out);
  }

  pointContents(point: Vec3): number {
    return this.mapCollision.pointContents(point);
  }

  /** A line trace against the map and brush entities only (explosion line of sight). */
  traceLineWorldOnly(start: Vec3, end: Vec3, mask: number, out: TraceResult): TraceResult {
    return this.mapCollision.traceLine(start, end, mask, this.worldOnlyFilter, out);
  }

  /** CM_ClipBoxToBrush against an entity's axis-aligned box (Minkowski-expanded by the hull). */
  private clipToBox(e: Entity, start: Vec3, end: Vec3, mins: Vec3, maxs: Vec3, out: TraceResult): void {
    const bminX = e.origin.x + e.mins.x - maxs.x;
    const bminY = e.origin.y + e.mins.y - maxs.y;
    const bminZ = e.origin.z + e.mins.z - maxs.z;
    const bmaxX = e.origin.x + e.maxs.x - mins.x;
    const bmaxY = e.origin.y + e.maxs.y - mins.y;
    const bmaxZ = e.origin.z + e.maxs.z - mins.z;
    let enterFrac = -1;
    let leaveFrac = 1;
    let startOut = false;
    let getOut = false;
    let hitAxis = -1;
    let hitSign = 0;
    for (let plane = 0; plane < 6; plane++) {
      const axis = plane >> 1;
      const positive = (plane & 1) === 0;
      const s = axis === 0 ? start.x : axis === 1 ? start.y : start.z;
      const en = axis === 0 ? end.x : axis === 1 ? end.y : end.z;
      let d1: number;
      let d2: number;
      if (positive) {
        const dist = axis === 0 ? bmaxX : axis === 1 ? bmaxY : bmaxZ;
        d1 = s - dist;
        d2 = en - dist;
      } else {
        const dist = axis === 0 ? bminX : axis === 1 ? bminY : bminZ;
        d1 = dist - s;
        d2 = dist - en;
      }
      if (d2 > 0) getOut = true;
      if (d1 > 0) startOut = true;
      if (d1 > 0 && (d2 >= DIST_EPSILON || d2 >= d1)) return;
      if (d1 <= 0 && d2 <= 0) continue;
      if (d1 > d2) {
        const f = (d1 - DIST_EPSILON) / (d1 - d2);
        if (f > enterFrac) {
          enterFrac = f;
          hitAxis = axis;
          hitSign = positive ? 1 : -1;
        }
      } else {
        const f = (d1 + DIST_EPSILON) / (d1 - d2);
        if (f < leaveFrac) leaveFrac = f;
      }
    }
    if (!startOut) {
      out.startSolid = true;
      if (!getOut) out.allSolid = true;
      out.fraction = 0;
      out.entity = e.id;
      out.contents = e.contents;
      copy(out.endPos, start);
      return;
    }
    if (enterFrac < leaveFrac && enterFrac > -1 && enterFrac < out.fraction) {
      const f = enterFrac < 0 ? 0 : enterFrac;
      out.fraction = f;
      out.endPos.x = start.x + (end.x - start.x) * f;
      out.endPos.y = start.y + (end.y - start.y) * f;
      out.endPos.z = start.z + (end.z - start.z) * f;
      set(out.plane.normal, 0, 0, 0);
      if (hitAxis === 0) out.plane.normal.x = hitSign;
      else if (hitAxis === 1) out.plane.normal.y = hitSign;
      else out.plane.normal.z = hitSign;
      out.plane.dist =
        hitAxis === 0
          ? hitSign > 0
            ? bmaxX
            : -bminX
          : hitAxis === 1
            ? hitSign > 0
              ? bmaxY
              : -bminY
            : hitSign > 0
              ? bmaxZ
              : -bminZ;
      out.entity = e.id;
      out.contents = e.contents;
      out.surfaceFlags = 0;
      out.surfaceName = '';
      out.hitGroup = 0;
    }
  }

  /**
   * A hitscan trace: the map (MASK_SHOT, passing through the attacker), then
   * enemy players' hitboxes and other damageable boxes. Teammates are
   * skipped, as TF bullets pass through them. Lag-compensated when `cmdTick`
   * is given.
   */
  traceAttack(attacker: Player, start: Vec3, end: Vec3, out: TraceResult, cmdTick?: number): TraceResult {
    if (cmdTick !== undefined && !this.lagcomp.isRewinding) {
      return this.lagcomp.withRewind(attacker, cmdTick, () => this.traceAttackNow(attacker, start, end, out));
    }
    return this.traceAttackNow(attacker, start, end, out);
  }

  /**
   * `traceAttack` without lag compensation (the caller rewinds, if it wants to, around a whole
   * burst), with a game's own rules: `hitTeammates` tests teammates' hitboxes too (friendly fire,
   * CS:GO), `skip` passes through one more entity (a bullet that already went through it).
   */
  traceAttackWith(
    attacker: Player,
    start: Vec3,
    end: Vec3,
    out: TraceResult,
    opts: { hitTeammates?: boolean; skip?: number } = {},
  ): TraceResult {
    return this.traceAttackNow(attacker, start, end, out, opts.hitTeammates === true, opts.skip ?? NO_ENTITY);
  }

  private traceAttackNow(
    attacker: Player,
    start: Vec3,
    end: Vec3,
    out: TraceResult,
    hitTeammates = false,
    skip = NO_ENTITY,
  ): TraceResult {
    const f = this.entityFilterObject(attacker, COLLISION_GROUP_NONE);
    f.ignoreTeam = hitTeammates ? 0 : attacker.team;
    f.ignorePlayers = true;
    // Map + non-player boxes (buildings) first.
    this.traceHull(start, end, ZERO, ZERO, MASK_SHOT & ~CONTENTS_HITBOX, f.fn, out);
    out.hitGroup = HITGROUP_GENERIC;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    let best = out.fraction;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = this.entities[i];
      if (!e || e.removed || e === attacker || i === skip) continue;
      const p = e as Player;
      if (p.lifeState !== LIFE_ALIVE || (!hitTeammates && p.team === attacker.team)) continue;
      // Broad phase: the hull expanded a little (hitboxes poke out of it when animating).
      boxScratchMins.x = p.origin.x + p.mins.x - 8;
      boxScratchMins.y = p.origin.y + p.mins.y - 8;
      boxScratchMins.z = p.origin.z + p.mins.z - 4;
      boxScratchMaxs.x = p.origin.x + p.maxs.x + 8;
      boxScratchMaxs.y = p.origin.y + p.maxs.y + 8;
      boxScratchMaxs.z = p.origin.z + p.maxs.z + 12;
      if (!segmentHitsBox(start, dx, dy, dz, boxScratchMins, boxScratchMaxs, best)) continue;
      if (!traceHitboxSet(p.origin, p.eyeAngles.y, p.hitboxSet(), start, end, hbResult)) continue;
      if (hbResult.fraction >= best) continue;
      best = hbResult.fraction;
      out.fraction = best;
      out.endPos.x = start.x + dx * best;
      out.endPos.y = start.y + dy * best;
      out.endPos.z = start.z + dz * best;
      copy(out.plane.normal, hbResult.normal);
      out.entity = p.id;
      out.hitGroup = hbResult.group;
      out.contents = CONTENTS_HITBOX | CONTENTS_MONSTER;
      out.surfaceFlags = 0;
      out.surfaceName = 'flesh';
      out.startSolid = false;
      out.allSolid = false;
    }
    return out;
  }

  /**
   * SDK: FX_FireBullets + CTFPlayer::FireBullet. Spread from the command's
   * seed (one RandomSeed per bullet), damage accumulated per victim and
   * applied once (CDmgAccumulator / ApplyMultiDamage), all traced inside one
   * lag-compensation window.
   */
  fireBullets(params: FireBulletsParams): void {
    const attacker = params.attacker;
    const run = (): void => {
      angleVectors(params.angles, bulletFwd, bulletRight, bulletUp);
      const range = params.range ?? 8192;
      const n = Math.max(1, params.bulletsPerShot | 0);
      const victims = bulletVictims;
      victims.length = 0;
      for (let b = 0; b < n; b++) {
        const stream = this.sharedRandom(params.seed + b);
        let x = 0;
        let y = 0;
        let variance = 0.5;
        if (b === 0 && params.lastFireTime !== undefined) {
          const since = this.curtime - params.lastFireTime;
          if ((n > 1 && since > 0.25) || (n === 1 && since > 1.25)) variance = params.firstShotSpreadScale ?? 0;
        }
        if (variance !== 0) {
          x = stream.randomFloat(-variance, variance) + stream.randomFloat(-variance, variance);
          y = stream.randomFloat(-variance, variance) + stream.randomFloat(-variance, variance);
        }
        bulletDir.x = bulletFwd.x + x * params.spread * bulletRight.x + y * params.spread * bulletUp.x;
        bulletDir.y = bulletFwd.y + x * params.spread * bulletRight.y + y * params.spread * bulletUp.y;
        bulletDir.z = bulletFwd.z + x * params.spread * bulletRight.z + y * params.spread * bulletUp.z;
        normalize(bulletDir);
        bulletEnd.x = params.src.x + bulletDir.x * range;
        bulletEnd.y = params.src.y + bulletDir.y * range;
        bulletEnd.z = params.src.z + bulletDir.z * range;
        const tr = this.traceAttackNow(attacker, params.src, bulletEnd, bulletTrace);
        if (params.tracerFreq && b % params.tracerFreq === 0) {
          this.emitEffect({
            kind: 'tracer',
            pos: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z },
            start: { x: params.src.x, y: params.src.y, z: params.src.z },
            end: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z },
            entity: attacker.id,
            attachment: 'muzzle',
            notTo: attacker.isBot ? undefined : attacker.id,
          });
        }
        if (tr.fraction >= 1) continue;
        const victim = this.entity(tr.entity);
        if (victim && victim.takeDamage !== DAMAGE_NO && victim !== this.worldEntity) {
          let acc = victims.find((v) => v.entity === victim);
          if (!acc) {
            acc = takeBulletAccumulator(victims.length);
            acc.entity = victim;
            const info = acc.info;
            copyDamageInfo(info, EMPTY_INFO);
            info.attacker = attacker.id;
            info.inflictor = attacker.id;
            info.weaponId = params.weapon ? params.weapon.weaponId : 0;
            info.weaponDefIndex = params.weapon ? params.weapon.defindex : -1;
            info.killIcon = params.weapon ? params.weapon.killIcon : '';
            info.damageType = params.damageType;
            info.customKill = params.customKill;
            info.critType = params.critType;
            info.hitGroup = tr.hitGroup;
            copy(info.position, tr.endPos);
            copy(info.reportedPosition, params.src);
            victims.push(acc);
          }
          acc.info.damage += params.damage;
          acc.info.force.x += bulletDir.x * params.damage * 4;
          acc.info.force.y += bulletDir.y * params.damage * 4;
          acc.info.force.z += bulletDir.z * params.damage * 4;
          params.onHit?.(victim, tr, acc.info);
          if (victim.isPlayer()) {
            this.emitEffect({ kind: 'blood', pos: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z }, normal: { ...tr.plane.normal }, entity: victim.id });
          }
        } else {
          this.emitEffect({
            kind: 'impact',
            pos: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z },
            normal: { x: tr.plane.normal.x, y: tr.plane.normal.y, z: tr.plane.normal.z },
            material: tr.surfaceName,
          });
        }
      }
      if (!this.isServer) return;
      for (let i = 0; i < victims.length; i++) {
        const v = victims[i];
        if (!v.entity.removed) this.applyDamage(v.entity, v.info);
      }
    };
    if (params.cmdTick !== undefined && !this.lagcomp.isRewinding) this.lagcomp.withRewind(attacker, params.cmdTick, run);
    else run();
  }

  /** Spawns a projectile owned by a player (or entity). Null on a predicting client. */
  spawnProjectile(classname: string, params: SpawnProjectileParams): Entity | null {
    if (!this.isServer) return null;
    const owner = params.owner;
    return this.spawnEntity(classname, (e) => {
      copy(e.origin, params.origin);
      copy(e.angles, params.angles);
      copy(e.velocity, params.velocity);
      e.owner = owner.id;
      e.team = owner.team;
      if (e instanceof BaseProjectile) {
        e.damage = params.damage;
        e.critType = params.critType;
        e.launcher = params.weapon;
        e.launcherDefIndex = params.weapon ? params.weapon.defindex : -1;
        e.weaponId = params.weapon ? params.weapon.weaponId : 0;
        e.killIcon = params.weapon ? params.weapon.killIcon : classname;
      }
      const withExtra = e as Entity & { applyExtra?: (x: Readonly<Record<string, number | string | boolean>>) => void };
      if (params.extra && withExtra.applyExtra) withExtra.applyExtra(params.extra);
    });
  }

  /** SDK: CBaseEntity::TakeDamage → OnTakeDamage. Authoritative only. */
  applyDamage(victim: Entity, info: DamageInfo): number {
    if (!this.isServer || victim.removed) return 0;
    return victim.onTakeDamage(info);
  }

  radiusDamage(r: RadiusDamageInfo): void {
    if (!this.isServer) return;
    radiusDamage(this, r);
  }

  /** Entities whose box comes within `radius` of `center` and can take damage (CEntitySphereQuery). */
  entitiesInSphere(center: Vec3, radius: number, out: Entity[]): Entity[] {
    this.forEachEntity((e) => {
      if (e.takeDamage === DAMAGE_NO || e === this.worldEntity) return;
      if (e.isPlayer() && !e.alive) return;
      const minX = e.origin.x + e.mins.x - radius;
      const maxX = e.origin.x + e.maxs.x + radius;
      if (center.x < minX || center.x > maxX) return;
      const minY = e.origin.y + e.mins.y - radius;
      const maxY = e.origin.y + e.maxs.y + radius;
      if (center.y < minY || center.y > maxY) return;
      const minZ = e.origin.z + e.mins.z - radius;
      const maxZ = e.origin.z + e.maxs.z + radius;
      if (center.z < minZ || center.z > maxZ) return;
      out.push(e);
    });
    return out;
  }

  /** Reflected projectiles mini-crit (CTFBaseRocket::GetDeflected). */
  isDeflected(e: Entity): boolean {
    return e instanceof BaseProjectile && e.deflected > 0;
  }

  /** SDK: CBaseEntity::PhysicsImpact — both entities' Touch. */
  physicsImpact(mover: Entity, other: Entity, tr: TraceResult): void {
    if (mover instanceof BaseProjectile) {
      const t = mover.impactTrace;
      t.fraction = tr.fraction;
      copy(t.endPos, tr.endPos);
      copy(t.plane.normal, tr.plane.normal);
      t.plane.dist = tr.plane.dist;
      t.startSolid = tr.startSolid;
      t.allSolid = tr.allSolid;
      t.contents = tr.contents;
      t.surfaceFlags = tr.surfaceFlags;
      t.surfaceName = tr.surfaceName;
      t.entity = tr.entity;
      t.hitGroup = tr.hitGroup;
      if (other.isPlayer()) mover.enemy = other.id;
    }
    mover.touch(other);
    if (!other.removed && !mover.removed && other !== this.worldEntity) other.touch(mover);
  }

  anyPlayerInBox(mins: Vec3, maxs: Vec3, ignore: Entity | null): boolean {
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = this.entities[i];
      if (!e || e.removed || e === ignore || !(e as Player).alive) continue;
      if (
        mins.x < e.origin.x + e.maxs.x &&
        maxs.x > e.origin.x + e.mins.x &&
        mins.y < e.origin.y + e.maxs.y &&
        maxs.y > e.origin.y + e.mins.y &&
        mins.z < e.origin.z + e.maxs.z &&
        maxs.z > e.origin.z + e.mins.z
      ) {
        return true;
      }
    }
    return false;
  }

  // ─── Brush entities ──────────────────────────────────────────────────────

  /**
   * Gives a brush entity its model bounds, ties the model's hits to the
   * entity and restores the model's default solidity/contents (a re-created
   * entity after CleanUpMap starts like the map placed it).
   */
  applyBrushModelBounds(e: Entity): void {
    const b = this.brushes;
    if (!b || e.bspModel <= 0 || e.bspModel >= b.modelCount) return;
    const bounds = b.modelBounds(e.bspModel);
    e.setSize(bounds.mins, bounds.maxs);
    b.setModelEntity(e.bspModel, e.id);
    b.setModelTransform(e.bspModel, e.origin, ZERO);
    const solid = this.initialModelSolid[e.bspModel] === 1;
    b.setModelSolid(e.bspModel, solid);
    if (e.classname !== 'func_respawnroomvisualizer') b.setModelContents(e.bspModel, null);
    e.solid = SOLID_BSP;
    if (!solid) e.solidFlags |= FSOLID_NOT_SOLID;
  }

  /** Pushes a brush entity's current origin/angles into the collision model. */
  syncBrushModel(e: Entity): void {
    if (this.brushes && e.bspModel > 0) this.brushes.setModelTransform(e.bspModel, e.origin, e.angles);
  }

  setBrushSolid(e: Entity, solid: boolean): void {
    if (this.brushes && e.bspModel > 0) this.brushes.setModelSolid(e.bspModel, solid);
  }

  setBrushContents(e: Entity, contents: number | null): void {
    if (this.brushes && e.bspModel > 0) this.brushes.setModelContents(e.bspModel, contents);
  }

  boxTouchesBrushEntity(e: Entity, mins: Vec3, maxs: Vec3): boolean {
    if (this.brushes && e.bspModel > 0) return this.brushes.boxTouchesModel(e.bspModel, mins, maxs);
    return (
      mins.x < e.origin.x + e.maxs.x &&
      maxs.x > e.origin.x + e.mins.x &&
      mins.y < e.origin.y + e.maxs.y &&
      maxs.y > e.origin.y + e.mins.y &&
      mins.z < e.origin.z + e.maxs.z &&
      maxs.z > e.origin.z + e.mins.z
    );
  }

  pointInBrushEntity(e: Entity, p: Vec3): boolean {
    if (this.brushes && e.bspModel > 0) return this.brushes.pointInModel(e.bspModel, p);
    return (
      p.x >= e.origin.x + e.mins.x &&
      p.x <= e.origin.x + e.maxs.x &&
      p.y >= e.origin.y + e.mins.y &&
      p.y <= e.origin.y + e.maxs.y &&
      p.z >= e.origin.z + e.mins.z &&
      p.z <= e.origin.z + e.maxs.z
    );
  }

  brushCenter(e: Entity, out: Vec3): Vec3 {
    return e.worldSpaceCenter(out);
  }

  /** A MOVETYPE_PUSH mover could not move: tell it (CBaseEntity::Blocked). */
  onPusherBlocked(pusher: Entity, other: Entity): void {
    const b = pusher as Entity & { blocked?: (o: Entity) => void };
    b.blocked?.(other);
  }

  onPlayerPushed(e: Entity): void {
    if (e.isPlayer()) (e as Player).move.gameMoved = true;
  }

  // ─── Movement helpers for triggers ───────────────────────────────────────

  isOnGround(e: Entity): boolean {
    return e.isPlayer() ? ((e as Player).move.flags & FL_ONGROUND) !== 0 : (e.flags & FL_ONGROUND) !== 0;
  }

  clearGround(e: Entity): void {
    if (e.isPlayer()) {
      const m = (e as Player).move;
      m.flags &= ~FL_ONGROUND;
      m.groundEntity = NO_ENTITY;
    }
    e.flags &= ~FL_ONGROUND;
    e.groundEntity = NO_ENTITY;
  }

  /** SDK: CBaseEntity::Teleport (players: the client drops prediction and interpolation). */
  teleportEntity(e: Entity, origin: Vec3, angles: Vec3 | null, velocity: Vec3 | null): void {
    if (e.isPlayer()) {
      const p = e as Player;
      copy(p.origin, origin);
      if (angles) {
        copy(p.eyeAngles, angles);
        p.angles.y = angles.y;
      }
      if (velocity) copy(p.velocity, velocity);
      this.clearGround(p);
      p.move.gameMoved = true;
      p.effects |= EF_NOINTERP;
      this.lagcomp.reset(p.id);
      this.events.push({ type: 'teleport', player: p.id });
    } else e.teleport(origin, angles, velocity);
  }

  // ─── Triggers and touching ───────────────────────────────────────────────

  registerTrigger(t: TouchVolume): void {
    if (!this.touchVolumes.includes(t)) this.touchVolumes.push(t);
  }

  unregisterTrigger(t: TouchVolume): void {
    this.endAllTouches(t);
    this.touchLinks.delete(t);
    if (this.inTouchPass) {
      this.pendingUnregister.push(t);
      return;
    }
    const i = this.touchVolumes.indexOf(t);
    if (i >= 0) this.touchVolumes.splice(i, 1);
  }

  /** Entities currently linked to a touch volume (engine touch links). */
  triggerLinks(t: TouchVolume): readonly Entity[] {
    return this.touchLinks.get(t) ?? EMPTY_LIST;
  }

  endAllTouches(t: TouchVolume): void {
    const links = this.touchLinks.get(t);
    if (!links) return;
    const copyList = links.slice();
    links.length = 0;
    for (const e of copyList) t.endTouch(e);
  }

  resetTriggerTouches(t: TouchVolume): void {
    const links = this.touchLinks.get(t);
    if (links) links.length = 0;
  }

  private endTouchesOf(e: Entity): void {
    for (const t of this.touchVolumes) {
      const links = this.touchLinks.get(t);
      if (!links) continue;
      const i = links.indexOf(e);
      if (i >= 0) {
        links.splice(i, 1);
        if (!t.removed) t.endTouch(e);
      }
    }
    const asVolume = e as unknown as TouchVolume;
    if (this.touchLinks.has(asVolume)) this.unregisterTrigger(asVolume);
  }

  /** Touch-link candidates: living players and moving non-trigger entities. */
  private gatherTouchCandidates(): Entity[] {
    const out = this.touchCandidates;
    out.length = 0;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = this.entities[i];
      if (e && !e.removed && (e as Player).alive) out.push(e);
    }
    const l = this.bboxEntities;
    for (let i = 0; i < l.length; i++) {
      const e = l[i];
      if (e.removed || e.isPlayer() || e.isTrigger() || e.moveType === MOVETYPE_NONE) continue;
      if (e.solid !== SOLID_BBOX) continue;
      out.push(e);
    }
    return out;
  }

  /** SDK: the engine's PhysicsTouchTriggers for everyone — StartTouch / Touch / EndTouch. */
  updateTouches(): void {
    const candidates = this.gatherTouchCandidates();
    this.inTouchPass = true;
    // Volumes registered during the pass are touched next tick; removed ones are skipped.
    const vols = this.touchVolumes;
    const count = vols.length;
    for (let vi = 0; vi < count && vi < vols.length; vi++) {
      const t = vols[vi];
      if (t.removed) continue;
      let links = this.touchLinks.get(t);
      if (!links) {
        links = [];
        this.touchLinks.set(t, links);
      }
      // Ends first: anyone linked who is gone, dead or no longer inside.
      for (let i = links.length - 1; i >= 0; i--) {
        const e = links[i];
        const stillValid = !e.removed && (!e.isPlayer() || (e as Player).alive) && !t.disabled;
        if (stillValid && this.overlaps(t, e)) continue;
        links.splice(i, 1);
        t.endTouch(e);
        if (t.removed) break;
      }
      if (t.removed || t.disabled) continue;
      for (const e of candidates) {
        if (e.removed || e === (t as unknown as Entity)) continue;
        if (!t.wantsToucher(e)) continue;
        const linked = links.includes(e);
        if (!linked) {
          if (!this.overlaps(t, e)) continue;
          links.push(e);
          t.startTouch(e);
          if (t.removed) break;
        }
        if (!e.removed) t.touch(e);
        if (t.removed) break;
      }
    }
    this.inTouchPass = false;
    for (const t of this.pendingUnregister) {
      const i = this.touchVolumes.indexOf(t);
      if (i >= 0) this.touchVolumes.splice(i, 1);
    }
    this.pendingUnregister.length = 0;
  }

  private overlaps(t: TouchVolume, e: Entity): boolean {
    this.touchMins.x = e.origin.x + e.mins.x;
    this.touchMins.y = e.origin.y + e.mins.y;
    this.touchMins.z = e.origin.z + e.mins.z;
    this.touchMaxs.x = e.origin.x + e.maxs.x;
    this.touchMaxs.y = e.origin.y + e.maxs.y;
    this.touchMaxs.z = e.origin.z + e.maxs.z;
    return t.touchesBox(this.touchMins, this.touchMaxs);
  }

  /**
   * Runs the touch pass for one entity right away (after a teleport or a
   * respawn) instead of waiting for the tick's pass.
   */
  touchTriggers(e: Entity): void {
    for (const t of this.touchVolumes) {
      if (t.removed || t.disabled || !t.wantsToucher(e)) continue;
      let links = this.touchLinks.get(t);
      if (!links) {
        links = [];
        this.touchLinks.set(t, links);
      }
      if (links.includes(e)) continue;
      if (!this.overlaps(t, e)) continue;
      links.push(e);
      t.startTouch(e);
    }
  }

  // ─── TF queries ──────────────────────────────────────────────────────────

  /** SDK: PointInRespawnRoom — inside an active func_respawnroom (of the target's team when given). */
  pointInRespawnRoom(target: Entity | null, p: Vec3): boolean {
    let inside = false;
    this.forEachEntity((e) => {
      if (inside || e.classname !== 'func_respawnroom') return;
      const room = e as Entity & { active?: boolean; pointIsWithin?: (q: Vec3) => boolean };
      if (room.active === false || !room.pointIsWithin) return;
      if (!room.pointIsWithin(p)) return;
      if (!target || e.team === 0 || e.team === target.team) inside = true;
    });
    return inside;
  }

  /** Is `p` inside a func_nobuild that forbids this object type? */
  inNoBuildZone(p: Vec3, objectType: number, team = 0): boolean {
    let blocked = false;
    this.forEachEntity((e) => {
      if (blocked || e.classname !== 'func_nobuild') return;
      const nb = e as Entity & { disabled?: boolean; pointIsWithin?: (q: Vec3) => boolean; preventsBuildOf?: (t: number) => boolean };
      if (nb.disabled || !nb.pointIsWithin || !nb.preventsBuildOf) return;
      if (e.team && team && e.team !== team) return;
      if (nb.pointIsWithin(p) && nb.preventsBuildOf(objectType)) blocked = true;
    });
    return blocked;
  }

  // ─── Network ─────────────────────────────────────────────────────────────

  /** Every networked entity with its schema, in id order. */
  forEachNetEntity(fn: (e: Entity, schema: NetSchema) => void): void {
    this.forEachEntity((e) => {
      const s = e.netSchema();
      if (s) fn(e, s);
    });
  }

  /** Team counts, for the HUD / autobalance hints. */
  teamCounts(): { red: number; blue: number } {
    let red = 0;
    let blue = 0;
    this.forEachPlayer((p) => {
      if (p.team === TF_TEAM_RED) red++;
      else if (p.team === TF_TEAM_BLUE) blue++;
    });
    return { red, blue };
  }

  /** The world centre of an entity (scratch). */
  centerOf(e: Entity): Vec3 {
    return e.worldSpaceCenter(centerScratch);
  }

  /** A fresh user command (convenience for bots/tests). */
  static emptyCommand(): UserCmd {
    return emptyUserCmd();
  }
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const followM0 = new Float64Array(9);
const followM1 = new Float64Array(9);
const followM2 = new Float64Array(9);
const followM3 = new Float64Array(9);

/** SDK: MatrixAngles (row-major, columns forward/left/up). */
function matrixAngles(m: Float64Array, out: Vec3): void {
  const fx = m[0];
  const fy = m[3];
  const fz = m[6];
  const lz = m[7];
  const uz = m[8];
  const xyDist = Math.sqrt(fx * fx + fy * fy);
  const r2d = 180 / Math.PI;
  if (xyDist > 0.001) {
    out.y = Math.atan2(fy, fx) * r2d;
    out.x = Math.atan2(-fz, xyDist) * r2d;
    out.z = Math.atan2(lz, uz) * r2d;
  } else {
    out.y = Math.atan2(-m[1], m[4]) * r2d;
    out.x = Math.atan2(-fz, xyDist) * r2d;
    out.z = 0;
  }
}

/** SDK: AngleMatrix, row-major (columns forward, left, up). */
function angleMatrixRows(a: Vec3, out: Float64Array): void {
  const d = Math.PI / 180;
  const sy = Math.sin(a.y * d);
  const cy = Math.cos(a.y * d);
  const sp = Math.sin(a.x * d);
  const cp = Math.cos(a.x * d);
  const sr = Math.sin(a.z * d);
  const cr = Math.cos(a.z * d);
  out[0] = cp * cy;
  out[3] = cp * sy;
  out[6] = -sp;
  out[1] = sr * sp * cy + cr * -sy;
  out[4] = sr * sp * sy + cr * cy;
  out[7] = sr * cp;
  out[2] = cr * sp * cy + -sr * -sy;
  out[5] = cr * sp * sy + -sr * cy;
  out[8] = cr * cp;
}
const EMPTY_LIST: readonly Entity[] = [];
const EMPTY_INFO = createDamageInfo();

interface BulletAccumulator {
  entity: Entity;
  info: DamageInfo;
}
const bulletVictims: BulletAccumulator[] = [];
const bulletPool: BulletAccumulator[] = [];
function takeBulletAccumulator(i: number): BulletAccumulator {
  let a = bulletPool[i];
  if (!a) {
    a = { entity: null as unknown as Entity, info: createDamageInfo() };
    bulletPool[i] = a;
  }
  return a;
}

/** Segment (start + t·d, t ∈ [0, maxT]) vs AABB slab test. */
function segmentHitsBox(start: Vec3, dx: number, dy: number, dz: number, mins: Vec3, maxs: Vec3, maxT: number): boolean {
  let t0 = 0;
  let t1 = maxT;
  for (let a = 0; a < 3; a++) {
    const s = a === 0 ? start.x : a === 1 ? start.y : start.z;
    const d = a === 0 ? dx : a === 1 ? dy : dz;
    const lo = a === 0 ? mins.x : a === 1 ? mins.y : mins.z;
    const hi = a === 0 ? maxs.x : a === 1 ? maxs.y : maxs.z;
    if (Math.abs(d) < 1e-12) {
      if (s < lo || s > hi) return false;
      continue;
    }
    let ta = (lo - s) / d;
    let tb = (hi - s) / d;
    if (ta > tb) {
      const t = ta;
      ta = tb;
      tb = t;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}
