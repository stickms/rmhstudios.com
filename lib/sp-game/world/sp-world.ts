/**
 * The single-player world: one map of Half-Life 2 or Portal, its entities,
 * the player, rigid-body physics, portals, and the services entities use —
 * the engine's entity list and server frame for a single-player game
 * (CGlobalEntityList, CServerGameDLL::GameFrame, IEngineTrace, the event
 * queue, the save/restore system's autosaves and level transitions).
 *
 * One `step(cmd)` is one 0.015 s tick:
 *   1. the player's command (movement, +use, carrying, the portal gun);
 *      portals teleport the player;
 *   2. entity thinks, movers (doors, trains), parenting;
 *   3. physics (Rapier) — props sync from their bodies, portals teleport them;
 *   4. trigger touches;
 *   5. the I/O event queue;
 *   6. impact sounds.
 *
 * It implements the subset of the TF `GameWorld` the engine-generic TF entity
 * classes call (`world.*` in lib/tf2-game/sim/{entity,logic,triggers}.ts), so
 * those classes run here unchanged.
 */

import { emptyTrace, NO_ENTITY, WORLD_ENTITY, type TraceFilter, type TraceResult } from '../../tf2-game/core/types';
import { FL_ONGROUND, MASK_PLAYERSOLID, TICK_INTERVAL } from '../../tf2-game/core/constants';
import { copy, vec3, type Vec3 } from '../../tf2-game/core/vec';
import { UniformRandomStream } from '../../tf2-game/core/random';
import type { BspFile } from '../../tf2-game/formats/bsp';
import type { BspEntity } from '../../tf2-game/formats/keyvalues';
import { Entity, EF_NOINTERP, FSOLID_NOT_SOLID, SOLID_BSP, SOLID_NONE } from '../../tf2-game/sim/entity';
import { IoSystem } from '../../tf2-game/sim/io';
import { createDamageInfo, type DamageInfo } from '../../tf2-game/sim/damage';
import type { GameWorld } from '../../tf2-game/sim/world';
import { loadParsedMap } from '../../tf2-game/sim/map-loader';
import type { MapCollision } from '../../tf2-game/world/map-collision';
import type { PropCollisionModel } from '../../tf2-game/world/prop-collision';
import type { SpAssets } from '../assets';
import { PLAYER_ENTITY_ID, SP_GRAVITY, type SpGame } from '../constants';
import { createSpEntity, SpEntity } from '../entities/base';
import { anglesFromMat, matFromAngles, matMul, matMulVec, matTMulVec } from '../math';
import { loadRapier, PhysicsWorld, PHYS_GROUP, PROP_FILTER, type PhysBody, type Rapier } from '../physics/physics-world';
import { SpPlayer, type Holdable, type SpUserCmd } from '../player/sp-player';
import { SpCollision } from './collision';
import type { SpEvent } from './events';
import type { TransitionData } from '../level/transition';
import { captureCheckpoint, restoreCheckpoint, type Checkpoint } from '../level/checkpoint';
import { PortalService } from '../portal/portals';
import { applyTransitionArrival } from '../level/arrival';
import '../entities/register';

/** How the map was entered (gpGlobals->eLoadType): logic_auto picks its outputs by it. */
export type LoadType = 'new' | 'transition' | 'load';

export interface SpWorldInit {
  game: SpGame;
  mapName: string;
  bsp: BspFile;
  assets: SpAssets;
  rapier: Rapier;
  loadType?: LoadType;
  transition?: TransitionData | null;
  seed?: number;
  /** Physics substeps per tick (default 2). */
  substeps?: number;
}

/** Entities a trigger registers as a touch volume. */
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

export interface SoundOpts {
  entity?: number;
  pos?: Vec3;
  volume?: number;
  pitch?: number;
  loop?: boolean;
  stop?: boolean;
  radius?: number;
  fade?: number;
  /** Frequent sounds (footsteps) the host may drop. */
  quiet?: boolean;
}

/** One renderable entity's state for the host (see `SpWorld.snapshot`). */
export interface SpEntityState {
  id: number;
  classname: string;
  targetname: string;
  model: string;
  bspModel: number;
  origin: Vec3;
  angles: Vec3;
  skin: number;
  body: number;
  effects: number;
  renderMode: number;
  renderAlpha: number;
  renderColor: number;
  parent: number;
  /** Drawn at all (not EF_NODRAW, not disabled, visual on). */
  visible: boolean;
  anim: { sequence: string; startTime: number; rate: number; loop: boolean; cycle: number } | null;
  extra: Record<string, unknown> | null;
}

export interface SpSnapshot {
  tick: number;
  curtime: number;
  map: string;
  player: {
    origin: Vec3;
    velocity: Vec3;
    eyeAngles: Vec3;
    viewOffsetZ: number;
    punchAngle: Vec3;
    ducked: boolean;
    onGround: boolean;
    health: number;
    armor: number;
    hasSuit: boolean;
    suitPower: number;
    sprinting: boolean;
    flashlight: boolean;
    dead: boolean;
    held: number;
    portalgun: { canFire1: boolean; canFire2: boolean } | null;
  };
  /** The camera when a point_viewcontrol is active (else null: the player's eyes). */
  view: { entity: number; origin: Vec3; angles: Vec3 } | null;
  entities: SpEntityState[];
  portals: ReturnType<PortalService['state']>;
  soundscape: string;
}

/** CHANGELEVEL / landmark lookups need these. */
export interface ChangeLevelRequest {
  map: string;
  landmark: string;
}

const ZERO = Object.freeze(vec3());

export class SpWorld {
  readonly game: SpGame;
  readonly mapName: string;
  readonly bsp: BspFile;
  readonly assets: SpAssets;
  readonly mapCollision: MapCollision;
  /** Alias the TF classes read (GameWorld.brushes). */
  readonly brushes: MapCollision;
  readonly collision: SpCollision;
  readonly physics: PhysicsWorld;
  readonly io: IoSystem;
  readonly portals: PortalService;
  readonly entities: (Entity | undefined)[] = [];
  readonly events: SpEvent[] = [];
  readonly player: SpPlayer;
  readonly worldEntity: Entity;
  readonly loadType: LoadType;
  readonly tick = TICK_INTERVAL;
  readonly frametime = TICK_INTERVAL;
  readonly isServer = true;
  curtime = 0;
  tickCount = 0;
  /** env_global states (carried across transitions). */
  readonly globals = new Map<string, number>();
  /** The active point_viewcontrol, or null. */
  viewControl: SpEntity | null = null;
  /** The active env_soundscape name ('' none). */
  soundscape = '';
  /** Set when a trigger_changelevel fired (the host loads `map`). */
  pendingChangeLevel: (ChangeLevelRequest & { transition: TransitionData }) | null = null;
  /** The last logic_autosave (or the map start). */
  checkpoint: Checkpoint | null = null;
  /** point_template / npc_template_maker templates by lower-case name. */
  readonly templates = new Map<string, BspEntity>();
  /** Bodies owned by entities (props), by entity id. */
  readonly bodiesByEntity = new Map<number, PhysBody>();
  private readonly random_: UniformRandomStream;
  private readonly freeSlots: Array<{ id: number; at: number }> = [];
  private nextId = PLAYER_ENTITY_ID + 1;
  private readonly touchVolumes: TouchVolume[] = [];
  private readonly touchLinks = new Map<TouchVolume, Entity[]>();
  private inTouchPass = false;
  private readonly pendingUnregister: TouchVolume[] = [];
  private readonly initialModelSolid: Uint8Array;
  private readonly brushEntities = new Map<number, Entity>();
  private startCheckpointTaken = false;
  private readonly modelHullCache = new Map<string, PropCollisionModel | null>();

  static async create(init: Omit<SpWorldInit, 'rapier'>): Promise<SpWorld> {
    const rapier = await loadRapier();
    return new SpWorld({ ...init, rapier });
  }

  constructor(init: SpWorldInit) {
    this.game = init.game;
    this.mapName = init.mapName;
    this.bsp = init.bsp;
    this.assets = init.assets;
    this.loadType = init.loadType ?? (init.transition ? 'transition' : 'new');
    this.random_ = new UniformRandomStream(init.seed ?? 1);

    const loaded = loadParsedMap(init.bsp, { name: init.mapName, propCollision: (m) => this.propCollisionModel(m) });
    this.mapCollision = loaded.collision;
    this.brushes = loaded.collision;
    this.collision = new SpCollision(this.mapCollision);
    const n = this.mapCollision.modelCount;
    this.initialModelSolid = new Uint8Array(n);
    for (let i = 1; i < n; i++) this.initialModelSolid[i] = this.mapCollision.isModelSolid(i) ? 1 : 0;

    this.physics = new PhysicsWorld(init.rapier, init.assets.surfaceProps, { gravity: SP_GRAVITY, substeps: init.substeps ?? 2 });
    this.collision.physics = this.physics;
    this.buildStaticPhysics();

    this.io = new IoSystem({
      now: () => this.curtime,
      forEachEntity: (fn) => this.forEachEntity(fn),
      firstPlayer: () => this.player,
    });

    this.worldEntity = new SpEntity('worldspawn');
    this.addEntityAt(this.worldEntity, WORLD_ENTITY);
    this.player = new SpPlayer(this.game);
    this.addEntityAt(this.player, PLAYER_ENTITY_ID);
    this.player.phys = this.physics.createKinematicBox(PLAYER_ENTITY_ID, this.player.params.hullMin, this.player.params.hullMax, ZERO, PHYS_GROUP.PLAYER, PHYS_GROUP.PROP);
    this.player.duckPhys = this.physics.createKinematicBox(PLAYER_ENTITY_ID, this.player.params.duckHullMin, this.player.params.duckHullMax, ZERO, 0, PHYS_GROUP.PROP);

    this.portals = new PortalService(this);
    this.collision.portals = this.game === 'portal' ? this.portals : null;

    this.spawnMapEntities(init.bsp.entities);
    this.placePlayer(init.transition ?? null);
    // A changelevel the player starts inside (the way back) stays quiet until the player leaves it.
    this.forEachEntity((e) => (e as Entity & { rearmCheck?: () => void }).rearmCheck?.());
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  private propCollisionModel(model: string): PropCollisionModel | null {
    const key = model.toLowerCase();
    if (this.modelHullCache.has(key)) return this.modelHullCache.get(key)!;
    const info = this.assets.model(key);
    const out: PropCollisionModel | null = info
      ? { hulls: info.physics?.hulls ?? [], mins: info.mins, maxs: info.maxs, surfaceProp: info.physics?.surfaceProp ?? info.surfaceProp, contents: 1 }
      : null;
    this.modelHullCache.set(key, out);
    return out;
  }

  private materialSurface = (material: string): string => this.assets.material(material).surfaceProp;

  private buildStaticPhysics(): void {
    const bsp = this.bsp;
    // CONTENTS_SOLID | CONTENTS_WINDOW | CONTENTS_GRATE | CONTENTS_MOVEABLE
    this.physics.addWorldBrushes(bsp, this.mapCollision.modelBrushes(0), 0x1 | 0x2 | 0x8 | 0x4000, this.materialSurface);
    this.physics.addDisplacements(this.mapCollision.displacements, (ti) => {
      const name = ti >= 0 && ti < bsp.texInfo.length ? (bsp.texData[bsp.texInfo[ti].texData]?.name ?? '') : '';
      return this.materialSurface(name);
    });
    for (const p of bsp.staticProps?.props ?? []) {
      if (p.solid === SOLID_NONE) continue;
      const m = this.propCollisionModel(p.model);
      if (!m || m.hulls.length === 0) continue;
      this.physics.addStaticHulls(m.hulls, p.origin, p.angles, m.surfaceProp);
    }
  }

  /** MapEntity_ParseAllEntities: templates are kept aside; the rest is constructed, keyed, spawned, activated. */
  private spawnMapEntities(lump: readonly BspEntity[]): void {
    const templateNames = new Set<string>();
    for (const kv of lump) {
      if (kv.classname.toLowerCase() !== 'point_template') continue;
      for (const [k, v] of kv.props) if (/^template\d+$/i.test(k) && v) templateNames.add(v.toLowerCase());
    }
    const created: Entity[] = [];
    for (const kv of lump) {
      const cls = kv.classname.toLowerCase();
      if (cls === 'worldspawn') {
        this.worldEntity.kv = kv;
        continue;
      }
      if (cls === 'player' || cls === '') continue;
      const name = (kv.get('targetname') ?? '').toLowerCase();
      if (name && templateNames.has(name)) {
        if (!this.templates.has(name)) this.templates.set(name, kv);
        // Every entity with a template's name belongs to it; keep them all (point_template spawns each).
        const list = this.templateLists.get(name) ?? [];
        list.push(kv);
        this.templateLists.set(name, list);
        continue;
      }
      // npc_template_maker templates: NPCs flagged SF_NPC_TEMPLATE (2048).
      if (cls.startsWith('npc_') && (parseInt(kv.get('spawnflags') ?? '0', 10) & 2048) !== 0 && name) {
        this.templates.set(name, kv);
        continue;
      }
      const e = this.add(createSpEntity(cls));
      e.applyKeyValues(kv);
      created.push(e);
    }
    // Parents are linked at the authored positions, before anything spawns and moves
    // (SDK: SpawnHierarchicalList links the hierarchy, then Spawn moves start-open doors…).
    for (const e of created) {
      if (!e.parentName) continue;
      const p = this.findByName(e.parentName);
      if (p && p !== e) e.setParent(p);
      e.parentName = '';
    }
    for (const e of created) if (!e.removed) e.spawn();
    for (const e of created) if (!e.removed) e.activate();
  }

  /** Every keyvalue set under a template name (point_template may name several entities alike). */
  readonly templateLists = new Map<string, BspEntity[]>();

  /** SDK: CBasePlayer::EntSelectSpawnPoint (single player): the master info_player_start, else the first. */
  private placePlayer(transition: TransitionData | null): void {
    if (transition) {
      applyTransitionArrival(this, transition);
      return;
    }
    let spot: Entity | null = null;
    this.forEachEntity((e) => {
      if (e.classname !== 'info_player_start') return;
      if (!spot || (e.spawnflags & 1 && !(spot.spawnflags & 1))) spot = e;
    });
    const s = spot as Entity | null;
    this.player.placeAt(s ? s.origin : ZERO, s ? s.angles : ZERO, null);
  }

  // ─── Entity list (GameWorld subset) ───────────────────────────────────────

  private addEntityAt(e: Entity, id: number): void {
    e.world = this as unknown as GameWorld;
    e.id = id;
    e.serial++;
    e.spawnTime = this.curtime;
    this.entities[id] = e;
  }

  private allocateId(): number {
    for (let i = 0; i < this.freeSlots.length; i++) {
      if (this.freeSlots[i].at <= this.curtime) {
        const id = this.freeSlots[i].id;
        this.freeSlots.splice(i, 1);
        return id;
      }
    }
    return this.nextId++;
  }

  add<T extends Entity>(e: T): T {
    this.addEntityAt(e, this.allocateId());
    return e;
  }

  /** CreateEntityByName + keyvalues + DispatchSpawn + Activate. */
  spawnEntity(classname: string, init?: (e: Entity) => void, kv?: BspEntity | null): Entity {
    const e = this.add(createSpEntity(classname));
    if (kv) e.applyKeyValues(kv);
    init?.(e);
    e.spawn();
    if (!e.removed) e.activate();
    return e;
  }

  entity(id: number): Entity | null {
    if (id < 0) return null;
    const e = this.entities[id];
    return e && !e.removed ? e : null;
  }

  forEachEntity(fn: (e: Entity) => void): void {
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && !e.removed) fn(e);
    }
  }

  firstPlayer(): Entity | null {
    return this.player;
  }

  forEachPlayer(fn: (p: Entity) => void): void {
    fn(this.player);
  }

  isPlayerId(id: number): boolean {
    return id === PLAYER_ENTITY_ID;
  }

  remove(e: Entity): void {
    if (e.removed || e === this.worldEntity || e === this.player) return;
    e.removed = true;
    this.endTouchesOf(e);
    e.onRemove();
    if (e.bspModel > 0) this.mapCollision.setModelSolid(e.bspModel, false);
    this.collision.removeBox(e as unknown as Parameters<SpCollision['removeBox']>[0]);
    if (this.viewControl === e) this.viewControl = null;
    this.freeSlots.push({ id: e.id, at: this.curtime + 1 });
  }

  findByName(name: string, searching: Entity | null = null, activator: Entity | null = null, caller: Entity | null = null): Entity | null {
    const out: Entity[] = [];
    this.io.findByName(name, searching, activator, caller, out);
    if (out.length === 0) this.io.findByClassname(name, out);
    return out[0] ?? null;
  }

  findAllByName(name: string, searching: Entity | null = null, activator: Entity | null = null, caller: Entity | null = null): Entity[] {
    const out: Entity[] = [];
    this.io.findByName(name, searching, activator, caller, out);
    return out;
  }

  findAllByClassname(classname: string): Entity[] {
    return this.io.findByClassname(classname, []);
  }

  /** Fires an input on every entity that matches `target` (name, then classname), through the queue. */
  fireInput(target: string, input: string, value = '', delay = 0, activator: Entity | null = null, caller: Entity | null = null): void {
    this.io.addEvent(target, input, value, delay, activator, caller);
  }

  random(): number {
    return this.random_.randomFloat(0, 1);
  }

  randomFloat(lo: number, hi: number): number {
    return this.random_.randomFloat(lo, hi);
  }

  // ─── Brush entities (GameWorld subset) ────────────────────────────────────

  applyBrushModelBounds(e: Entity): void {
    const b = this.mapCollision;
    if (e.bspModel <= 0 || e.bspModel >= b.modelCount) return;
    const bounds = b.modelBounds(e.bspModel);
    e.setSize(bounds.mins, bounds.maxs);
    b.setModelEntity(e.bspModel, e.id);
    b.setModelTransform(e.bspModel, e.origin, ZERO);
    const solid = this.initialModelSolid[e.bspModel] === 1;
    b.setModelSolid(e.bspModel, solid);
    b.setModelContents(e.bspModel, null);
    e.solid = SOLID_BSP;
    if (!solid) e.solidFlags |= FSOLID_NOT_SOLID;
    this.brushEntities.set(e.bspModel, e);
  }

  syncBrushModel(e: Entity): void {
    if (e.bspModel > 0) this.mapCollision.setModelTransform(e.bspModel, e.origin, e.angles);
  }

  setBrushSolid(e: Entity, solid: boolean): void {
    if (e.bspModel > 0) this.mapCollision.setModelSolid(e.bspModel, solid);
    if (solid) e.solidFlags &= ~FSOLID_NOT_SOLID;
    else e.solidFlags |= FSOLID_NOT_SOLID;
  }

  setBrushContents(e: Entity, contents: number | null): void {
    if (e.bspModel > 0) this.mapCollision.setModelContents(e.bspModel, contents);
  }

  boxTouchesBrushEntity(e: Entity, mins: Vec3, maxs: Vec3): boolean {
    if (e.bspModel > 0) return this.mapCollision.boxTouchesModel(e.bspModel, mins, maxs);
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
    if (e.bspModel > 0) return this.mapCollision.pointInModel(e.bspModel, p);
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

  /**
   * Moves a brush mover to a new pose (SDK: SV_PushMove / CPhysicsPushedEntities
   * for the player): the player riding it moves with it; a player it runs into
   * is pushed along, and when the player cannot be moved the mover is blocked
   * (returns false and stays where it was).
   */
  moveBrush(e: Entity, origin: Vec3, angles: Vec3): boolean {
    const p = this.player;
    copy(mvOldO, e.origin);
    copy(mvOldA, e.angles);
    copy(e.origin, origin);
    copy(e.angles, angles);
    this.syncBrushModel(e);
    const solid = e.bspModel > 0 && this.mapCollision.isModelSolid(e.bspModel);
    if (!solid || p.dead || p.removed) return true;
    const rides = p.move.groundEntity === e.id;
    const rotated = mvOldA.x !== angles.x || mvOldA.y !== angles.y || mvOldA.z !== angles.z;
    // Where the player's centre is carried by the mover's motion.
    mvPush.x = origin.x - mvOldO.x;
    mvPush.y = origin.y - mvOldO.y;
    mvPush.z = origin.z - mvOldO.z;
    if (rotated) {
      p.worldSpaceCenter(mvCenter);
      matFromAngles(mvOldA, mvM0);
      matFromAngles(angles, mvM1);
      mvRel.x = mvCenter.x - mvOldO.x;
      mvRel.y = mvCenter.y - mvOldO.y;
      mvRel.z = mvCenter.z - mvOldO.z;
      matTMulVec(mvM0, mvRel, mvRel);
      matMulVec(mvM1, mvRel, mvRel);
      mvPush.x = origin.x + mvRel.x - mvCenter.x;
      mvPush.y = origin.y + mvRel.y - mvCenter.y;
      mvPush.z = origin.z + mvRel.z - mvCenter.z;
      if (rides) {
        // Riders turn with the mover (yaw).
        p.eyeAngles.y += angles.y - mvOldA.y;
      }
    }
    const tr = mvTrace;
    if (rides) {
      mvTo.x = p.origin.x + mvPush.x;
      mvTo.y = p.origin.y + mvPush.y;
      mvTo.z = p.origin.z + mvPush.z;
      this.collision.traceHull(mvTo, mvTo, p.mins, p.maxs, MASK_PLAYERSOLID, p.traceFilter, tr);
      if (!tr.startSolid) {
        copy(p.move.origin, mvTo);
        copy(p.origin, mvTo);
        p.move.gameMoved = true;
        this.riderCarried = true;
        return true;
      }
    }
    // Does the mover now overlap the player?
    this.mapCollision.traceModel(e.bspModel, p.origin, p.origin, p.mins, p.maxs, MASK_PLAYERSOLID, tr);
    if (!tr.startSolid) return true;
    mvTo.x = p.origin.x + mvPush.x;
    mvTo.y = p.origin.y + mvPush.y;
    mvTo.z = p.origin.z + mvPush.z;
    this.collision.traceHull(mvTo, mvTo, p.mins, p.maxs, MASK_PLAYERSOLID, p.traceFilter, tr);
    if (!tr.startSolid) {
      copy(p.move.origin, mvTo);
      copy(p.origin, mvTo);
      p.move.gameMoved = true;
      if (mvPush.z > 0) {
        p.move.groundEntity = e.id;
        p.move.flags |= FL_ONGROUND;
      }
      return true;
    }
    // Blocked: put the mover back.
    copy(e.origin, mvOldO);
    copy(e.angles, mvOldA);
    this.syncBrushModel(e);
    return false;
  }

  /** The brush entity using a model, if any. */
  brushEntity(model: number): Entity | null {
    return this.brushEntities.get(model) ?? null;
  }

  // ─── Movement helpers (GameWorld subset) ──────────────────────────────────

  isOnGround(e: Entity): boolean {
    return e === this.player ? (this.player.move.flags & FL_ONGROUND) !== 0 : (e.flags & FL_ONGROUND) !== 0;
  }

  clearGround(e: Entity): void {
    if (e === this.player) {
      this.player.move.flags &= ~FL_ONGROUND;
      this.player.move.groundEntity = NO_ENTITY;
    }
    e.flags &= ~FL_ONGROUND;
    e.groundEntity = NO_ENTITY;
  }

  /** Velocity of an entity the player stands on (movers, props). */
  entityVelocity(id: number, out: Vec3): void {
    out.x = out.y = out.z = 0;
    const b = this.bodiesByEntity.get(id);
    if (b && !b.removed) {
      b.getVelocity(out);
      return;
    }
    const e = this.entity(id);
    if (e) copy(out, e.velocity);
  }

  /** SDK: CBaseEntity::Teleport. */
  teleportEntity(e: Entity, origin: Vec3, angles: Vec3 | null, velocity: Vec3 | null): void {
    if (e === this.player) {
      this.player.placeAt(origin, angles, velocity ?? this.player.move.velocity);
      this.player.effects |= EF_NOINTERP;
      this.events.push({ type: 'teleport', entity: e.id });
      this.touchTriggers(e);
      return;
    }
    const b = this.bodiesByEntity.get(e.id);
    if (b && !b.removed) {
      b.setPose(origin, angles ?? e.angles);
      if (velocity) b.setVelocity(velocity);
    }
    e.teleport(origin, angles, velocity);
    if (e.bspModel > 0) this.syncBrushModel(e);
  }

  // ─── Damage ───────────────────────────────────────────────────────────────

  applyDamage(victim: Entity, info: DamageInfo): number {
    return victim.onTakeDamage(info);
  }

  /** Builds a DamageInfo and applies it. */
  damage(victim: Entity, amount: number, type: number, attacker: Entity | null, inflictor: Entity | null, pos?: Vec3): number {
    const info = createDamageInfo();
    info.damage = amount;
    info.baseDamage = amount;
    info.damageType = type;
    info.attacker = attacker ? attacker.id : NO_ENTITY;
    info.inflictor = inflictor ? inflictor.id : NO_ENTITY;
    if (pos) copy(info.position, pos);
    return victim.onTakeDamage(info);
  }

  // ─── Events ──────────────────────────────────────────────────────────────

  emit(ev: SpEvent): void {
    this.events.push(ev);
  }

  emitSound(name: string, opts: SoundOpts = {}): void {
    if (!name) return;
    this.events.push({
      type: 'sound',
      name,
      entity: opts.entity,
      pos: opts.pos ? { x: opts.pos.x, y: opts.pos.y, z: opts.pos.z } : undefined,
      volume: opts.volume,
      pitch: opts.pitch,
      loop: opts.loop,
      stop: opts.stop,
      radius: opts.radius,
      fade: opts.fade,
    });
  }

  /** TF classes call world.emitEffect with their own shape; keep it loosely typed. */
  emitEffect(effect: { kind: string; pos: Vec3; normal?: Vec3; entity?: number }): void {
    this.events.push({ type: 'effect', kind: effect.kind as 'spark', pos: { ...effect.pos }, normal: effect.normal, entity: effect.entity });
  }

  drainEvents(): SpEvent[] {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  // ─── Physics glue ─────────────────────────────────────────────────────────

  /** The filter an ordinary prop's colliders use. */
  propFilter(): number {
    return PROP_FILTER;
  }

  registerBody(entity: Entity, body: PhysBody): void {
    this.bodiesByEntity.set(entity.id, body);
  }

  unregisterBody(entity: Entity): void {
    const b = this.bodiesByEntity.get(entity.id);
    if (!b) return;
    this.bodiesByEntity.delete(entity.id);
    if (this.player.held && this.player.held.id === entity.id) this.player.drop(false);
    this.physics.removeBody(b);
  }

  /** The entity as something +use can carry (physics props), or null. */
  asHoldable(e: Entity): Holdable | null {
    const h = e as Entity & Partial<Holdable> & { canBePickedUp?: () => boolean };
    if (!h.phys || typeof h.canBePickedUp !== 'function' || !h.canBePickedUp()) return null;
    return h as unknown as Holdable;
  }

  // ─── Triggers (GameWorld subset) ──────────────────────────────────────────

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

  triggerLinks(t: TouchVolume): readonly Entity[] {
    return this.touchLinks.get(t) ?? EMPTY;
  }

  endAllTouches(t: TouchVolume): void {
    const links = this.touchLinks.get(t);
    if (!links) return;
    const list = links.slice();
    links.length = 0;
    for (const e of list) t.endTouch(e);
  }

  resetTriggerTouches(t: TouchVolume): void {
    const links = this.touchLinks.get(t);
    if (links) links.length = 0;
  }

  /** The touch links (checkpoints copy them). */
  get touchState(): Map<TouchVolume, Entity[]> {
    return this.touchLinks;
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

  /** Who can touch triggers: the living player, physics props, actors, energy balls. */
  private touchCandidates(out: Entity[]): Entity[] {
    out.length = 0;
    if (this.player.alive) out.push(this.player);
    this.forEachEntity((e) => {
      const c = e as Entity & { touchCandidate?: () => boolean };
      if (c.touchCandidate && c.touchCandidate()) out.push(e);
    });
    return out;
  }

  private overlaps(t: TouchVolume, e: Entity): boolean {
    tMins.x = e.origin.x + e.mins.x;
    tMins.y = e.origin.y + e.mins.y;
    tMins.z = e.origin.z + e.mins.z;
    tMaxs.x = e.origin.x + e.maxs.x;
    tMaxs.y = e.origin.y + e.maxs.y;
    tMaxs.z = e.origin.z + e.maxs.z;
    return t.touchesBox(tMins, tMaxs);
  }

  /** SDK: the engine's PhysicsTouchTriggers for everyone. */
  updateTouches(): void {
    const candidates = this.touchCandidates(touchList);
    this.inTouchPass = true;
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
      for (let i = links.length - 1; i >= 0; i--) {
        const e = links[i];
        const valid = !e.removed && (e !== this.player || this.player.alive) && !t.disabled;
        if (valid && this.overlaps(t, e)) continue;
        links.splice(i, 1);
        t.endTouch(e);
        if (t.removed) break;
      }
      if (t.removed || t.disabled) continue;
      for (const e of candidates) {
        if (e.removed || e === (t as unknown as Entity)) continue;
        if (!t.wantsToucher(e)) continue;
        if (!links.includes(e)) {
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

  /** Touch pass for one entity right away (after a teleport). */
  touchTriggers(e: Entity): void {
    for (const t of this.touchVolumes) {
      if (t.removed || t.disabled || !t.wantsToucher(e)) continue;
      let links = this.touchLinks.get(t);
      if (!links) {
        links = [];
        this.touchLinks.set(t, links);
      }
      if (links.includes(e) || !this.overlaps(t, e)) continue;
      links.push(e);
      t.startTouch(e);
    }
  }

  // ─── The tick ────────────────────────────────────────────────────────────

  /** One tick with the player's command (null repeats the last one). */
  step(cmd?: SpUserCmd | null): void {
    if (!this.startCheckpointTaken) {
      // The map start is the first checkpoint (death before any autosave restarts here).
      this.startCheckpointTaken = true;
      this.checkpoint = captureCheckpoint(this);
    }
    this.tickCount++;
    this.curtime = this.tickCount * TICK_INTERVAL;

    // 1. The player.
    const p = this.player;
    p.runCommand(cmd ?? p.lastCmd);
    if (this.game === 'portal') this.portals.updatePlayer();

    // 2. Thinks, movers, parenting.
    const list = this.entities;
    for (let i = PLAYER_ENTITY_ID + 1; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed) continue;
      if (e.nextThink >= 0 && e.nextThink <= this.curtime + 1e-9) {
        e.nextThink = -1;
        e.think();
        if (e.removed) continue;
      }
      const s = e as Entity & { simulate?: () => void };
      if (s.simulate) s.simulate();
      if (e.removed) continue;
      if (e.parent !== NO_ENTITY) this.followParent(e);
    }

    this.carryRider();

    // 3. Physics.
    this.physics.step();
    for (const [id, b] of this.bodiesByEntity) {
      const e = this.entities[id] as (Entity & { syncFromBody?: () => void }) | undefined;
      if (e && !e.removed && e.syncFromBody && !b.removed) e.syncFromBody();
    }
    if (this.game === 'portal') this.portals.updateBodies();

    // 4. Touches.
    this.updateTouches();

    // 5. I/O.
    this.io.service();

    // 6. Impact sounds.
    for (const imp of this.physics.drainImpacts()) {
      if (imp.sound) this.emitSound(imp.sound, { entity: imp.entity, pos: imp.pos, volume: Math.min(1, imp.speed / 500), quiet: true });
      const e = this.entity(imp.entity) as (Entity & { onImpact?: (speed: number) => void }) | null;
      e?.onImpact?.(imp.speed);
    }
  }

  private riderEnt = NO_ENTITY;
  private readonly riderPos = vec3();
  private riderCarried = false;

  /**
   * The player standing on something that moved this tick without moveBrush
   * carrying it (a prop parented to a train, a kinematic prop) moves with it.
   */
  private carryRider(): void {
    const p = this.player;
    const g = p.move.groundEntity;
    const e = g > 0 ? this.entity(g) : null;
    if (e && g === this.riderEnt && !this.riderCarried && !p.dead) {
      const dx = e.origin.x - this.riderPos.x;
      const dy = e.origin.y - this.riderPos.y;
      const dz = e.origin.z - this.riderPos.z;
      if (dx !== 0 || dy !== 0 || dz !== 0) {
        mvTo.x = p.origin.x + dx;
        mvTo.y = p.origin.y + dy;
        mvTo.z = p.origin.z + dz;
        this.collision.traceHull(p.origin, mvTo, p.mins, p.maxs, MASK_PLAYERSOLID, (id) => id !== e.id && p.traceFilter(id, 0), mvTrace);
        if (!mvTrace.startSolid) {
          copy(p.move.origin, mvTrace.endPos);
          copy(p.origin, mvTrace.endPos);
          p.move.gameMoved = true;
        }
      }
    }
    this.riderCarried = false;
    this.riderEnt = e ? g : NO_ENTITY;
    if (e) copy(this.riderPos, e.origin);
  }

  /** Follows the parent's translation and rotation (SetParent keeps the relative pose). */
  followParent(e: Entity): void {
    const parent = this.entity(e.parent);
    if (!parent) {
      e.parent = NO_ENTITY;
      return;
    }
    const pa = (e as Entity & { parentAnglesAtSet?: Vec3 }).parentAnglesAtSet;
    const ea = (e as Entity & { anglesAtSet?: Vec3 }).anglesAtSet;
    const turned = pa && (pa.x !== parent.angles.x || pa.y !== parent.angles.y || pa.z !== parent.angles.z);
    if (turned && pa && ea) {
      // world = parent + R(parent) R(atSet)ᵀ offset; angles = R(parent) R(atSet)ᵀ R(own at set)
      matFromAngles(parent.angles, fpA);
      matFromAngles(pa, fpB);
      matTMulVec(fpB, e.parentOffset, fpV);
      matMulVec(fpA, fpV, fpV);
      e.origin.x = parent.origin.x + fpV.x;
      e.origin.y = parent.origin.y + fpV.y;
      e.origin.z = parent.origin.z + fpV.z;
      // Rᵀ(atSet) as a matrix product: A · Bᵀ · C
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) fpBT[r * 3 + c] = fpB[c * 3 + r];
      matFromAngles(ea, fpC);
      matMul(fpA, fpBT, fpD);
      matMul(fpD, fpC, fpD);
      anglesFromMat(fpD, e.angles);
    } else {
      e.origin.x = parent.origin.x + e.parentOffset.x;
      e.origin.y = parent.origin.y + e.parentOffset.y;
      e.origin.z = parent.origin.z + e.parentOffset.z;
    }
    copy(e.velocity, parent.velocity);
    if (e.bspModel > 0) this.syncBrushModel(e);
    const b = this.bodiesByEntity.get(e.id);
    if (b && b.kind === 'kinematic') b.setKinematicTarget(e.origin, e.angles);
  }

  // ─── Checkpoints, death, level changes ───────────────────────────────────

  /** logic_autosave: Save / SaveDangerous. */
  saveCheckpoint(dangerous = false): void {
    if (this.player.dead) return;
    if (dangerous && this.player.health <= 0) return;
    this.checkpoint = captureCheckpoint(this);
    this.emit({ type: 'autosave', dangerous });
  }

  /** The player died: back to the last checkpoint (the map start when none). */
  reloadAfterDeath(): void {
    if (!this.checkpoint) return;
    restoreCheckpoint(this, this.checkpoint);
    this.player.revive();
    this.emit({ type: 'reload', fromCheckpoint: true });
  }

  /** A trigger_changelevel fired. The host loads `map` with `transition`. */
  requestChangeLevel(map: string, landmark: string, transition: TransitionData): void {
    if (this.pendingChangeLevel) return;
    this.pendingChangeLevel = { map, landmark, transition };
    this.emit({ type: 'changelevel', map, landmark, transition });
  }

  // ─── The portal gun (delegated) ───────────────────────────────────────────

  portalgunFire(player: SpPlayer, buttons: number, pressed: number): void {
    this.portals.gunInput(player, buttons, pressed);
  }

  // ─── Traces helpers ───────────────────────────────────────────────────────

  traceLine(start: Vec3, end: Vec3, mask: number, filter: TraceFilter | null, out: TraceResult = emptyTrace()): TraceResult {
    return this.collision.traceLine(start, end, mask, filter, out);
  }

  traceHull(start: Vec3, end: Vec3, mins: Vec3, maxs: Vec3, mask: number, filter: TraceFilter | null, out: TraceResult = emptyTrace()): TraceResult {
    return this.collision.traceHull(start, end, mins, maxs, mask, filter, out);
  }

  // ─── Host view ────────────────────────────────────────────────────────────

  /** Everything the renderer and HUD need this frame. */
  snapshot(): SpSnapshot {
    const p = this.player;
    const entities: SpEntityState[] = [];
    this.forEachEntity((e) => {
      if (e === this.worldEntity || e === p) return;
      const sp = e instanceof SpEntity ? e : null;
      const extra = (e as Entity & { extra?: Record<string, unknown> | null }).extra ?? null;
      const drawable = e.model !== '' || e.bspModel > 0 || extra !== null;
      if (!drawable) return;
      const disabled = (e as Entity & { disabled?: boolean }).disabled === true && e.bspModel > 0 && e.classname === 'func_brush';
      const a = sp?.anim ?? null;
      entities.push({
        id: e.id,
        classname: e.classname,
        targetname: e.targetname,
        model: e.model,
        bspModel: e.bspModel,
        origin: { x: e.origin.x, y: e.origin.y, z: e.origin.z },
        angles: { x: e.angles.x, y: e.angles.y, z: e.angles.z },
        skin: e.skin,
        body: e.body,
        effects: e.effects,
        renderMode: e.renderMode,
        renderAlpha: e.renderAlpha,
        renderColor: e.renderColor,
        parent: e.parent,
        visible: (e.effects & 0x20) === 0 && !disabled && (sp ? sp.visualOn : true),
        anim: a && sp ? { sequence: a.sequence, startTime: a.startTime, rate: a.rate, loop: a.loop, cycle: sp.animCycle() } : null,
        extra,
      });
    });
    const vc = this.viewControl;
    return {
      tick: this.tickCount,
      curtime: this.curtime,
      map: this.mapName,
      player: {
        origin: { ...p.origin },
        velocity: { ...p.move.velocity },
        eyeAngles: { ...p.eyeAngles },
        viewOffsetZ: p.move.viewOffsetZ,
        punchAngle: { ...p.move.punchAngle },
        ducked: p.move.ducked,
        onGround: (p.move.flags & FL_ONGROUND) !== 0,
        health: p.health,
        armor: p.armor,
        hasSuit: p.hasSuit,
        suitPower: p.suitPower,
        sprinting: p.sprinting,
        flashlight: p.flashlight,
        dead: p.dead,
        held: p.held ? p.held.id : NO_ENTITY,
        portalgun: p.portalgun ? { canFire1: p.portalgun.canFire1, canFire2: p.portalgun.canFire2 } : null,
      },
      view: vc ? { entity: vc.id, origin: { ...vc.origin }, angles: { ...vc.angles } } : null,
      entities,
      portals: this.portals.state(),
      soundscape: this.soundscape,
    };
  }

  /** Frees the physics world (call when unloading the map). */
  dispose(): void {
    this.physics.free();
  }
}

const EMPTY: readonly Entity[] = [];
const touchList: Entity[] = [];
const tMins = vec3();
const tMaxs = vec3();
const mvOldO = vec3();
const mvOldA = vec3();
const mvPush = vec3();
const mvCenter = vec3();
const mvRel = vec3();
const mvTo = vec3();
const mvM0 = new Float64Array(9);
const mvM1 = new Float64Array(9);
const mvTrace = emptyTrace();
const fpA = new Float64Array(9);
const fpB = new Float64Array(9);
const fpBT = new Float64Array(9);
const fpC = new Float64Array(9);
const fpD = new Float64Array(9);
const fpV = vec3();
