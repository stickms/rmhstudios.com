/**
 * The shared building behaviour every TF object uses (the SDK's CBaseObject,
 * tf_obj.cpp + baseobject_shared.cpp): placement as a blueprint
 * (CalculatePlacementPos / IsPlacementPosValid / EstimateValidBuildPos),
 * construction (StartBuilding → BaseObjectThink → Construct, sped up by
 * wrench hits and carry redeploys), the upgrade state machine
 * (CheckUpgradeOnHit → StartUpgrading → UpgradeThink → FinishUpgrading),
 * wrench work (InputWrenchHit / OnWrenchHit / Command_Repair), sappers and
 * plasma (UpdateDisabledState), carrying (MakeCarriedObject /
 * DropCarriedObject), and destruction (Killed → Explode → CreateObjectGibs,
 * DetonateObject, RemoveAllObjects).
 *
 * Thinks are scheduled like the engine's SetNextThink: a think time rounds to
 * the nearest tick (TIME_TO_TICKS), so the 0.1 s base think runs every 7
 * ticks (0.105 s) and the 0.05 s sentry/teleporter think every 3 (0.045 s).
 */

import { NO_ENTITY, emptyTrace, WORLD_ENTITY, type TraceFilter } from '../../core/types';
import {
  CONTENTS_PLAYERCLIP,
  MASK_PLAYERSOLID_BRUSHONLY,
  MASK_SOLID,
  TF_CLASS_ENGINEER,
  TF_CLASS_MEDIC,
  TF_CLASS_SPY,
  MOVETYPE_NONE,
  TF_TEAM_RED,
  VEC_HULL_MAX,
  VEC_HULL_MIN,
  ticksToTime,
  timeToTicks,
} from '../../core/constants';
import { angleNormalize, angleVectors, copy, set, vec3, type Vec3 } from '../../core/vec';
import { BUILDING, OBJECT_INFO, WRENCH, buildingMaxHealth, type ObjectInfo } from '../../data';
import {
  BaseObject,
  OBJ_ATTACHMENT_SAPPER,
  OBJ_DISPENSER,
  OBJ_SENTRYGUN,
  OBJ_TELEPORTER,
  OBJECT_CONSTRUCTION_STARTINGHEALTH,
  OBJECT_MAX_LEVEL,
} from '../building-api';
import {
  COLLISION_GROUP_PLAYER,
  COLLISION_GROUP_PLAYER_MOVEMENT,
  DAMAGE_NO,
  DAMAGE_YES,
  EF_NODRAW,
  FL_OBJECT,
  FSOLID_NOT_SOLID,
  SOLID_BBOX,
  TFCOLLISION_GROUP_OBJECT,
  TFCOLLISION_GROUP_OBJECT_SOLIDTOPLAYERMOVEMENT,
  type Entity,
} from '../entity';
import {
  createDamageInfo,
  resetDamageInfo,
  DMG_CLUB,
  DMG_CRUSH,
  DMG_GENERIC,
  TF_DMG_CUSTOM_CARRIED_BUILDING,
  TF_DMG_WRENCH_FIX,
  type DamageInfo,
} from '../damage';
import { GR_STATE_TEAM_WIN } from '../rules';
import { TriggerHurt } from '../triggers';
import type { NetRecord } from '../net-schema';
import type { Player } from '../player';
import type { Weapon } from '../weapon-api';
import type { GameWorld } from '../world';

// ─── Constants ───────────────────────────────────────────────────────────────

/** BASE_OBJECT_THINK_DELAY (tf_obj.cpp). */
export const BASE_OBJECT_THINK_DELAY = 0.1;
/** TF_AMMO_METAL. */
export const TF_AMMO_METAL = 3;
/** CBaseObject::IsPlacementPosValid: the "not on another building" box. */
const PLACEMENT_OBJECT_BOX = 24;
const PLACEMENT_OBJECT_BOX_DEPTH = 32;
/** CreateObjectGibs: half the build cost when objects.txt gives no gib metal. */
const GIB_METAL_COST_FRACTION = 0.5;

/** OBJ_* → objects.txt entry. */
export const OBJECT_INFO_BY_TYPE: readonly ObjectInfo[] = [
  OBJECT_INFO.OBJ_DISPENSER,
  OBJECT_INFO.OBJ_TELEPORTER,
  OBJECT_INFO.OBJ_SENTRYGUN,
  OBJECT_INFO.OBJ_ATTACHMENT_SAPPER,
];

/** The engine's think time: SetNextThink rounds to the nearest tick (TIME_TO_TICKS). */
export const thinkTime = (t: number): number => ticksToTime(timeToTicks(t));
const due = (at: number, now: number): boolean => at >= 0 && at <= now + 1e-9;

/** The class allowed to build an object type (CTFPlayerClass::CanBuildObject). */
export function classCanBuild(cls: number, objectType: number): boolean {
  if (objectType === OBJ_ATTACHMENT_SAPPER) return cls === TF_CLASS_SPY;
  return (
    cls === TF_CLASS_ENGINEER &&
    (objectType === OBJ_SENTRYGUN || objectType === OBJ_DISPENSER || objectType === OBJ_TELEPORTER)
  );
}

/** The SDK's ApproachAngle. */
function approachAngle(target: number, value: number, speed: number): number {
  const delta = angleNormalize(target - value);
  if (speed < 0) speed = -speed;
  if (delta > speed) value += speed;
  else if (delta < -speed) value -= speed;
  else value = target;
  return value;
}

/** UTIL_AngleMod: wraps into [0, 360). */
export function angleMod(a: number): number {
  a %= 360;
  if (a < 0) a += 360;
  return a;
}

// ─── Per-world object list (CTFTeam::m_aObjects / CTFPlayer::m_aObjects) ─────

const worldObjects = new WeakMap<GameWorld, TFBaseObject[]>();

/** Every live TF object in a world, in creation order (no allocation per call). */
export function objectsOf(world: GameWorld): TFBaseObject[] {
  let list = worldObjects.get(world);
  if (!list) {
    list = [];
    worldObjects.set(world, list);
  }
  return list;
}

// ─── Scratch ─────────────────────────────────────────────────────────────────

const tr = emptyTrace();
const tr2 = emptyTrace();
const sA = vec3();
const sB = vec3();
const sC = vec3();
const sMins = vec3();
const sMaxs = vec3();
const sHalfXY = vec3();
const sNegHalfXY = vec3();
const sCenter = vec3();
const SMALL_MINS: Vec3 = { x: -2, y: -2, z: -2 };
const SMALL_MAXS: Vec3 = { x: 2, y: 2, z: 2 };
const killInfo = createDamageInfo();
const wrenchInfo = createDamageInfo();

/** Wrench construction boosts (m_ConstructorList): one slot per player id. */
interface ConstructorHit {
  value: number;
  expire: number;
}

/** What a wrench offers (CTFWrench::GetRepairAmount / GetConstructionValue); optional on the weapon. */
interface WrenchLike {
  repairAmount?: () => number;
  constructionValue?: () => number;
}

/**
 * CBaseObject for the TF buildings. Subclasses supply `objectType`,
 * `baseHealth`, the hull and the hooks (onGoActive, contextThink…).
 */
export abstract class TFBaseObject extends BaseObject {
  /** GetBaseHealth. */
  abstract readonly baseHealth: number;
  abstract readonly objMins: Readonly<Vec3>;
  abstract readonly objMaxs: Readonly<Vec3>;

  /** m_vecBuildMins / m_vecBuildMaxs (relative, padded 4 units in X/Y). */
  readonly buildMins = vec3();
  readonly buildMaxs = vec3();
  readonly buildOrigin = vec3();
  readonly buildCenterOfMass = vec3();
  readonly buildForward = vec3();
  buildDistance = 0;
  /** m_bPlacementOK (IsValidPlacement). */
  placementOk = false;
  /** m_iDesiredBuildRotations (0–3 quarter turns) and the eased m_flCurrentBuildRotation. */
  desiredBuildRotations = 0;
  currentBuildRotation = 0;

  /** m_flConstructionTimeLeft. */
  constructionTimeLeft = 0;
  /** m_ConstructorList by player id. */
  private readonly constructors = new Map<number, ConstructorHit>();

  /** m_iUpgradeMetalRequired. */
  upgradeMetalRequired = 0;
  /** IsUpgrading(): the upgrade animation is playing. */
  upgrading = false;
  upgradeCompleteTime = 0;
  /** m_iHighestUpgradeLevel (a redeployed building climbs back to it). */
  highestLevel = 1;
  /** m_bCarryDeploy / m_flCarryDeployTime / m_iHealthOnPickup. */
  carryDeploy = false;
  carryDeployTime = 0;
  healthOnPickup = 0;
  /** Plasma disable (Cow Mangler; SAPPER_REMOVE_DISABLE_TIME after a sapper comes off). */
  plasmaDisabled = false;
  plasmaDisableTime = 0;
  /** The attached sapper (m_bHasSapper + its handle). */
  sapperId: number = NO_ENTITY;
  /** m_bDying. */
  dying = false;
  /** Kills and assists credited to this building (sentry HUD). */
  kills = 0;
  assists = 0;
  /** Placed by the map rather than an engineer (m_bWasMapPlaced). */
  mapPlaced = false;

  private baseNextThink = -1;
  /** The subclass's context think (SetContextThink), -1 when none. */
  protected contextNextThink = -1;
  private spawnedOnce = false;

  constructor(classname: string) {
    super(classname);
  }

  /** objects.txt entry. */
  get info(): ObjectInfo {
    return OBJECT_INFO_BY_TYPE[this.objectType];
  }

  get hasSapper(): boolean {
    return this.sapped;
  }

  /** The entity's eye (EyePosition: origin + view offset = the box centre at Spawn). */
  eyePosition(out: Vec3): Vec3 {
    return this.worldSpaceCenter(out);
  }

  // ─── Spawning ──────────────────────────────────────────────────────────────

  override spawn(): void {
    super.spawn();
    if (!this.spawnedOnce) {
      this.spawnedOnce = true;
      objectsOf(this.world).push(this);
    }
    this.flags |= FL_OBJECT;
    this.solid = SOLID_BBOX;
    this.moveType = MOVETYPE_NONE;
    this.respawnObject();
    this.firstSpawn();
  }

  /** SDK: CBaseObject::Spawn (also re-run when a carried building is placed again). */
  respawnObject(): void {
    this.setSize(this.objMins, this.objMaxs);
    this.collisionGroup = this.info.solidToPlayerMovement
      ? TFCOLLISION_GROUP_OBJECT_SOLIDTOPLAYERMOVEMENT
      : TFCOLLISION_GROUP_OBJECT;
    this.sapped = false;
    this.sapperId = NO_ENTITY;
    this.takeDamage = DAMAGE_YES;
    this.desiredBuildRotations = 0;
    this.currentBuildRotation = 0;
    this.level = 1;
    this.upgradeMetalRequired = this.upgradeMetalRequiredFor();
    this.onRespawnObject();
  }

  /** SDK: CBaseObject::FirstSpawn — first creation only. */
  protected firstSpawn(): void {
    this.upgradeMetal = 0;
    this.kills = 0;
    this.assists = 0;
    this.maxHealth = this.maxHealthForCurrentLevel();
    this.health = this.maxHealth;
    this.baseNextThink = thinkTime(this.world.curtime + BASE_OBJECT_THINK_DELAY);
    this.scheduleThink();
  }

  /** Subclass part of Spawn (models, ammo, state). */
  protected onRespawnObject(): void {}

  override onRemove(): void {
    const list = objectsOf(this.world);
    const i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
    // A sapper goes with its building (IsParentValid fails → DestroyObject).
    if (this.sapperId !== NO_ENTITY) {
      const s = this.world.entity(this.sapperId);
      if (s) this.world.remove(s);
      this.sapperId = NO_ENTITY;
    }
    super.onRemove();
  }

  // ─── Health and levels ────────────────────────────────────────────────────

  /** SDK: CBaseObject::GetMaxHealthForCurrentLevel. */
  maxHealthForCurrentLevel(): number {
    return buildingMaxHealth(this.baseHealth, this.level);
  }

  /** GetUpgradeMetalRequired. */
  upgradeMetalRequiredFor(): number {
    return this.info.upgradeCost;
  }

  /** SDK: CBaseObject::SetHealth — a redeploying building can't exceed its pickup health. */
  setHealth(h: number): void {
    if (this.carryDeploy && h > this.healthOnPickup) h = this.healthOnPickup;
    this.health = h;
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  // ─── Thinking ─────────────────────────────────────────────────────────────

  /** Runs the due thinks (the base think and the subclass's context think). */
  override think(): void {
    const now = this.world.curtime;
    if (due(this.baseNextThink, now)) {
      this.baseNextThink = thinkTime(now + BASE_OBJECT_THINK_DELAY);
      this.baseObjectThink();
      if (this.removed) return;
    }
    if (due(this.contextNextThink, now)) {
      this.contextNextThink = -1;
      this.contextThink();
      if (this.removed) return;
    }
    this.scheduleThink();
  }

  /** Sets the context think `seconds` from now. */
  protected setContextThinkIn(seconds: number): void {
    this.contextNextThink = thinkTime(this.world.curtime + seconds);
    this.scheduleThink();
  }

  protected scheduleThink(): void {
    let t = this.baseNextThink;
    if (this.contextNextThink >= 0 && (t < 0 || this.contextNextThink < t))
      t = this.contextNextThink;
    this.thinkFn = null;
    this.nextThink = t;
  }

  /** The subclass's SetContextThink target (SentryThink, DispenseThink, TeleporterThink, SapperThink). */
  protected contextThink(): void {}

  /** SDK: CBaseObject::BaseObjectThink. */
  protected baseObjectThink(): void {
    const world = this.world;
    if (this.plasmaDisabled && world.curtime > this.plasmaDisableTime) this.plasmaDisabled = false;
    if (!this.checkBuilder()) return;
    this.updateDisabledState();

    if (this.placing) {
      this.updateDesiredBuildRotation(BASE_OBJECT_THINK_DELAY);
      return;
    }
    if (this.carried) {
      const b = this.builderPlayer();
      if (b) copy(this.origin, b.origin);
      return;
    }
    if (this.building) {
      this.constructThink();
      return;
    }
    if (this.upgrading) this.upgradeThink();
    else if (this.level < this.highestLevel) this.startUpgrading();
    else this.carryDeploy = false;
  }

  /**
   * The builder is still entitled to the building: buildings go when the
   * builder leaves, changes team (CTFPlayer::ChangeTeam → RemoveAllOwnedEntitiesFromWorld(true)),
   * or changes class (ForceRespawn → RemoveAllOwnedEntitiesFromWorld(), no explosion);
   * a carried building dies with its carrier (CTFPlayer::Event_Killed). Returns false
   * when this building is gone.
   */
  protected checkBuilder(): boolean {
    if (this.mapPlaced) return true;
    const b = this.world.entity(this.builder);
    if (!b || !b.isPlayer()) {
      this.detonate();
      return false;
    }
    const p = b as Player;
    if (p.team !== this.team) {
      this.detonate();
      return false;
    }
    if (!classCanBuild(p.playerClass, this.objectType)) {
      removeObjectQuietly(this);
      return false;
    }
    if (this.carried && !p.alive) {
      const info = killInfo;
      resetInfo(info);
      const killer = p.recentDamager(0, 10);
      info.attacker = killer ? killer.id : p.id;
      info.inflictor = info.attacker;
      info.damageType = DMG_GENERIC;
      info.customKill = TF_DMG_CUSTOM_CARRIED_BUILDING;
      copy(info.position, this.origin);
      this.dropCarriedObject(p);
      this.onKilled(info);
      return false;
    }
    return true;
  }

  // ─── Placement ────────────────────────────────────────────────────────────

  /** SDK: CBaseObject::StartPlacement. */
  startPlacement(player: Player | null): void {
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.placing = true;
    this.building = false;
    if (player) {
      this.builder = player.id;
      this.owner = player.id;
      this.team = player.team;
    }
    this.effects &= ~EF_NODRAW;
    this.buildMins.x = this.mins.x - 4;
    this.buildMins.y = this.mins.y - 4;
    this.buildMins.z = this.mins.z;
    this.buildMaxs.x = this.maxs.x + 4;
    this.buildMaxs.y = this.maxs.y + 4;
    this.buildMaxs.z = this.maxs.z;
    this.skin = this.team === TF_TEAM_RED ? 0 : 1;
    this.onStartPlacement(player);
  }

  protected onStartPlacement(_player: Player | null): void {}

  /** SDK: CBaseObject::StopPlacement — the blueprint goes away. */
  stopPlacement(): void {
    this.world.remove(this);
  }

  /** SDK: CBaseObject::RotateBuildAngles (attack2 with the blueprint out). */
  rotateBuildAngles(): void {
    this.desiredBuildRotations = (this.desiredBuildRotations + 1) % 4;
  }

  /** SDK: CBaseObject::UpdateDesiredBuildRotation (tf_obj_build_rotation_speed). */
  updateDesiredBuildRotation(dt: number): void {
    this.currentBuildRotation = approachAngle(
      90 * this.desiredBuildRotations,
      this.currentBuildRotation,
      BUILDING.blueprintRotationSpeed * dt,
    );
  }

  /** SDK: CBaseObject::UpdatePlacement — find a spot, validate it, move the blueprint there. */
  updatePlacement(): boolean {
    this.placementOk = this.isPlacementPosValid();
    copy(this.origin, this.buildOrigin);
    return this.placementOk;
  }

  /** A filter for the brush-only placement traces: the map and brush entities, never boxes. */
  private brushOnlyFilter(): TraceFilter {
    let f = this.brushFilterFn;
    if (!f) {
      f = (id, mask) => {
        if (id === WORLD_ENTITY) return true;
        const e = this.world.entity(id);
        if (!e) return true;
        if (e === this || e.isBaseObject() || e.isPlayer()) return false;
        return e.shouldCollide(COLLISION_GROUP_PLAYER_MOVEMENT, mask);
      };
      this.brushFilterFn = f;
    }
    return f;
  }

  /** The map-only trace filter (created once). */
  private brushFilterFn: TraceFilter | null = null;

  /** SDK: CBaseObject::CalculatePlacementPos. */
  calculatePlacementPos(): boolean {
    const player = this.builderPlayer();
    if (!player) return false;
    const world = this.world;
    const yaw = player.eyeAngles.y;
    this.angles.x = 0;
    this.angles.y = yaw + this.currentBuildRotation;
    this.angles.z = 0;
    set(sA, 0, yaw, 0);
    angleVectors(sA, this.buildForward);

    const objRX = Math.max(Math.abs(this.buildMins.x), Math.abs(this.buildMaxs.x));
    const objRY = Math.max(Math.abs(this.buildMins.y), Math.abs(this.buildMaxs.y));
    const plRX = Math.max(Math.abs(player.mins.x), Math.abs(player.maxs.x));
    const plRY = Math.max(Math.abs(player.mins.y), Math.abs(player.maxs.y));
    this.buildDistance = Math.hypot(objRX, objRY) + Math.hypot(plRX, plRY) + 4;
    player.worldSpaceCenter(sCenter);
    const bo = this.buildOrigin;
    bo.x = sCenter.x + this.buildForward.x * this.buildDistance;
    bo.y = sCenter.y + this.buildForward.y * this.buildDistance;
    bo.z = sCenter.z + this.buildForward.z * this.buildDistance;

    const dimX = this.buildMaxs.x - this.buildMins.x;
    const dimY = this.buildMaxs.y - this.buildMins.y;
    const dimZ = this.buildMaxs.z - this.buildMins.z;
    const halfX = dimX * 0.5;
    const halfY = dimY * 0.5;
    const halfZ = dimZ * 0.5;
    // vErrorOrigin: where the blueprint sits while invalid.
    const errX = bo.x - halfX - this.buildMins.x;
    const errY = bo.y - halfY - this.buildMins.y;
    const errZ = bo.z - halfZ - this.buildMins.z;
    const fail = (): boolean => {
      set(this.buildOrigin, errX, errY, errZ);
      return false;
    };

    set(sHalfXY, halfX, halfY, 0);
    set(sNegHalfXY, -halfX, -halfY, 0);
    const halfPlayerZ = (player.maxs.z - player.mins.z) * 0.5;
    const boxTopZ = sCenter.z + halfPlayerZ + dimZ;
    const boxBottomZ = sCenter.z - halfPlayerZ - dimZ;
    const filter = this.brushOnlyFilter();

    // Sweep the footprint down to find the ground, starting lower when the top is in something.
    const iterations = 8;
    let topZ = boxTopZ;
    const topZInc = (boxBottomZ - boxTopZ) / (iterations - 1);
    let bottomZ = 0;
    let it = 0;
    for (; it < iterations; it++) {
      set(sA, bo.x, bo.y, topZ);
      set(sB, bo.x, bo.y, boxBottomZ);
      world.traceHull(sA, sB, sNegHalfXY, sHalfXY, MASK_PLAYERSOLID_BRUSHONLY, filter, tr);
      bottomZ = tr.endPos.z;
      if (tr.fraction === 1) return fail();
      if (topZ - bottomZ > dimZ && !tr.startSolid) break;
      topZ += topZInc;
    }
    if (it === iterations) return fail();
    if (topZ - bottomZ < dimZ) return fail();
    const ground = tr.entity > 0 ? world.entity(tr.entity) : null;
    if (ground && ground.classname === 'func_tracktrain') return fail();

    // Not too steep: every corner finds ground within tf_obj_ground_clearance.
    set(sC, bo.x, bo.y, bottomZ);
    if (
      !this.verifyCorner(sC, -halfX, -halfY, filter) ||
      !this.verifyCorner(sC, halfX, halfY, filter) ||
      !this.verifyCorner(sC, halfX, -halfY, filter) ||
      !this.verifyCorner(sC, -halfX, halfY, filter)
    ) {
      return fail();
    }

    bo.x = bo.x - halfX - this.buildMins.x;
    bo.y = bo.y - halfY - this.buildMins.y;
    bo.z = bottomZ - this.buildMins.z;
    set(this.buildCenterOfMass, bo.x, bo.y, bo.z + halfZ);
    return true;
  }

  /** SDK: CBaseObject::VerifyCorner — ground within 32 units, no slope steeper than ~49°. */
  private verifyCorner(
    bottomCenter: Vec3,
    xOff: number,
    yOff: number,
    filter: TraceFilter,
  ): boolean {
    set(sA, bottomCenter.x + xOff, bottomCenter.y + yOff, bottomCenter.z + 2);
    set(sB, sA.x, sA.y, sA.z - BUILDING.groundClearance);
    this.world.traceLine(sA, sB, MASK_PLAYERSOLID_BRUSHONLY, filter, tr2);
    if (tr2.fraction < 1) {
      const n = tr2.plane.normal;
      const len = Math.hypot(n.x, n.y, n.z) || 1;
      if (n.z / len < 0.65) return false;
    }
    return !tr2.startSolid && tr2.fraction < 1;
  }

  /** SDK: CBaseObject::EstimateValidBuildPos — no-build brushes, trigger_hurt, respawn rooms. */
  estimateValidBuildPos(): boolean {
    const world = this.world;
    if (world.inNoBuildZone(this.buildOrigin, this.objectType, this.team)) return false;
    if (world.inNoBuildZone(this.buildCenterOfMass, this.objectType, this.team)) return false;
    if (
      takingTriggerHurtAt(world, this.buildOrigin) ||
      takingTriggerHurtAt(world, this.buildCenterOfMass)
    )
      return false;
    if (world.pointInRespawnRoom(null, this.buildOrigin)) return false;
    if (world.pointInRespawnRoom(null, this.buildCenterOfMass)) return false;
    return true;
  }

  /** SDK: CBaseObject::IsPlacementPosValid. */
  isPlacementPosValid(): boolean {
    if (!this.calculatePlacementPos()) return false;
    const player = this.builderPlayer();
    if (!player) return false;
    if (!this.estimateValidBuildPos()) return false;
    const world = this.world;
    // The whole object fits: players and other buildings count (COLLISION_GROUP_PLAYER).
    const f = world.entityFilter(this, COLLISION_GROUP_PLAYER);
    world.traceHull(this.buildOrigin, this.buildOrigin, this.mins, this.maxs, MASK_SOLID, f, tr);
    if (tr.fraction < 1 || tr.startSolid) return false;
    // The builder can see the spot (small hull, catches seams).
    player.eyePosition(sA);
    set(sB, this.buildOrigin.x, this.buildOrigin.y, this.buildOrigin.z + this.buildMaxs.z * 0.5);
    world.traceHull(
      sA,
      sB,
      SMALL_MINS,
      SMALL_MAXS,
      MASK_PLAYERSOLID_BRUSHONLY,
      this.brushOnlyFilter(),
      tr,
    );
    if (tr.fraction < 1) return false;
    // Not on top of another building (stairs, inclines).
    const list = objectsOf(world);
    set(
      sMins,
      this.buildOrigin.x - PLACEMENT_OBJECT_BOX,
      this.buildOrigin.y - PLACEMENT_OBJECT_BOX,
      this.buildOrigin.z - PLACEMENT_OBJECT_BOX_DEPTH,
    );
    set(
      sMaxs,
      this.buildOrigin.x + PLACEMENT_OBJECT_BOX,
      this.buildOrigin.y + PLACEMENT_OBJECT_BOX,
      this.buildOrigin.z + PLACEMENT_OBJECT_BOX,
    );
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (
        o === this ||
        o.removed ||
        o.placing ||
        o.carried ||
        o.objectType === OBJ_ATTACHMENT_SAPPER
      )
        continue;
      if (boxesOverlap(o, sMins, sMaxs)) return false;
    }
    return this.extraPlacementCheck();
  }

  /** Subclass extra placement rules (teleporter: a player fits on top). */
  protected extraPlacementCheck(): boolean {
    return true;
  }

  /** Box test used by teleporters: VEC_HULL at `pos` is clear of the map (MASK_SOLID | CONTENTS_PLAYERCLIP). */
  protected hullClearAt(pos: Vec3): boolean {
    this.world.traceHull(
      pos,
      pos,
      VEC_HULL_MIN,
      VEC_HULL_MAX,
      MASK_SOLID | CONTENTS_PLAYERCLIP,
      this.brushOnlyFilter(),
      tr,
    );
    return tr.fraction >= 1 && !tr.startSolid;
  }

  // ─── Construction ─────────────────────────────────────────────────────────

  /** GetTotalTime (objects.txt BuildTime). */
  totalTime(): number {
    return this.info.buildTime;
  }

  /**
   * SDK: CBaseObject::StartBuilding. Charges the builder (StartedBuildingObject), or
   * redeploys a carried building. False (and the blueprint is removed) when the builder
   * can't pay.
   */
  override startBuilding(builder: Player | null): void {
    this.startBuildingChecked(builder);
  }

  startBuildingChecked(builder: Player | null): boolean {
    const world = this.world;
    if (builder) {
      if (!this.carried) {
        const cost = objectCost(this.objectType);
        if (cost > builder.ammo[TF_AMMO_METAL]) {
          world.events.push({
            type: 'hud',
            kind: 'center',
            key: '#TF_Not_Enough_Resources',
            to: builder.id,
          });
          this.stopPlacement();
          return false;
        }
        builder.ammo[TF_AMMO_METAL] -= cost;
      } else {
        this.carried = false;
        this.carryDeploy = true;
        this.carryDeployTime = world.curtime;
      }
      this.builder = builder.id;
      this.owner = builder.id;
      this.team = builder.team;
    }
    this.placing = false;
    this.building = true;
    this.takeDamage = DAMAGE_YES;
    this.health = this.carryDeploy ? this.healthOnPickup : OBJECT_CONSTRUCTION_STARTINGHEALTH;
    this.buildProgress = 0;
    this.renderAlpha = 255;
    this.solidFlags &= ~FSOLID_NOT_SOLID;
    this.effects &= ~EF_NODRAW;
    this.totalConstructionTime = this.totalTime();
    this.constructionTimeLeft = this.totalConstructionTime;
    copy(this.buildOrigin, this.origin);
    this.onStartBuilding();
    return true;
  }

  /** Subclass part of StartBuilding (models, state). */
  protected onStartBuilding(): void {}

  /** SDK: CBaseObject::OnConstructionHit — a wrench hit adds its construction value for 1 s. */
  onConstructionHit(player: Player, value: number): void {
    let c = this.constructors.get(player.id);
    if (!c) {
      c = { value, expire: 0 };
      this.constructors.set(player.id, c);
    }
    c.expire = this.world.curtime + WRENCH.constructionHitDuration;
    this.world.emitEffect({
      kind: 'particle',
      system: 'nutsnbolts_build',
      pos: this.worldSpaceCenter(vec3()),
    });
  }

  /** SDK: CBaseObject::GetConstructionMultiplier. */
  override constructionMultiplier(): number {
    let mult = 1;
    const now = this.world.curtime;
    for (const [id, c] of this.constructors) {
      if (c.expire < now) this.constructors.delete(id);
      else mult += c.value;
    }
    if (this.builderPlayer()) mult += redeployBuildBonus(this.objectType, this.carryDeploy);
    return mult;
  }

  /** SDK: CBaseObject::BuildingThink. */
  protected constructThink(): void {
    this.construct(
      ((this.maxHealth - OBJECT_CONSTRUCTION_STARTINGHEALTH) / this.totalConstructionTime) *
        OBJECT_CONSTRUCTION_INTERVAL_S,
    );
  }

  /** SDK: CBaseObject::Construct. Returns true once built / fully healed. */
  construct(amount: number): boolean {
    const h = amount * this.constructionMultiplier();
    if (!h) return false;
    if (this.building) {
      const rate =
        (this.maxHealth - OBJECT_CONSTRUCTION_STARTINGHEALTH) / this.totalConstructionTime;
      const t = Math.abs(h / rate);
      this.constructionTimeLeft = Math.min(
        this.totalConstructionTime,
        Math.max(0, this.constructionTimeLeft - t),
      );
      this.buildProgress = Math.min(
        1,
        Math.max(0, 1 - this.constructionTimeLeft / this.totalConstructionTime),
      );
      this.setHealth(Math.min(this.maxHealth, this.health + h));
      // m_iHealth is ceil(m_flHealth): float steps that land a hair under max count as max.
      if (this.maxHealth - this.health < 1e-6) this.setHealth(this.maxHealth);
      if (this.constructionTimeLeft <= 1e-6) {
        this.finishedBuilding();
        return true;
      }
      return false;
    }
    if (this.health >= this.maxHealth) return true;
    this.setHealth(Math.min(this.maxHealth, Math.max(1, this.health + h)));
    return this.health === this.maxHealth;
  }

  /** SDK: CBaseObject::FinishedBuilding → OnGoActive. */
  override finishedBuilding(): void {
    this.building = false;
    this.buildProgress = 1;
    this.collisionGroup = this.info.solidToPlayerMovement
      ? TFCOLLISION_GROUP_OBJECT_SOLIDTOPLAYERMOVEMENT
      : TFCOLLISION_GROUP_OBJECT;
    this.world.events.push({
      type: 'object',
      kind: 'built',
      object: this.id,
      objectType: this.objectType,
      owner: this.builder,
    });
    this.onGoActive();
    this.updateDisabledState();
  }

  /** SDK: OnGoActive (subclass). */
  protected onGoActive(): void {}

  // ─── Upgrades ─────────────────────────────────────────────────────────────

  /** SDK: CBaseObject::CanBeUpgraded(pPlayer). */
  canBeUpgraded(player: Player): boolean {
    if (this.upgrading) return false;
    if (!classCanBuild(player.playerClass, this.objectType)) return false;
    return this.level < OBJECT_MAX_LEVEL;
  }

  /** SDK: CBaseObject::GetUpgradeAmountPerHit (doubled during setup). */
  upgradeAmountPerHit(): number {
    return BUILDING.upgradeMetalPerHit * (this.world.rules.inSetup ? 2 : 1);
  }

  /** SDK: CBaseObject::CheckUpgradeOnHit. */
  checkUpgradeOnHit(player: Player): boolean {
    if (this.carryDeploy) return false;
    if (!this.canBeUpgraded(player)) return false;
    const metal = player.ammo[TF_AMMO_METAL];
    let add = Math.min(this.upgradeAmountPerHit(), metal);
    if (add > this.upgradeMetalRequired - this.upgradeMetal)
      add = this.upgradeMetalRequired - this.upgradeMetal;
    player.ammo[TF_AMMO_METAL] -= add;
    this.upgradeMetal += add;
    if (this.upgradeMetal >= this.upgradeMetalRequired) {
      this.startUpgrading();
      this.upgradeMetal = 0;
    }
    return add > 0;
  }

  /** SDK: CBaseObject::StartUpgrading. */
  startUpgrading(): void {
    this.level++;
    if (this.highestLevel < this.level) this.highestLevel = this.level;
    if (!this.carryDeploy) {
      const mh = this.maxHealthForCurrentLevel();
      this.maxHealth = mh;
      this.health = mh;
    }
    const s = this.info.upgradeSound;
    if (s) this.world.emitSound(s, { entity: this.id });
    this.upgrading = true;
    this.upgradeCompleteTime = this.world.curtime + this.info.upgradeDuration;
    this.world.events.push({
      type: 'object',
      kind: 'upgraded',
      object: this.id,
      objectType: this.objectType,
      owner: this.builder,
    });
    this.onStartUpgrading();
  }

  protected onStartUpgrading(): void {}

  /** SDK: CBaseObject::UpgradeThink. */
  protected upgradeThink(): void {
    if (this.world.curtime > this.upgradeCompleteTime) this.finishUpgrading();
  }

  /** SDK: CBaseObject::FinishUpgrading. */
  finishUpgrading(): void {
    this.upgrading = false;
    const s = this.info.upgradeSound;
    if (s) this.world.emitSound(s, { entity: this.id });
    this.onFinishUpgrading();
  }

  protected onFinishUpgrading(): void {}

  // ─── Wrench work ──────────────────────────────────────────────────────────

  /**
   * SDK: CBaseObject::InputWrenchHit — the weapons module calls this when a friendly
   * wrench hits the building. Damages a sapper, speeds up construction, or repairs /
   * upgrades / refills. Returns true when the hit did work.
   */
  onWrenchHit(player: Player, wrench: Weapon | null = null, hitLoc?: Vec3): boolean {
    if (!player || this.placing || this.carried || this.removed) return false;
    let did = false;
    if (this.sapped) {
      const sapper = this.world.entity(this.sapperId);
      if (sapper && sapper.isBaseObject()) {
        const before = sapper.health;
        const info = wrenchInfo;
        resetInfo(info);
        info.attacker = player.id;
        info.inflictor = player.id;
        info.damage = WRENCH.sapperDamage;
        info.damageType = DMG_CLUB;
        info.customKill = TF_DMG_WRENCH_FIX;
        info.weaponId = wrench ? wrench.weaponId : 0;
        info.weaponDefIndex = wrench ? wrench.defindex : -1;
        info.killIcon = wrench ? wrench.killIcon : 'wrench';
        sapper.worldSpaceCenter(info.position);
        this.world.applyDamage(sapper, info);
        did = sapper.removed || sapper.health !== before;
      }
    } else if (this.upgrading) {
      did = this.wrenchWork(player, wrench, hitLoc);
    } else if (this.building) {
      const w = wrench as (Weapon & WrenchLike) | null;
      this.onConstructionHit(
        player,
        w?.constructionValue ? w.constructionValue() : WRENCH.constructionValue,
      );
      did = true;
    } else {
      did = this.wrenchWork(player, wrench, hitLoc);
    }
    return did;
  }

  /** SDK: CBaseObject::OnWrenchHit — repair first, else put metal toward the next level. */
  protected wrenchWork(player: Player, wrench: Weapon | null, hitLoc?: Vec3): boolean {
    const repaired = this.commandRepair(player, wrenchRepairAmount(wrench), 1) > 0;
    const upgraded = !repaired && this.checkUpgradeOnHit(player);
    this.doWrenchHitEffect(hitLoc, repaired, upgraded);
    return repaired || upgraded;
  }

  protected doWrenchHitEffect(hitLoc: Vec3 | undefined, repair: boolean, upgrade: boolean): void {
    if (!repair && !upgrade) return;
    const pos = hitLoc ? { x: hitLoc.x, y: hitLoc.y, z: hitLoc.z } : this.worldSpaceCenter(vec3());
    this.world.emitEffect({
      kind: 'particle',
      system: repair ? 'nutsnbolts_repair' : 'nutsnbolts_upgrade',
      pos,
    });
  }

  /** CBaseObject::CanBeRepaired. */
  protected canBeRepaired(): boolean {
    return !this.building && !this.placing && !this.carried;
  }

  /**
   * SDK: CBaseObject::Command_Repair. Up to `amount × mod` health at `ratio` health per
   * metal (3; teleporters 5). Returns the health added.
   */
  commandRepair(
    player: Player,
    amount: number,
    mod: number,
    ratio: number = BUILDING.repairHealthPerMetal,
  ): number {
    if (!this.canBeRepaired()) return 0;
    const max = Math.round(amount * mod);
    const repair = Math.min(max, this.maxHealth - Math.round(this.health));
    let cost = Math.ceil(repair / ratio);
    if (cost > player.ammo[TF_AMMO_METAL]) cost = player.ammo[TF_AMMO_METAL];
    if (cost <= 0) return 0;
    let added = cost * ratio;
    let newHealth = Math.min(this.maxHealth, this.health + added);
    if (this.carryDeploy && newHealth > this.healthOnPickup) {
      newHealth = this.healthOnPickup;
      added = 0;
    } else player.ammo[TF_AMMO_METAL] -= cost;
    this.setHealth(newHealth);
    return added;
  }

  // ─── Disabled state, sappers ──────────────────────────────────────────────

  /** SDK: CBaseObject::UpdateDisabledState. */
  updateDisabledState(): void {
    const rules = this.world.rules;
    const lostRound = rules.state === GR_STATE_TEAM_WIN && rules.winningTeam !== this.team;
    this.setDisabled(this.sapped || this.plasmaDisabled || lostRound);
  }

  /** SDK: CBaseObject::SetDisabled. */
  setDisabled(disabled: boolean): void {
    if (disabled && !this.disabled) {
      this.disabled = true;
      this.onStartDisabled();
    } else if (!disabled && this.disabled) {
      this.disabled = false;
      this.onEndDisabled();
    }
  }

  protected onStartDisabled(): void {}
  protected onEndDisabled(): void {}

  /** SDK: CBaseObject::SetPlasmaDisabled. */
  setPlasmaDisabled(duration: number): void {
    this.plasmaDisabled = true;
    this.plasmaDisableTime = this.world.curtime + duration;
    this.updateDisabledState();
  }

  /** SDK: CBaseObject::OnAddSapper. */
  onAddSapper(sapperId: number): void {
    this.sapped = true;
    this.sapperId = sapperId;
    this.updateDisabledState();
  }

  /** SDK: CBaseObject::OnRemoveSapper. */
  onRemoveSapper(): void {
    this.sapped = false;
    this.sapperId = NO_ENTITY;
    this.updateDisabledState();
  }

  // ─── Carrying ─────────────────────────────────────────────────────────────

  /** SDK: CBaseObject::MakeCarriedObject. */
  makeCarriedObject(carrier: Player): void {
    this.carried = true;
    this.carryDeploy = false;
    this.placing = false;
    this.healthOnPickup = Math.ceil(this.health);
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.effects |= EF_NODRAW;
    this.takeDamage = DAMAGE_NO;
    this.builder = carrier.id;
    copy(this.origin, carrier.origin);
    this.onMakeCarried(carrier);
  }

  protected onMakeCarried(_carrier: Player): void {}

  /** SDK: CBaseObject::DropCarriedObject. */
  dropCarriedObject(_carrier: Player | null): void {
    this.carried = false;
    this.carryDeploy = false;
  }

  // ─── Damage and destruction ───────────────────────────────────────────────

  /** GetKillingWeaponName for kills by this building. */
  get killIcon(): string {
    return this.classname;
  }

  /**
   * SDK: CBaseObject::Killed. The scorer (GetDeathScorer), an assist for the sapper's
   * spy or the scorer's medic, the object_destroyed / object_detonated event, the
   * explosion and its metal gibs, then removal.
   */
  override onKilled(info: DamageInfo): void {
    if (this.dying || this.removed) return;
    this.dying = true;
    this.takeDamage = DAMAGE_NO;
    const world = this.world;
    const inflictor = world.entity(info.inflictor);
    const scorer = deathScorer(world, info.attacker);
    let assister: Player | null = null;
    const sapper = this.sapped ? world.entity(this.sapperId) : null;
    if (sapper && !(info.damageType & DMG_CRUSH) && !this.plasmaDisabled) {
      const spy = world.entity((sapper as TFBaseObject).builder);
      if (spy && spy.isPlayer()) assister = spy as Player;
    } else if (scorer && scorer.healers.length > 0) {
      const h = world.entity(scorer.healers[0].id);
      if (
        h &&
        h.isPlayer() &&
        !scorer.healers[0].dispenser &&
        (h as Player).playerClass === TF_CLASS_MEDIC
      )
        assister = h as Player;
    }
    if (assister === scorer) assister = null;

    if (scorer && inflictor !== this) {
      world.events.push({
        type: 'object',
        kind: 'destroyed',
        object: this.id,
        objectType: this.objectType,
        owner: this.builder,
        attacker: scorer.id,
        assister: assister ? assister.id : 0,
        weapon: killingWeaponName(world, info),
      });
      if (inflictor && inflictor !== this && inflictor instanceof TFBaseObject) inflictor.kills++;
      // CTF_GameStats.Event_PlayerDestroyedBuilding / assist (rules.onObjectDestroyed).
      const credited = info.attacker;
      info.attacker = scorer.id;
      world.rules.onObjectDestroyed(this, info, assister ? assister.id : NO_ENTITY);
      info.attacker = credited;
    } else {
      world.events.push({
        type: 'object',
        kind: 'detonated',
        object: this.id,
        objectType: this.objectType,
        owner: this.builder,
      });
    }
    this.explode();
    world.remove(this);
  }

  /** SDK: CBaseObject::Explode — sound, particle, metal gibs. */
  protected explode(): void {
    const world = this.world;
    const info = this.info;
    const pos = { x: this.origin.x, y: this.origin.y, z: this.origin.z };
    if (info.explodeSound) world.emitSound(info.explodeSound, { pos });
    if (info.explodeEffect)
      world.emitEffect({
        kind: 'particle',
        system: info.explodeEffect,
        pos,
        angles: { x: -90, y: 0, z: 0 },
      });
    world.emitEffect({
      kind: 'gibs',
      pos,
      entity: this.id,
      team: this.team,
      value: this.objectType,
      system: this.model,
    });
    this.createObjectGibs();
  }

  /** SDK: CBaseObject::CreateObjectGibs — half the build cost as metal (objects.txt MetalToDropInGibs when set). */
  protected createObjectGibs(): void {
    const world = this.world;
    if (!world.isServer) return;
    const info = this.info;
    const metal =
      info.metalToDropInGibs === 0
        ? Math.trunc(info.cost * GIB_METAL_COST_FRACTION)
        : info.metalToDropInGibs;
    if (metal <= 0) return;
    const r = world.random;
    const ix = r.randomFloat(-0.5, 0.5);
    const iy = r.randomFloat(-0.5, 0.5);
    const iz = r.randomFloat(0.75, 1.25);
    const speed = Math.min(
      BUILDING.gibMaxSpeed,
      r.randomFloat(BUILDING.gibVelocityMin, BUILDING.gibVelocityMax),
    );
    const len = Math.hypot(ix, iy, iz) || 1;
    const team = this.team;
    const origin = this.origin;
    const id = this.id;
    world.spawnEntity('tf_ammo_pack', (e) => {
      copy(e.origin, origin);
      e.origin.z += 8;
      e.owner = id;
      e.team = team;
      e.model = 'models/weapons/w_models/w_toolbox.mdl';
      e.skin = team === TF_TEAM_RED ? 0 : 1;
      set(e.velocity, (ix / len) * speed, (iy / len) * speed, (iz / len) * speed);
      const pack = e as Entity & { metal?: number; ammoRatio?: number };
      pack.metal = metal;
      pack.ammoRatio = 0;
    });
  }

  /** SDK: CBaseObject::DetonateObject — killed by itself (no credit, still explodes). */
  override detonate(): void {
    if (this.dying || this.removed) return;
    const info = killInfo;
    resetInfo(info);
    info.attacker = this.id;
    info.inflictor = this.id;
    info.damageType = DMG_GENERIC;
    copy(info.position, this.origin);
    this.onKilled(info);
  }

  // ─── Network ──────────────────────────────────────────────────────────────

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.highestLevel = this.highestLevel;
    out.upgradeMetalRequired = this.upgradeMetalRequired;
    out.upgrading = this.upgrading;
    out.upgradeProgress = this.upgrading
      ? Math.min(
          1,
          Math.max(
            0,
            1 - (this.upgradeCompleteTime - this.world.curtime) / (this.info.upgradeDuration || 1),
          ),
        )
      : 0;
    out.placementOk = this.placementOk;
    out.carryDeploy = this.carryDeploy;
    out.buildRotation = this.currentBuildRotation;
    out.kills = this.kills;
  }
}

// ─── Helpers shared with the weapons and the player helpers ─────────────────

const OBJECT_CONSTRUCTION_INTERVAL_S = BASE_OBJECT_THINK_DELAY;

const resetInfo = resetDamageInfo;

/** The metal an object costs to place (CTFPlayerShared::CalculateObjectCost). */
export function objectCost(objectType: number): number {
  const info = OBJECT_INFO_BY_TYPE[objectType];
  return info ? Math.trunc(info.cost * info.costMultiplier) : 0;
}

/** CTFPlayer::GetObjectBuildSpeedMultiplier: a redeployed sentry builds +2×, dispensers/teleporters +3×. */
export function redeployBuildBonus(objectType: number, redeploy: boolean): number {
  if (!redeploy) return 0;
  if (objectType === OBJ_SENTRYGUN) return 2;
  if (objectType === OBJ_DISPENSER || objectType === OBJ_TELEPORTER) return 3;
  return 0;
}

/** CTFWrench::GetRepairAmount, read from the weapon when it offers one. */
function wrenchRepairAmount(wrench: Weapon | null): number {
  const w = wrench as (Weapon & WrenchLike) | null;
  return w && w.repairAmount ? w.repairAmount() : WRENCH.repairPerHit;
}

/** CTFGameRules::GetDeathScorer: a player, or the builder of the object that did it. */
export function deathScorer(world: GameWorld, attackerId: number): Player | null {
  const a = world.entity(attackerId);
  if (!a) return null;
  if (a.isPlayer()) return a as Player;
  if (a.isBaseObject()) {
    const b = world.entity((a as BaseObject).builder);
    return b && b.isPlayer() ? (b as Player) : null;
  }
  return null;
}

/** CTFGameRules::GetKillingWeaponName, for building kills. */
export function killingWeaponName(world: GameWorld, info: DamageInfo): string {
  const inflictor = world.entity(info.inflictor);
  if (inflictor && inflictor instanceof TFBaseObject) return inflictor.killIcon;
  if (info.killIcon) return info.killIcon;
  return inflictor ? inflictor.classname : 'world';
}

/** IsTakingTriggerHurtDamageAtPoint: an enabled trigger_hurt doing damage covers the point. */
function takingTriggerHurtAt(world: GameWorld, p: Vec3): boolean {
  const list = world.entities;
  for (let i = 1; i < list.length; i++) {
    const e = list[i];
    if (!e || e.removed || !(e instanceof TriggerHurt)) continue;
    if (e.disabled || e.damage <= 0) continue;
    if (e.pointIsWithin(p)) return true;
  }
  return false;
}

function boxesOverlap(e: Entity, mins: Vec3, maxs: Vec3): boolean {
  return (
    mins.x < e.origin.x + e.maxs.x &&
    maxs.x > e.origin.x + e.mins.x &&
    mins.y < e.origin.y + e.maxs.y &&
    maxs.y > e.origin.y + e.mins.y &&
    mins.z < e.origin.z + e.maxs.z &&
    maxs.z > e.origin.z + e.mins.z
  );
}

/**
 * CTFPlayer::RemoveAllObjects(false) for one object: removed without an explosion
 * (class change), with an "object_removed" notice.
 */
export function removeObjectQuietly(obj: TFBaseObject): void {
  if (obj.removed) return;
  obj.world.events.push({
    type: 'object',
    kind: 'removed',
    object: obj.id,
    objectType: obj.objectType,
    owner: obj.builder,
  });
  obj.solid = 0;
  obj.world.remove(obj);
}
