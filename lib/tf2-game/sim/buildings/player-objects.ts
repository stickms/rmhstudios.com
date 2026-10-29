/**
 * A player's buildings (the object half of CTFPlayer / CTFPlayerShared):
 * CanBuild, GetObjectOfType / GetNumObjects, StartBuildingObjectOfType (the
 * build menu's "build <type> <mode>"), DetonateObjectOfType (the destroy
 * PDA's "destroy <type> <mode>"), RemoveAllObjects, carrying
 * (TryToPickupBuilding / CanPickupBuilding, attack2 for stock engineers via
 * DoClassSpecialSkill) and the Engineer HUD's per-building status.
 */

import { emptyTrace, WORLD_ENTITY } from '../../core/types';
import { CONTENTS_HITBOX, MASK_SOLID } from '../../core/constants';
import { angleVectors, vec3 } from '../../core/vec';
import {
  OBJ_ATTACHMENT_SAPPER,
  OBJ_DISPENSER,
  OBJ_LAST,
  OBJ_SENTRYGUN,
  OBJ_TELEPORTER,
} from '../building-api';
import { TF_COND } from '../conditions';
import { hookInt, hookWeapon } from '../items/attributes';
import { GR_STATE_BETWEEN_RNDS, GR_STATE_RND_RUNNING, GR_STATE_STALEMATE } from '../rules';
import type { Player } from '../player';
import type { Weapon } from '../weapon-api';
import type { GameWorld } from '../world';
import {
  classCanBuild,
  objectCost,
  objectsOf,
  OBJECT_INFO_BY_TYPE,
  removeObjectQuietly,
  TF_AMMO_METAL,
  TFBaseObject,
} from './base-object';
import { ObjectDispenser } from './dispenser';
import { ObjectSentrygun } from './sentry';
import { ObjectTeleporter, TELEPORTER_STATE_READY } from './teleporter';

/** CanBuild results (tf_shareddefs.h CB_*). */
export const CB_CAN_BUILD = 0;
export const CB_CANNOT_BUILD = 1;
export const CB_LIMIT_REACHED = 2;
export const CB_NEED_RESOURCES = 3;
export const CB_NEED_ADRENALIN = 4;
export const CB_UNKNOWN_OBJECT = 5;

/** TF_BUILDING_PICKUP_RANGE (tf_player_shared.cpp). */
export const TF_BUILDING_PICKUP_RANGE = 150;

/**
 * A build-menu choice, sent from the HUD as a match command: the engineer's
 * construction PDA ("build 2 0" = sentry; teleporters use mode 0 entrance / 1
 * exit) or the destruction PDA ("destroy …"). The spy's "build 3 0" deploys
 * the sapper.
 */
export interface BuildCommand {
  action: 'build' | 'destroy';
  /** OBJ_DISPENSER 0, OBJ_TELEPORTER 1, OBJ_SENTRYGUN 2, OBJ_ATTACHMENT_SAPPER 3. */
  objectType: number;
  /** MODE_TELEPORTER_ENTRANCE 0 / MODE_TELEPORTER_EXIT 1; 0 otherwise. */
  objectMode?: number;
}

/** Validates an untrusted build command (from the network). */
export function parseBuildCommand(v: unknown): BuildCommand | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.action !== 'build' && o.action !== 'destroy') return null;
  const type = o.objectType;
  const mode = o.objectMode ?? 0;
  if (typeof type !== 'number' || !Number.isInteger(type) || type < 0 || type >= OBJ_LAST)
    return null;
  if (typeof mode !== 'number' || !Number.isInteger(mode) || mode < 0 || mode > 1) return null;
  return { action: o.action, objectType: type, objectMode: mode };
}

/** What the player helpers need from a tf_weapon_builder (implemented in weapons.ts). */
export interface BuilderWeaponLike extends Weapon {
  readonly isBuilderWeapon: true;
  canBuildObjectType(objectType: number): boolean;
  setSubType(objectType: number): void;
  setObjectMode(mode: number): void;
  stopPlacement(): void;
}

const isBuilderWeapon = (w: Weapon | null): w is BuilderWeaponLike =>
  !!w && (w as Partial<BuilderWeaponLike>).isBuilderWeapon === true;

/** CTFPlayerSharedUtils::GetBuilderForObjectType. */
export function builderWeaponFor(player: Player, objectType: number): BuilderWeaponLike | null {
  for (let i = 0; i < player.weapons.length; i++) {
    const w = player.weapons[i];
    if (isBuilderWeapon(w) && w.canBuildObjectType(objectType)) return w;
  }
  return null;
}

/** Objects of a player (placing blueprints included), in creation order. */
export function forEachObjectOf(player: Player, fn: (o: TFBaseObject) => void): void {
  const list = objectsOf(player.world);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!o.removed && o.builder === player.id) fn(o);
  }
}

/** SDK: CTFPlayer::GetObjectOfType (blueprints don't count). */
export function getObjectOfType(
  player: Player,
  objectType: number,
  objectMode = 0,
): TFBaseObject | null {
  const list = objectsOf(player.world);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (
      o.removed ||
      o.builder !== player.id ||
      (o.placing && !o.carried) ||
      o.objectType !== objectType
    )
      continue;
    if (o.objectMode !== objectMode) continue;
    return o;
  }
  return null;
}

/** SDK: CTFPlayer::GetNumObjects. */
export function numObjects(player: Player, objectType: number, objectMode = 0): number {
  let n = 0;
  const list = objectsOf(player.world);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (
      o.removed ||
      o.builder !== player.id ||
      (o.placing && !o.carried) ||
      o.objectType !== objectType
    )
      continue;
    if (objectType !== OBJ_ATTACHMENT_SAPPER && o.objectMode !== objectMode) continue;
    n++;
  }
  return n;
}

/** The building a player is carrying (CTFPlayerShared::GetCarriedObject). */
export function carriedObjectOf(player: Player): TFBaseObject | null {
  const list = objectsOf(player.world);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!o.removed && o.carried && o.builder === player.id) return o;
  }
  return null;
}

/** SDK: CTFPlayer::CanBuild. */
export function canBuild(player: Player, objectType: number, objectMode = 0): number {
  if (objectType < 0 || objectType >= OBJ_LAST) return CB_UNKNOWN_OBJECT;
  if (objectMode < 0 || objectMode > (objectType === OBJ_TELEPORTER ? 1 : 0))
    return CB_CANNOT_BUILD;
  if (!builderWeaponFor(player, objectType) && !classCanBuild(player.playerClass, objectType))
    return CB_CANNOT_BUILD;
  const existing = getObjectOfType(player, objectType, objectMode);
  if (existing && existing.carried) return CB_CAN_BUILD;
  const info = OBJECT_INFO_BY_TYPE[objectType];
  if (info.maxObjects !== -1 && numObjects(player, objectType, objectMode) >= info.maxObjects)
    return CB_LIMIT_REACHED;
  if (player.ammo[TF_AMMO_METAL] < objectCost(objectType)) return CB_NEED_RESOURCES;
  return CB_CAN_BUILD;
}

/**
 * SDK: CTFPlayer::StartBuildingObjectOfType — the build menu picked something: the
 * builder weapon takes the type and is deployed with the blueprint. Returns true when
 * the blueprint is out.
 */
export function startBuildingObjectOfType(
  player: Player,
  objectType: number,
  objectMode = 0,
): boolean {
  if (!player.alive) return false;
  if (canBuild(player, objectType, objectMode) !== CB_CAN_BUILD) return false;
  const builder = builderWeaponFor(player, objectType);
  if (!builder) return false;
  builder.setSubType(objectType);
  builder.setObjectMode(objectMode);
  const slot = builder.slot;
  const last = player.lastSlot;
  if (player.activeWeapon() === builder) {
    // SetActiveWeapon(NULL) then Weapon_Switch: re-deploy with the new type.
    builder.holster(null);
    player.activeSlot = -1;
    const ok = player.switchToSlot(slot);
    player.lastSlot = last;
    return ok;
  }
  return player.switchToSlot(slot);
}

/** SDK: CTFPlayer::DetonateObjectOfType — the destruction PDA. Sapped buildings can't be. */
export function detonateObjectOfType(
  player: Player,
  objectType: number,
  objectMode = 0,
  ignoreSapper = false,
): boolean {
  const o = getObjectOfType(player, objectType, objectMode);
  if (!o) return false;
  if (!ignoreSapper && (o.sapped || o.plasmaDisabled)) return false;
  player.world.events.push({
    type: 'object',
    kind: 'removed',
    object: o.id,
    objectType,
    owner: player.id,
  });
  if (o.carried) {
    o.dropCarriedObject(player);
    const b = builderWeaponFor(player, objectType);
    if (b && player.activeWeapon() === b) switchOwnersWeaponToLast(player);
  }
  o.detonate();
  return true;
}

/** Runs a build-menu command. */
export function handleBuildCommand(player: Player, cmd: BuildCommand): boolean {
  if (cmd.action === 'build')
    return startBuildingObjectOfType(player, cmd.objectType, cmd.objectMode ?? 0);
  return detonateObjectOfType(player, cmd.objectType, cmd.objectMode ?? 0);
}

/**
 * SDK: CTFPlayer::RemoveAllObjects — every object the player owns goes; exploding
 * (team change, disconnect) or silently (class change).
 */
export function removeAllObjects(player: Player, explode: boolean): void {
  const list = objectsOf(player.world);
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    if (!o || o.removed || o.builder !== player.id) continue;
    if (explode) {
      player.world.events.push({
        type: 'object',
        kind: 'removed',
        object: o.id,
        objectType: o.objectType,
        owner: player.id,
      });
      o.detonate();
    } else removeObjectQuietly(o);
  }
}

/** SDK: CTFWeaponBuilder::SwitchOwnersWeaponToLast. */
export function switchOwnersWeaponToLast(player: Player): void {
  if (player.playerClass === 9 /* TF_CLASS_ENGINEER */) {
    const last = player.lastSlot;
    const melee = 2;
    if (player.weapons[melee]) player.switchToSlot(melee);
    else {
      for (let i = 0; i < player.weapons.length; i++)
        if (player.weapons[i] && player.switchToSlot(i)) break;
    }
    player.lastSlot = last === melee ? 0 : last;
  } else if (player.lastSlot >= 0) {
    const last = player.lastSlot;
    if (!player.switchToSlot(last)) {
      for (let i = 0; i < player.weapons.length; i++)
        if (player.weapons[i] && player.switchToSlot(i)) break;
    }
  }
}

/** CTFPlayer::SelectLastItem (the PDAs' attack1). */
export function selectLastItem(player: Player): void {
  if (player.lastSlot >= 0 && player.weapons[player.lastSlot]) player.switchToSlot(player.lastSlot);
}

// ─── Carrying ─────────────────────────────────────────────────────────────────

/** SDK: CTFPlayer::CanPickupBuilding. */
export function canPickupBuilding(player: Player, o: TFBaseObject | null): boolean {
  if (!o) return false;
  if (
    o.building ||
    o.placing ||
    o.upgrading ||
    o.sapped ||
    o.plasmaDisabled ||
    o.carried ||
    o.dying
  )
    return false;
  if (o.objectType === OBJ_ATTACHMENT_SAPPER) return false;
  if (o.level !== o.highestLevel) return false;
  if (!player.alive || carriedObjectOf(player)) return false;
  const rules = player.world.rules;
  if (rules.isHumiliated(player)) return false;
  if (
    rules.state !== GR_STATE_RND_RUNNING &&
    rules.state !== GR_STATE_STALEMATE &&
    rules.state !== GR_STATE_BETWEEN_RNDS
  )
    return false;
  player.eyePosition(pEye);
  const dx = pEye.x - o.origin.x;
  const dy = pEye.y - o.origin.y;
  const dz = pEye.z - o.origin.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  // building_teleporting_pickup on the active weapon (the Rescue Ranger): any range for that much
  // metal, except a dead zone between the normal reach and 250 units.
  const cost = rescuePickupCost(player);
  if (cost !== 0) {
    if (d2 > TF_BUILDING_PICKUP_RANGE * TF_BUILDING_PICKUP_RANGE && d2 < TF_BUILDING_RESCUE_MIN_RANGE_SQ) return false;
    if (d2 >= TF_BUILDING_RESCUE_MIN_RANGE_SQ && player.ammo[3] < cost) return false;
    return true;
  }
  return d2 <= TF_BUILDING_PICKUP_RANGE * TF_BUILDING_PICKUP_RANGE;
}

/** TF_BUILDING_RESCUE_MIN_RANGE_SQ / TF_BUILDING_RESCUE_MAX_RANGE (tf_player_shared.cpp). */
export const TF_BUILDING_RESCUE_MIN_RANGE_SQ = 250 * 250;
export const TF_BUILDING_RESCUE_MAX_RANGE = 5500;

/** building_teleporting_pickup on the active weapon: the metal a long-range pickup costs (0 = none). */
function rescuePickupCost(player: Player): number {
  const w = player.activeWeapon();
  return w ? hookInt(hookWeapon(w, player, 'building_teleporting_pickup', 0)) : 0;
}

const pEye = vec3();
const pFwd = vec3();
const pEnd = vec3();
const pickTrace = emptyTrace();
let pickTarget = -1;
const targetOnlyFilter = (id: number): boolean => id === WORLD_ENTITY || id === pickTarget;

/**
 * SDK: CTFPlayer::TryToPickupBuilding — one of the player's buildings under the
 * crosshair within 150 units is picked up and the builder weapon comes out holding it.
 */
export function tryToPickupBuilding(player: Player): boolean {
  if (!player.alive || carriedObjectOf(player)) return false;
  if (player.cond.has(TF_COND.TAUNTING)) return false;
  const world = player.world;
  player.eyePosition(pEye);
  angleVectors(player.eyeAngles, pFwd);
  const cost = rescuePickupCost(player);
  const range = cost !== 0 ? TF_BUILDING_RESCUE_MAX_RANGE : TF_BUILDING_PICKUP_RANGE;
  pEnd.x = pEye.x + pFwd.x * range;
  pEnd.y = pEye.y + pFwd.y * range;
  pEnd.z = pEye.z + pFwd.z * range;
  let best: TFBaseObject | null = null;
  let bestDist2 = range * range;
  const list = objectsOf(world);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o.removed || o.builder !== player.id || o.placing || o.carried) continue;
    const dx = o.origin.x - player.origin.x;
    const dy = o.origin.y - player.origin.y;
    const dz = o.origin.z - player.origin.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > bestDist2) continue;
    // CTargetOnlyFilter: the ray reaches this building (the map still blocks).
    pickTarget = o.id;
    world.traceLine(pEye, pEnd, MASK_SOLID | CONTENTS_HITBOX, targetOnlyFilter, pickTrace);
    pickTarget = -1;
    if (pickTrace.entity === o.id && pickTrace.fraction < 1) {
      best = o;
      bestDist2 = d2;
    }
  }
  if (!canPickupBuilding(player, best)) {
    if (best) world.emitSound('Player.UseDeny', { entity: player.id, to: player.id });
    return false;
  }
  const obj = best as TFBaseObject;
  if (cost !== 0) {
    // The Rescue Ranger's long-range pickup: metal, and the teleport effects.
    const ex = pEye.x - obj.origin.x;
    const ey = pEye.y - obj.origin.y;
    const ez = pEye.z - obj.origin.z;
    if (ex * ex + ey * ey + ez * ez > TF_BUILDING_RESCUE_MIN_RANGE_SQ) {
      player.ammo[3] = Math.max(0, player.ammo[3] - cost);
      const blue = player.team === 3;
      world.emitEffect({ kind: 'particle', system: blue ? 'teleported_blue' : 'teleported_red', pos: { x: obj.origin.x, y: obj.origin.y, z: obj.origin.z } });
      world.emitSound('Building_Teleporter.Send', { entity: obj.id });
      world.emitSound('Building_Teleporter.Receive', { entity: player.id });
    }
  }
  obj.makeCarriedObject(player);
  const builder = builderWeaponFor(player, obj.objectType);
  if (builder) {
    builder.setSubType(obj.objectType);
    builder.setObjectMode(obj.objectMode);
    const last = player.activeSlot;
    if (player.activeWeapon() === builder) {
      builder.holster(null);
      player.activeSlot = -1;
    }
    player.switchToSlot(builder.slot);
    if (last >= 0 && last !== builder.slot) player.lastSlot = last;
    builder.nextSecondaryAttack = world.curtime + 0.5;
  }
  return true;
}

/**
 * The Engineer's half of CTFPlayer::DoClassSpecialSkill (every stock weapon's attack2):
 * pick up the building in front of you.
 */
export function doEngineerSpecialSkill(player: Player): boolean {
  if (player.playerClass !== 9 /* TF_CLASS_ENGINEER */) return false;
  return tryToPickupBuilding(player);
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

/** One building's status in the Engineer HUD (CHudBuildingStatusContainer_Engineer). */
export interface BuildingStatus {
  exists: boolean;
  id: number;
  objectType: number;
  objectMode: number;
  level: number;
  health: number;
  maxHealth: number;
  /** 0…1 while under construction. */
  buildProgress: number;
  building: boolean;
  upgrading: boolean;
  upgradeMetal: number;
  upgradeMetalRequired: number;
  sapped: boolean;
  disabled: boolean;
  carried: boolean;
  /** Sentry. */
  shells: number;
  maxShells: number;
  rockets: number;
  maxRockets: number;
  kills: number;
  /** Dispenser metal. */
  metal: number;
  /** Teleporter recharge 0…1 and whether its other end exists. */
  charge: number;
  ready: boolean;
  linked: boolean;
}

export interface EngineerHud {
  /** The engineer's metal (TF_AMMO_METAL) and its cap. */
  metal: number;
  maxMetal: number;
  sentry: BuildingStatus;
  dispenser: BuildingStatus;
  entrance: BuildingStatus;
  exit: BuildingStatus;
}

const emptyStatus = (objectType: number, objectMode = 0): BuildingStatus => ({
  exists: false,
  id: -1,
  objectType,
  objectMode,
  level: 0,
  health: 0,
  maxHealth: 0,
  buildProgress: 0,
  building: false,
  upgrading: false,
  upgradeMetal: 0,
  upgradeMetalRequired: 0,
  sapped: false,
  disabled: false,
  carried: false,
  shells: 0,
  maxShells: 0,
  rockets: 0,
  maxRockets: 0,
  kills: 0,
  metal: 0,
  charge: 0,
  ready: false,
  linked: false,
});

/** A reusable HUD record (fill it with `fillEngineerHud`). */
export function createEngineerHud(): EngineerHud {
  return {
    metal: 0,
    maxMetal: 0,
    sentry: emptyStatus(OBJ_SENTRYGUN),
    dispenser: emptyStatus(OBJ_DISPENSER),
    entrance: emptyStatus(OBJ_TELEPORTER, 0),
    exit: emptyStatus(OBJ_TELEPORTER, 1),
  };
}

function fillStatus(out: BuildingStatus, o: TFBaseObject | null): void {
  const type = out.objectType;
  const mode = out.objectMode;
  Object.assign(out, emptyStatus(type, mode));
  if (!o) return;
  out.exists = true;
  out.id = o.id;
  out.level = o.level;
  out.health = Math.max(0, Math.ceil(o.health));
  out.maxHealth = o.maxHealth;
  out.buildProgress = o.buildProgress;
  out.building = o.building;
  out.upgrading = o.upgrading;
  out.upgradeMetal = o.upgradeMetal;
  out.upgradeMetalRequired = o.upgradeMetalRequired;
  out.sapped = o.sapped;
  out.disabled = o.disabled;
  out.carried = o.carried;
  out.kills = o.kills;
  if (o instanceof ObjectSentrygun) {
    out.shells = o.ammoShells;
    out.maxShells = o.maxShells;
    out.rockets = o.ammoRockets;
    out.maxRockets = o.maxRockets;
  } else if (o instanceof ObjectDispenser) {
    out.metal = o.metal;
  } else if (o instanceof ObjectTeleporter) {
    out.charge = o.charge();
    out.ready = o.state === TELEPORTER_STATE_READY;
    out.linked = o.matching() !== null;
  }
}

/** The Engineer HUD's state for `player` (what CHudBuildingStatusContainer_Engineer reads). */
export function fillEngineerHud(
  player: Player,
  out: EngineerHud = createEngineerHud(),
): EngineerHud {
  out.metal = player.ammo[TF_AMMO_METAL];
  out.maxMetal = player.maxAmmo[TF_AMMO_METAL];
  fillStatus(out.sentry, getObjectOfType(player, OBJ_SENTRYGUN));
  fillStatus(out.dispenser, getObjectOfType(player, OBJ_DISPENSER));
  fillStatus(out.entrance, getObjectOfType(player, OBJ_TELEPORTER, 0));
  fillStatus(out.exit, getObjectOfType(player, OBJ_TELEPORTER, 1));
  return out;
}

/** Every building in a world (renderer / bots convenience). */
export function allObjects(world: GameWorld): readonly TFBaseObject[] {
  return objectsOf(world);
}
