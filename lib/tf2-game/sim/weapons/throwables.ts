/**
 * The thrown secondaries (tf_weapon_jar.cpp, tf_weapon_jar_gas.cpp): Jarate (CTFJar), Mad Milk
 * (CTFJarMilk), the Flying Guillotine (CTFCleaver) and the Gas Passer (CTFJarGas).
 *
 * +attack starts the throw (CTFWeaponBaseGun::PrimaryAttack → FireJar: the effect bar starts
 * recharging and the ammo is spent), and 0.1 s later TossJarThink launches the projectile from
 * the shoot position + (16, ±8, −6), hull-traced back to the eye, along the aim at the weapon's
 * speed + 200 up ± 10 right/up (the cleaver: (forward × 10 + up) normalised × 3000). The jar
 * comes back when the effect bar refills (20.1 s, the cleaver 5.1 s; the Gas Passer refills by its
 * item charge meter instead, by time and by damage dealt). With none left, the weapon cannot be
 * drawn and an empty one switches away (CBaseCombatWeapon::ReloadOrSwitchWeapons). Jars cannot be
 * thrown with the eyes under water.
 *
 * Environment-agnostic.
 */

import { MASK_SOLID_BRUSHONLY, WL_EYES } from '../../core/constants';
import { emptyTrace, type UserCmd } from '../../core/types';
import { angleVectors, normalize, set, vec3, type Vec3 } from '../../core/vec';
import { COLLISION_GROUP_NONE, type Entity } from '../entity';
import type { NetRecord } from '../net-schema';
import type { WeaponSpec } from '../weapon-api';
import { switchToNextBest } from './bow';
import { TFWeaponGun } from './gun';
import { num } from './tf-weapon';

/** TF_JAR_LAUNCH_SPEED / TF_GAS_PROJ_SPEED. */
export const TF_JAR_LAUNCH_SPEED = 1000;
export const TF_GAS_PROJ_SPEED = 2000;
/** CTFCleaver::GetVelocityVector's launch speed. */
export const TF_CLEAVER_THROW_SPEED = 3000;
/** InternalGetEffectBarRechargeTime: the jars' and the cleaver's. */
export const JAR_RECHARGE_TIME = 20.1;
export const CLEAVER_RECHARGE_TIME = 5.1;
/** TossJarThink runs this long after the throw starts. */
export const JAR_TOSS_DELAY = 0.1;
/** ReloadOrSwitchWeapons: the empty weapon's refire after switching away. */
const EMPTY_SWITCH_DELAY = 0.3;

const JAR_HULL_MIN: Vec3 = { x: -8, y: -8, z: -8 };
const JAR_HULL_MAX: Vec3 = { x: 8, y: 8, z: 8 };
const tossFwd = vec3();
const tossRight = vec3();
const tossUp = vec3();
const tossSrc = vec3();
const tossEye = vec3();
const tossVel = vec3();
const tossTrace = emptyTrace();

/** The projectile entity each thrown weapon creates (CreateJarProjectile). */
const PROJECTILE_CLASS: Readonly<Record<string, string>> = {
  projectile_jar: 'tf_projectile_jar',
  projectile_festive_urine: 'tf_projectile_jar',
  projectfile_breadmonster_jarate: 'tf_projectile_jar',
  projectile_jar_milk: 'tf_projectile_jar_milk',
  projectfile_breadmonster_madmilk: 'tf_projectile_jar_milk',
  projectile_cleaver: 'tf_projectile_cleaver',
  projectile_jar_gas: 'tf_projectile_jar_gas',
};

/** CTFJar. */
export class ThrownJar extends TFWeaponGun {
  /** The pending TossJarThink (0 = none). */
  tossTime = 0;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** SDK: CTFJar::InternalGetEffectBarRechargeTime. */
  override internalEffectBarRechargeTime(): number {
    return JAR_RECHARGE_TIME;
  }

  /** SDK: CTFJar::GetProjectileSpeed. */
  jarSpeed(): number {
    return TF_JAR_LAUNCH_SPEED;
  }

  /** SDK: CTFJar::CanThrowUnderWater. */
  canThrowUnderWater(): boolean {
    return false;
  }

  /** CBaseCombatWeapon::CanBeSelected → HasAmmo: an empty jar cannot be drawn. */
  override canDeploy(): boolean {
    return this.reserveAmmo() > 0 || this.tossTime > 0;
  }

  /** SDK: CTFJar::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    if (this.reserveAmmo() <= 0) return;
    if (o.move.waterLevel === WL_EYES && !this.canThrowUnderWater()) return;
    super.primaryAttack(cmd);
  }

  /** SDK: CTFJar::FireJar — the bar starts recharging; the toss is 0.1 s later. */
  override fireJar(_cmd: UserCmd): Entity | null {
    this.startEffectBarRegen();
    this.tossTime = this.t + JAR_TOSS_DELAY;
    return null;
  }

  /** SDK: CTFJar::GetVelocityVector. */
  velocityVector(fwd: Vec3, right: Vec3, up: Vec3, out: Vec3): Vec3 {
    const rnd = this.owner!.world.random;
    const speed = this.jarSpeed();
    const rr = rnd.randomFloat(-10, 10);
    const ru = rnd.randomFloat(-10, 10);
    return set(
      out,
      fwd.x * speed + up.x * 200 + right.x * rr + up.x * ru,
      fwd.y * speed + up.y * 200 + right.y * rr + up.y * ru,
      fwd.z * speed + up.z * 200 + right.z * rr + up.z * ru,
    );
  }

  /** The projectile entity this weapon creates. */
  projectileClassname(): string {
    return PROJECTILE_CLASS[this.projectileType()] ?? 'tf_projectile_jar';
  }

  /** CreateJarProjectile's side effects before the projectile exists (the Gas Passer's meter). */
  onCreateJarProjectile(): void {}

  /** SDK: CTFJar::TossJarThink. */
  tossJarThink(): void {
    this.tossTime = 0;
    const o = this.owner;
    if (!o || !o.alive) return;
    this.playShootSound();
    const w = o.world;
    if (!w.isServer) return;
    angleVectors(o.eyeAngles, tossFwd, tossRight, tossUp);
    o.eyePosition(tossEye);
    const right = 8;
    set(
      tossSrc,
      tossEye.x + tossFwd.x * 16 + tossRight.x * right - tossUp.x * 6,
      tossEye.y + tossFwd.y * 16 + tossRight.y * right - tossUp.y * 6,
      tossEye.z + tossFwd.z * 16 + tossRight.z * right - tossUp.z * 6,
    );
    w.traceHull(
      tossEye,
      tossSrc,
      JAR_HULL_MIN,
      JAR_HULL_MAX,
      MASK_SOLID_BRUSHONLY,
      w.entityFilter(o, COLLISION_GROUP_NONE),
      tossTrace,
    );
    if (tossTrace.startSolid) return;
    this.velocityVector(tossFwd, tossRight, tossUp, tossVel);
    this.onCreateJarProjectile();
    w.spawnProjectile(this.projectileClassname(), {
      origin: tossTrace.endPos,
      angles: o.eyeAngles,
      velocity: tossVel,
      owner: o,
      weapon: this,
      damage: this.projectileDamage(),
      critType: this.currentAttackIsCrit ? 2 : 0,
    });
  }

  private emptyThink(): void {
    const o = this.owner;
    if (!o || this.tossTime > 0) return;
    // CBaseCombatWeapon::ReloadOrSwitchWeapons: nothing left to throw.
    if (
      this.reserveAmmo() <= 0 &&
      this.nextPrimaryAttack < this.t &&
      this.nextSecondaryAttack < this.t &&
      o.activeWeapon() === this
    ) {
      switchToNextBest(o, this);
      this.nextPrimaryAttack = this.t + EMPTY_SWITCH_DELAY;
    }
  }

  override itemPostFrame(cmd: UserCmd): void {
    if (this.tossTime > 0 && this.t >= this.tossTime) this.tossJarThink();
    super.itemPostFrame(cmd);
    this.emptyThink();
  }

  override itemHolsterFrame(cmd: UserCmd): void {
    if (this.tossTime > 0 && this.t >= this.tossTime) this.tossJarThink();
    super.itemHolsterFrame(cmd);
  }

  override refill(): void {
    super.refill();
    this.tossTime = 0;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.tossTime;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.tossTime = num(rec.aux0);
  }
}

/** CTFJarMilk: Mad Milk (the same throw; its projectile milks). */
export class ThrownMilk extends ThrownJar {}

/** CTFCleaver: the Flying Guillotine — a 5.1 s bar, +attack2 throws too. */
export class ThrownCleaver extends ThrownJar {
  override internalEffectBarRechargeTime(): number {
    return CLEAVER_RECHARGE_TIME;
  }

  /** The cleaver flies under water too (only the jars check). */
  override canThrowUnderWater(): boolean {
    return true;
  }

  /** SDK: CTFCleaver::GetVelocityVector — (forward × 10 + up) normalised × 3000. */
  override velocityVector(fwd: Vec3, _right: Vec3, up: Vec3, out: Vec3): Vec3 {
    set(out, fwd.x * 10 + up.x, fwd.y * 10 + up.y, fwd.z * 10 + up.z);
    normalize(out);
    return set(
      out,
      out.x * TF_CLEAVER_THROW_SPEED,
      out.y * TF_CLEAVER_THROW_SPEED,
      out.z * TF_CLEAVER_THROW_SPEED,
    );
  }

  /** SDK: CTFCleaver::SecondaryAttack → PrimaryAttack. */
  override secondaryAttack(cmd: UserCmd): void {
    this.primaryAttack(cmd);
  }
}

/**
 * CTFJarGas: the Gas Passer — no effect bar; the item charge meter (meters[3]) must be full to
 * throw (CanAttack), the throw empties it (RemoveJarGas), and a full meter gives the can back
 * (OnResourceMeterFilled).
 */
export class ThrownGas extends ThrownJar {
  override internalEffectBarRechargeTime(): number {
    return 0;
  }

  override jarSpeed(): number {
    return TF_GAS_PROJ_SPEED;
  }

  /** SDK: CTFJarGas::CanAttack. */
  override canAttack(): boolean {
    const o = this.owner;
    if (o && o.meters[3] < 100) return false;
    return super.canAttack();
  }

  /** The gas can starts no effect bar (it has none). */
  override fireJar(_cmd: UserCmd): Entity | null {
    this.tossTime = this.t + JAR_TOSS_DELAY;
    return null;
  }

  /** SDK: CTFJarGas::RemoveJarGas. */
  override onCreateJarProjectile(): void {
    const o = this.owner;
    if (!o) return;
    o.meters[3] = 0;
    const a = this.stats.ammoType;
    o.ammo[a] = Math.max(0, o.ammo[a] - this.stats.ammoPerShot);
  }
}
