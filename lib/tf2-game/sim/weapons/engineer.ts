/**
 * The Engineer's unlock guns: CTFLaserPointer (the Wrangler, tf_weapon_laser_pointer.cpp),
 * CTFMechanicalArm (the Short Circuit, tf_weapon_mechanical_arm.cpp) and CTFShotgunBuildingRescue
 * (the Rescue Ranger, tf_weapon_shotgun.cpp).
 *
 * The Wrangler puts a laser dot (env_laserdot) 0.5 s after it is drawn where the Engineer looks; his
 * sentry then follows the dot instead of seeking (CObjectSentrygun::FindTarget, buildings/sentry.ts):
 * it turns 100× as fast, fires twice as fast with 3° of spread while +attack is held, fires its
 * rockets on +attack2 every 2.25 s, and wears a shield that takes 66 % off damage (and off repairs
 * and ammo) until 3 s after the Wrangler is put away — the gun is idle all that time.
 *
 * The Short Circuit: +attack fires its scripted bullets for mod_ammo_per_shot metal (5); +attack2
 * spends 65 metal on an orb (tf_projectile_mechanicalarmorb, projectiles/orb.ts) that destroys
 * enemy projectiles near its path and zaps players.
 *
 * The Rescue Ranger fires repair bolts (override_projectile_type: the arrow's
 * BuildingHealingArrow, arrow_heals_buildings) at 2400 u/s, gravity 0.2, and picks the Engineer's
 * buildings up from any range for building_teleporting_pickup metal (buildings/player-objects.ts).
 *
 * Environment-agnostic.
 */

import { MASK_SOLID, MASK_SOLID_BRUSHONLY, MOVETYPE_NONE, WL_EYES } from '../../core/constants';
import { emptyTrace, NO_ENTITY, type UserCmd } from '../../core/types';
import { angleVectors, remapClamped, set, vec3, type Vec3 } from '../../core/vec';
import { COLLISION_GROUP_NONE, Entity, FSOLID_NOT_SOLID } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { hookInt, hookWeapon } from '../items/attributes';
import type { NetRecord } from '../net-schema';
import { PLAYERANIMEVENT_ATTACK_PRIMARY, type Player } from '../player';
import type { WeaponSpec } from '../weapon-api';
import { BOW_MAX_GRAVITY, BOW_MAX_SPEED, BOW_MIN_GRAVITY, BOW_MIN_SPEED } from './bow';
import { ACT } from './constants';
import { TFWeaponGun } from './gun';
import { removeInvisibility } from './spy-state';
import { num } from './tf-weapon';

/** CTFLaserPointer::Deploy: the dot appears this long after the draw. */
export const LASER_DOT_DELAY = 0.5;
/** MAX_TRACE_LENGTH. */
const MAX_TRACE_LENGTH = 56756;
/** tf_mecharm_orb_* (tf_weapon_mechanical_arm.cpp). */
export const MECHARM_ORB_COST = 65;
export const MECHARM_ORB_SPEED = 700;
const MECHARM_REFIRE = 0.67;
const ORB_HULL_MIN: Vec3 = { x: -8, y: -8, z: -8 };
const ORB_HULL_MAX: Vec3 = { x: 8, y: 8, z: 8 };

const lpEye = vec3();
const lpFwd = vec3();
const lpEnd = vec3();
const lpTrace = emptyTrace();
const orbFwd = vec3();
const orbRight = vec3();
const orbUp = vec3();
const orbSrc = vec3();
const orbEye = vec3();
const orbVel = vec3();
const orbTrace = emptyTrace();

/** env_laserdot (CLaserDot): where the Wrangler points; the sentry's target. */
export class LaserDot extends Entity {
  /** The entity under the dot (a damageable one), for the sentry's auto-aim. */
  target: number = NO_ENTITY;

  constructor(classname = 'env_laserdot') {
    super(classname);
    this.moveType = MOVETYPE_NONE;
    this.solidFlags = FSOLID_NOT_SOLID;
  }
}

/** The sentry a Wrangler drives (CObjectSentrygun's player-control half, buildings/sentry.ts). */
interface WranglerSentry extends Entity {
  builder: number;
  level: number;
  fireNextFrame: boolean;
  fireRocketNextFrame: boolean;
  clearTarget(): void;
  setAutoAimTarget(p: Player): void;
}

/** CTFPlayer::GetObjectOfType( OBJ_SENTRYGUN ). */
function sentryOf(p: Player): WranglerSentry | null {
  let found: WranglerSentry | null = null;
  p.world.forEachEntity((e) => {
    if (found || e.removed || e.classname !== 'obj_sentrygun') return;
    const s = e as WranglerSentry;
    if (s.builder === p.id && typeof s.clearTarget === 'function') found = s;
  });
  return found;
}

/** CTFLaserPointer: the Wrangler. */
export class LaserPointer extends TFWeaponGun {
  /** m_bDeployed. */
  deployed = false;
  /** The CREATE_LASER_DOT think (0 = none pending). */
  dotTime = 0;
  /** m_hLaserDot (server). */
  dot: number = NO_ENTITY;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** CTFLaserPointer::HasLaserDot / GetLaserDot. */
  laserDot(): Entity | null {
    if (!this.deployed || !this.owner) return null;
    return this.owner.world.entity(this.dot);
  }

  override deploy(): boolean {
    const ok = super.deploy();
    if (ok) {
      this.dotTime = this.t + LASER_DOT_DELAY;
      this.deployed = true;
    }
    return ok;
  }

  override holster(next: Parameters<TFWeaponGun['holster']>[0]): boolean {
    const ok = super.holster(next);
    if (ok) {
      this.destroyLaserDot();
      this.deployed = false;
    }
    return ok;
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    this.destroyLaserDot();
    this.deployed = false;
  }

  /** SDK: CTFLaserPointer::CreateLaserDot. */
  private createLaserDot(): void {
    this.dotTime = 0;
    const o = this.owner;
    if (!o || !this.deployed || !o.world.isServer || o.world.entity(this.dot)) return;
    const dot = o.world.spawnEntity('env_laserdot', (e) => {
      e.owner = o.id;
      e.team = o.team;
    });
    this.dot = dot ? dot.id : NO_ENTITY;
    this.updateLaserDot();
  }

  /** SDK: CTFLaserPointer::DestroyLaserDot — the sentry lets go. */
  private destroyLaserDot(): void {
    this.dotTime = 0;
    const o = this.owner;
    if (!o) return;
    sentryOf(o)?.clearTarget();
    const dot = o.world.entity(this.dot);
    if (dot) o.world.remove(dot);
    this.dot = NO_ENTITY;
  }

  /** SDK: CTFLaserPointer::UpdateLaserDot — the dot on whatever the Engineer looks at (teammates ignored). */
  private updateLaserDot(): void {
    const o = this.owner;
    if (!o) return;
    const w = o.world;
    const dot = w.entity(this.dot) as LaserDot | null;
    if (!dot) return;
    o.eyePosition(lpEye);
    angleVectors(o.eyeAngles, lpFwd);
    set(
      lpEnd,
      lpEye.x + lpFwd.x * MAX_TRACE_LENGTH,
      lpEye.y + lpFwd.y * MAX_TRACE_LENGTH,
      lpEye.z + lpFwd.z * MAX_TRACE_LENGTH,
    );
    const f = w.entityFilterObject(o, COLLISION_GROUP_NONE);
    f.ignoreTeam = o.team;
    w.traceLine(lpEye, lpEnd, MASK_SOLID, f.fn, lpTrace);
    set(dot.origin, lpTrace.endPos.x, lpTrace.endPos.y, lpTrace.endPos.z);
    dot.target = NO_ENTITY;
    const hit = w.entity(lpTrace.entity);
    if (hit && hit !== w.worldEntity && hit.takeDamage !== 0) {
      dot.target = hit.id;
      if (hit.isPlayer()) sentryOf(o)?.setAutoAimTarget(hit as Player);
    }
  }

  /** SDK: CTFLaserPointer::ItemPostFrame. */
  override itemPostFrame(cmd: UserCmd): void {
    if (!this.deployed) return;
    if (this.dotTime > 0 && this.t >= this.dotTime) this.createLaserDot();
    if (this.owner && this.owner.world.entity(this.dot)) this.updateLaserDot();
    super.itemPostFrame(cmd);
  }

  /** SDK: CTFLaserPointer::PrimaryAttack — the sentry fires next think. */
  override primaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.canAttack()) return;
    const sentry = sentryOf(o);
    if (!sentry) return;
    sentry.fireNextFrame = true;
    this.sendWeaponAnim(ACT.VM_RELOAD);
  }

  /** SDK: CTFLaserPointer::SecondaryAttack — a level 3 sentry's rockets. */
  override secondaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.canAttack()) return;
    const sentry = sentryOf(o);
    if (sentry && sentry.level === 3) sentry.fireRocketNextFrame = true;
  }

  /** The pointer has no clip or ammo of its own. */
  override reload(): boolean {
    return false;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.dotTime;
    out.aux1 = this.deployed ? 1 : 0;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.dotTime = num(rec.aux0);
    this.deployed = num(rec.aux1) !== 0;
  }
}

/** CTFMechanicalArm: the Short Circuit. */
export class MechanicalArm extends TFWeaponGun {
  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** mod_ammo_per_shot: the metal a shot costs (CTFMechanicalArm::GetAmmoPerShot itself is 0). */
  metalPerShot(): number {
    return hookInt(hookWeapon(this, this.owner, 'mod_ammo_per_shot', 0));
  }

  /** The metal is taken in primaryAttack, not by RemoveProjectileAmmo. */
  override removeProjectileAmmo(): void {}

  /** SDK: CTFMechanicalArm::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    const delay = this.fireDelay();
    if (this.metalPerShot() > o.ammo[this.stats.ammoType] || o.move.waterLevel === WL_EYES) {
      this.weaponSound('empty');
      this.nextPrimaryAttack = this.t + delay;
      return;
    }
    if (this.nextPrimaryAttack > this.t || !this.canAttack()) return;
    const a = this.stats.ammoType;
    o.ammo[a] = Math.max(0, o.ammo[a] - this.metalPerShot());
    this.calcIsAttackCritical(cmd);
    this.fireProjectile(cmd);
    this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
    this.nextPrimaryAttack = this.t + delay;
    this.timeWeaponIdle = this.t + this.idleTime();
  }

  /** SDK: CTFMechanicalArm::SecondaryAttack → ShockAttack: the orb. */
  override secondaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o || this.nextSecondaryAttack > this.t) return;
    const a = this.stats.ammoType;
    if (this.metalPerShot() > o.ammo[a] || o.move.waterLevel === WL_EYES) {
      this.weaponSound('empty');
      this.nextSecondaryAttack = this.t + MECHARM_REFIRE;
      return;
    }
    if (!this.canAttack()) return;
    if (o.ammo[a] >= MECHARM_ORB_COST) {
      removeInvisibility(o);
      o.ammo[a] -= MECHARM_ORB_COST;
      this.weaponSound('special3');
      this.launchOrb(o);
    } else this.weaponSound('empty');
    this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
    o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
    this.nextPrimaryAttack = this.t + MECHARM_REFIRE;
    this.nextSecondaryAttack = this.t + MECHARM_REFIRE;
  }

  /** The orb from eye + (40 forward, 15 right, 10 down), unless that is inside the world. */
  private launchOrb(o: Player): void {
    const w = o.world;
    if (!w.isServer) return;
    angleVectors(o.eyeAngles, orbFwd, orbRight, orbUp);
    o.eyePosition(orbEye);
    set(
      orbSrc,
      orbEye.x + orbFwd.x * 40 + orbRight.x * 15 - orbUp.x * 10,
      orbEye.y + orbFwd.y * 40 + orbRight.y * 15 - orbUp.y * 10,
      orbEye.z + orbFwd.z * 40 + orbRight.z * 15 - orbUp.z * 10,
    );
    w.traceHull(
      orbEye,
      orbSrc,
      ORB_HULL_MIN,
      ORB_HULL_MAX,
      MASK_SOLID_BRUSHONLY,
      w.entityFilter(o, COLLISION_GROUP_NONE),
      orbTrace,
    );
    if (orbTrace.fraction < 1) return;
    set(
      orbVel,
      orbFwd.x * MECHARM_ORB_SPEED,
      orbFwd.y * MECHARM_ORB_SPEED,
      orbFwd.z * MECHARM_ORB_SPEED,
    );
    w.spawnProjectile('tf_projectile_mechanicalarmorb', {
      origin: orbSrc,
      angles: o.eyeAngles,
      velocity: orbVel,
      owner: o,
      weapon: this,
      damage: 0,
      critType: 0,
    });
  }
}

/** CTFShotgunBuildingRescue: the Rescue Ranger's bolts (RemapValClamped( 0.75 … )). */
export class ShotgunBuildingRescue extends TFWeaponGun {
  override arrowSpeed(): number {
    return remapClamped(0.75, 0, 1, BOW_MIN_SPEED, BOW_MAX_SPEED);
  }

  override arrowGravity(): number {
    return remapClamped(0.75, 0, 1, BOW_MAX_GRAVITY, BOW_MIN_GRAVITY);
  }
}

registerEntityClass('env_laserdot', LaserDot);
