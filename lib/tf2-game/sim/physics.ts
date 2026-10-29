/**
 * Non-player movement: projectiles and tossed items (the engine's
 * PhysicsToss for MOVETYPE_FLY / MOVETYPE_FLYGRAVITY, with
 * PhysicsAddGravityMove, PhysicsPushEntity, PhysicsImpact and the
 * ResolveFlyCollision* responses) and brush movers (PhysicsPusher for
 * MOVETYPE_PUSH: doors, trains and platforms push players or are blocked).
 *
 * `BaseProjectile` is the base the weapons module extends for rockets,
 * grenades, stickies, arrows and flares: it carries damage, crit type, the
 * launcher and the deflection count, and gets `onImpact` when it hits.
 */

import { emptyTrace, NO_ENTITY, WORLD_ENTITY, type TraceResult } from '../core/types';
import {
  CONTENTS_BLUETEAM,
  CONTENTS_REDTEAM,
  FL_ONGROUND,
  MASK_PLAYERSOLID,
  MASK_SOLID,
  MOVETYPE_FLY,
  MOVETYPE_FLYGRAVITY,
  MOVETYPE_NONE,
  MOVETYPE_WALK,
  SV_GRAVITY,
  SV_MAXVELOCITY,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../core/constants';
import { copy, set, vec3, type Vec3 } from '../core/vec';
import {
  Entity,
  FSOLID_NOT_SOLID,
  FSOLID_TRIGGER,
  MOVECOLLIDE_FLY_BOUNCE,
  MOVECOLLIDE_FLY_CUSTOM,
  MOVECOLLIDE_FLY_SLIDE,
  SOLID_BBOX,
  TFCOLLISION_GROUP_ROCKETS,
} from './entity';
import { NET_PROJECTILE, type NetRecord, type NetSchema } from './net-schema';
import type { Weapon } from './weapon-api';
import type { GameWorld } from './world';

/** SDK: PhysicsClipVelocity (physics_main_shared.cpp). Returns the blocked flags. */
export function clipVelocity(inVel: Vec3, normal: Vec3, out: Vec3, overbounce: number): number {
  const STOP_EPSILON = 0.1;
  let blocked = 0;
  const angle = normal.z;
  if (angle > 0) blocked |= 1;
  if (!angle) blocked |= 2;
  const backoff = (inVel.x * normal.x + inVel.y * normal.y + inVel.z * normal.z) * overbounce;
  out.x = inVel.x - normal.x * backoff;
  out.y = inVel.y - normal.y * backoff;
  out.z = inVel.z - normal.z * backoff;
  if (out.x > -STOP_EPSILON && out.x < STOP_EPSILON) out.x = 0;
  if (out.y > -STOP_EPSILON && out.y < STOP_EPSILON) out.y = 0;
  if (out.z > -STOP_EPSILON && out.z < STOP_EPSILON) out.z = 0;
  return blocked;
}

/** SDK: CBaseEntity::PhysicsCheckVelocity — clamp to sv_maxvelocity, kill NaNs. */
export function checkVelocity(v: Vec3): void {
  if (!Number.isFinite(v.x)) v.x = 0;
  if (!Number.isFinite(v.y)) v.y = 0;
  if (!Number.isFinite(v.z)) v.z = 0;
  if (v.x > SV_MAXVELOCITY) v.x = SV_MAXVELOCITY;
  else if (v.x < -SV_MAXVELOCITY) v.x = -SV_MAXVELOCITY;
  if (v.y > SV_MAXVELOCITY) v.y = SV_MAXVELOCITY;
  else if (v.y < -SV_MAXVELOCITY) v.y = -SV_MAXVELOCITY;
  if (v.z > SV_MAXVELOCITY) v.z = SV_MAXVELOCITY;
  else if (v.z < -SV_MAXVELOCITY) v.z = -SV_MAXVELOCITY;
}

const tossTrace = emptyTrace();
const tossMove = vec3();
const tossEnd = vec3();
const tossVel = vec3();

/**
 * SDK: CBaseEntity::PhysicsToss (+ PhysicsAddGravityMove / PhysicsPushEntity
 * / PhysicsImpact / ResolveFlyCollision*). One tick of a flying entity.
 */
export function physicsToss(world: GameWorld, ent: Entity, dt: number): void {
  if (ent.flags & FL_ONGROUND && ent.groundEntity !== NO_ENTITY) {
    // Resting: fall again if the ground went away (a door opened, a box broke).
    const ground = ent.groundEntity === WORLD_ENTITY ? null : world.entity(ent.groundEntity);
    if (ent.groundEntity !== WORLD_ENTITY && (!ground || ground.removed)) {
      ent.flags &= ~FL_ONGROUND;
      ent.groundEntity = NO_ENTITY;
    } else if (ent.velocity.x === 0 && ent.velocity.y === 0 && ent.velocity.z === 0) {
      return;
    }
  }
  checkVelocity(ent.velocity);

  const v = ent.velocity;
  tossMove.x = (v.x + ent.baseVelocity.x) * dt;
  tossMove.y = (v.y + ent.baseVelocity.y) * dt;
  if (ent.moveType === MOVETYPE_FLYGRAVITY && !(ent.flags & FL_ONGROUND)) {
    const g = (ent.gravity || 1) * SV_GRAVITY;
    const newZ = v.z - g * dt;
    tossMove.z = ((v.z + newZ) * 0.5 + ent.baseVelocity.z) * dt;
    v.z = newZ;
  } else {
    tossMove.z = (v.z + ent.baseVelocity.z) * dt;
  }

  const tr = pushEntity(world, ent, tossMove, tossTrace);
  if (ent.removed) return;
  if (tr.fraction === 1 && !tr.startSolid) return;
  if (ent.moveType === MOVETYPE_NONE) return; // stuck to something in its touch

  if (ent.moveCollide === MOVECOLLIDE_FLY_BOUNCE) resolveFlyCollisionBounce(world, ent, tr, dt);
  else if (ent.moveCollide === MOVECOLLIDE_FLY_CUSTOM) {
    if (ent instanceof BaseProjectile) ent.resolveFlyCollisionCustom(tr, dt);
    else resolveFlyCollisionBounce(world, ent, tr, dt);
  } else if (ent.moveCollide === MOVECOLLIDE_FLY_SLIDE) resolveFlyCollisionSlide(ent, tr);
  else {
    // MOVECOLLIDE_DEFAULT: stop on the ground, slide along walls.
    resolveFlyCollisionSlide(ent, tr);
  }
}

/**
 * SDK: CBaseEntity::PhysicsPushEntity → PhysicsCheckSweep + PhysicsImpact.
 * Moves `ent` by `move`, stopping at the first thing it hits, and runs the
 * touch functions of both.
 */
export function pushEntity(world: GameWorld, ent: Entity, move: Vec3, out: TraceResult): TraceResult {
  tossEnd.x = ent.origin.x + move.x;
  tossEnd.y = ent.origin.y + move.y;
  tossEnd.z = ent.origin.z + move.z;
  const filter = world.entityFilter(ent, ent.collisionGroup);
  const mask = ent instanceof BaseProjectile ? ent.physicsSolidMask() : MASK_SOLID;
  world.traceHull(ent.origin, tossEnd, ent.mins, ent.maxs, mask, filter, out);
  if (!out.allSolid) copy(ent.origin, out.endPos);
  if (out.fraction < 1 || out.startSolid) {
    const other = out.entity === WORLD_ENTITY || out.entity === NO_ENTITY ? world.worldEntity : world.entity(out.entity);
    if (other) world.physicsImpact(ent, other, out);
  }
  return out;
}

/** SDK: CBaseEntity::ResolveFlyCollisionBounce. */
export function resolveFlyCollisionBounce(world: GameWorld, ent: Entity, tr: TraceResult, dt: number): void {
  let elasticity = ent.elasticity;
  if (elasticity > 0.9) elasticity = 0.9;
  if (elasticity < 0) elasticity = 0;
  clipVelocity(ent.velocity, tr.plane.normal, tossVel, 2);
  tossVel.x *= elasticity;
  tossVel.y *= elasticity;
  tossVel.z *= elasticity;
  const tvx = tossVel.x + ent.baseVelocity.x;
  const tvy = tossVel.y + ent.baseVelocity.y;
  const tvz = tossVel.z + ent.baseVelocity.z;
  const speedSqr = tvx * tvx + tvy * tvy + tvz * tvz;
  if (tr.plane.normal.z > 0.7) {
    copy(ent.velocity, tossVel);
    if (speedSqr < 30 * 30) {
      ent.flags |= FL_ONGROUND;
      ent.groundEntity = tr.entity === NO_ENTITY ? WORLD_ENTITY : tr.entity;
      set(ent.velocity, 0, 0, 0);
    } else {
      // Use the remaining time of the tick sliding along the ground.
      const remain = (1 - tr.fraction) * dt;
      set(tossMove, tvx * remain, tvy * remain, tvz * remain);
      pushEntity(world, ent, tossMove, tossTrace);
    }
  } else {
    copy(ent.velocity, tossVel);
  }
}

/** SDK: CBaseEntity::ResolveFlyCollisionSlide. */
export function resolveFlyCollisionSlide(ent: Entity, tr: TraceResult): void {
  clipVelocity(ent.velocity, tr.plane.normal, ent.velocity, 1);
  if (tr.plane.normal.z > 0.7) {
    const sp = ent.velocity.x * ent.velocity.x + ent.velocity.y * ent.velocity.y + ent.velocity.z * ent.velocity.z;
    if (sp < 30 * 30) {
      ent.flags |= FL_ONGROUND;
      ent.groundEntity = tr.entity === NO_ENTITY ? WORLD_ENTITY : tr.entity;
      set(ent.velocity, 0, 0, 0);
    }
  }
}

/** SDK: CBaseProjectile / CTFBaseProjectile / CTFBaseRocket's shared state. */
export class BaseProjectile extends Entity {
  /** Damage at the centre / on a direct hit. */
  damage = 0;
  critType: 0 | 1 | 2 = 0;
  /** The launcher, when it still exists. */
  launcher: Weapon | null = null;
  launcherDefIndex = -1;
  /** TF_WEAPON_* of the launcher (damage rules). */
  weaponId = 0;
  killIcon = '';
  /** Times airblasted (CTFBaseRocket::GetDeflected). */
  deflected = 0;
  /** Player who last deflected it (credits the kill). */
  deflectedBy: number = NO_ENTITY;
  /** Entity hit directly (GetEnemy) — full damage, no falloff. */
  enemy: number = NO_ENTITY;
  /** Net: the client picks model/trail by this. */
  projectileKind = 0;
  /** Seconds before the projectile removes itself regardless (0 = never). */
  lifetime = 0;
  /** Collides with teammates too (CanCollideWithTeammates). */
  collideWithTeammates = false;
  /** The last impact trace, valid during `touch`/`onImpact`. */
  readonly impactTrace: TraceResult = emptyTrace();

  constructor(classname: string) {
    super(classname);
    this.solid = SOLID_BBOX;
    this.solidFlags = FSOLID_NOT_SOLID | FSOLID_TRIGGER;
    // Most TF projectiles are CTFBaseRocket: solid to enemy players (by team contents), not to movement.
    this.collisionGroup = TFCOLLISION_GROUP_ROCKETS;
    this.moveType = MOVETYPE_FLY;
    this.moveCollide = MOVECOLLIDE_FLY_CUSTOM;
  }

  override spawn(): void {
    super.spawn();
    this.spawnTime = this.world.curtime;
    if (this.lifetime > 0) this.setThink(this.subRemove, this.world.curtime + this.lifetime);
  }

  /** SDK: CTFBaseRocket::PhysicsSolidMaskForEntity — enemies' team contents only, unless set otherwise. */
  physicsSolidMask(): number {
    let team = CONTENTS_REDTEAM | CONTENTS_BLUETEAM;
    if (!this.collideWithTeammates) {
      if (this.team === TF_TEAM_RED) team = CONTENTS_BLUETEAM;
      else if (this.team === TF_TEAM_BLUE) team = CONTENTS_REDTEAM;
    }
    return MASK_SOLID | team;
  }

  /** The world calls this from physicsImpact with the trace that hit `other`. */
  override touch(other: Entity): void {
    this.onImpact(other, this.impactTrace);
  }

  /**
   * Subclasses: explode, stick, bounce. `other` is world.worldEntity for the
   * map. The base removes the projectile.
   */
  onImpact(_other: Entity, _tr: TraceResult): void {
    this.world.remove(this);
  }

  /** MOVECOLLIDE_FLY_CUSTOM response after a non-removing impact (grenades bounce). */
  resolveFlyCollisionCustom(tr: TraceResult, dt: number): void {
    resolveFlyCollisionBounce(this.world, this, tr, dt);
  }

  override netSchema(): NetSchema | null {
    return NET_PROJECTILE;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.vx = this.velocity.x;
    out.vy = this.velocity.y;
    out.vz = this.velocity.z;
    out.critical = this.critType;
    out.kind = this.projectileKind;
    out.spawnTime = this.spawnTime;
  }
}

/** True when the entity moves under physicsToss. */
export const isTossMoveType = (moveType: number): boolean =>
  moveType === MOVETYPE_FLY || moveType === MOVETYPE_FLYGRAVITY;

// ─── Brush movers (MOVETYPE_PUSH) ──────────────────────────────────────────

const pushTrace = emptyTrace();
const pushedList: Entity[] = [];
const pushedFrom: Vec3[] = [];
const pushEnd = vec3();
const pusherOld = vec3();
const pusherOldAngles = vec3();
const absMins = vec3();
const absMaxs = vec3();

/**
 * SDK: CBaseEntity::PhysicsPusher / PhysicsPushMove, translation and
 * rotation of a brush model. Moves `pusher` to `newOrigin`/`newAngles`,
 * carrying riders and shoving anything in the way along the move delta. If
 * something can't be moved out of the way, everything reverts, `blocked`
 * is called on the pusher, and false is returned. With `unblockableByPlayer`
 * (FL_UNBLOCKABLE_BY_PLAYER: payload carts) players never block: they are
 * left where the push put them (CPhysicsPushedEntities' bIsUnblockable).
 */
export function pushMove(
  world: GameWorld,
  pusher: Entity,
  newOrigin: Vec3,
  newAngles: Vec3,
  unblockableByPlayer = false,
): boolean {
  const dx = newOrigin.x - pusher.origin.x;
  const dy = newOrigin.y - pusher.origin.y;
  const dz = newOrigin.z - pusher.origin.z;
  const rotating =
    newAngles.x !== pusher.angles.x || newAngles.y !== pusher.angles.y || newAngles.z !== pusher.angles.z;
  if (dx === 0 && dy === 0 && dz === 0 && !rotating) return true;

  copy(pusherOld, pusher.origin);
  copy(pusherOldAngles, pusher.angles);
  copy(pusher.origin, newOrigin);
  copy(pusher.angles, newAngles);
  world.syncBrushModel(pusher);

  pushedList.length = 0;
  let blockedBy: Entity | null = null;
  const solid = pusher.isSolid();
  world.forEachEntity((e) => {
    if (blockedBy || e === pusher || e.removed) return;
    if (e.moveType !== MOVETYPE_WALK && e.moveType !== MOVETYPE_FLYGRAVITY) return;
    if (!e.isSolid() && !e.isPlayer()) return;
    if (e.parent !== NO_ENTITY) return;
    if (e.isPlayer() && !e.alive) return;
    const riding = e.groundEntity === pusher.id;
    absMins.x = e.origin.x + e.mins.x;
    absMins.y = e.origin.y + e.mins.y;
    absMins.z = e.origin.z + e.mins.z;
    absMaxs.x = e.origin.x + e.maxs.x;
    absMaxs.y = e.origin.y + e.maxs.y;
    absMaxs.z = e.origin.z + e.maxs.z;
    const overlapping = solid && world.boxTouchesBrushEntity(pusher, absMins, absMaxs);
    if (!riding && !overlapping) return;

    // Move the rider/blocker by the pusher's delta.
    const idx = pushedList.length;
    pushedList.push(e);
    if (pushedFrom.length <= idx) pushedFrom.push(vec3());
    copy(pushedFrom[idx], e.origin);
    set(pushEnd, e.origin.x + dx, e.origin.y + dy, e.origin.z + dz);
    if (e.isPlayer()) {
      // Riders keep their footing; blockers are shoved and lose it.
      if (!riding) {
        e.flags &= ~FL_ONGROUND;
        e.groundEntity = NO_ENTITY;
      }
    }
    copy(e.origin, pushEnd);
    // Still inside the pusher (or shoved into a wall)? Then we're blocked.
    const filter = world.entityFilter(e, e.collisionGroup);
    world.traceHull(e.origin, e.origin, e.mins, e.maxs, MASK_PLAYERSOLID, filter, pushTrace);
    if (pushTrace.startSolid && !(unblockableByPlayer && e.isPlayer())) {
      blockedBy = e;
    } else if (e.isPlayer()) {
      world.onPlayerPushed(e);
    }
  });

  if (blockedBy) {
    for (let i = 0; i < pushedList.length; i++) copy(pushedList[i].origin, pushedFrom[i]);
    copy(pusher.origin, pusherOld);
    copy(pusher.angles, pusherOldAngles);
    world.syncBrushModel(pusher);
    world.onPusherBlocked(pusher, blockedBy);
    return false;
  }
  return true;
}
