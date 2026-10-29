/**
 * The Engineer's and the Soldier's energy weapons: CTFRaygun (the Righteous Bison,
 * tf_weapon_raygun.cpp), CTFDRGPomson (the Pomson 6000) and CTFParticleCannon (the Cow Mangler
 * 5000, tf_weapon_particle_cannon.cpp).
 *
 * Their clip is energy (CTFWeaponBase Energy_*, tf-weapon.ts): 20 units, 5 a shot, recharged 5 a
 * step without ammo. The Bison and the Pomson fire energy rings (projectiles/energy.ts) at
 * 1200 u/s, no gravity — the Bison's pass through players and hit each every tick they overlap; the
 * Pomson's drain a Medic's über and a Spy's cloak. The Cow Mangler fires energy balls at 1100 u/s
 * that explode like rockets; +attack2 with a full charge holds it 2 s (aiming: slowed) and fires a
 * charged shot that takes the whole charge, mini-crits, ignites (6 s) and disables buildings.
 *
 * Environment-agnostic.
 */

import type { UserCmd } from '../../core/types';
import type { Vec3 } from '../../core/vec';
import { TF_COND } from '../conditions';
import type { Entity } from '../entity';
import type { NetRecord } from '../net-schema';
import { PLAYERANIMEVENT_ATTACK_PRIMARY } from '../player';
import { TF_RELOAD_START, type WeaponSpec } from '../weapon-api';
import { ACT, TF_WEAPON_PRIMARY_MODE } from './constants';
import { TFWeaponGun } from './gun';
import { num } from './tf-weapon';

/** CTFRaygun::GetProjectileSpeed, CTFParticleCannon::GetProjectileSpeed. */
export const RAYGUN_SPEED = 1200;
export const PARTICLE_CANNON_SPEED = 1100;
/** TF_PARTICLE_MAX_CHARGE_TIME. */
export const TF_PARTICLE_MAX_CHARGE_TIME = 2;
/** tf_particle_cannon_afterburn_rate. */
export const PARTICLE_CANNON_AFTERBURN = 6;
/** CTFDRGPomson::GetProjectileFireSetup: lined up with the muzzle, 13 lower. */
const POMSON_MUZZLE_DROP = 13;

/** CTFRaygun: the Righteous Bison. */
export class Raygun extends TFWeaponGun {
  constructor(spec: WeaponSpec) {
    super(spec);
    this.initEnergy();
  }

  override isEnergyWeapon(): boolean {
    return true;
  }

  /** Energy_GetShotCost (0 with energy_weapon_no_drain) / Energy_GetRechargeCost. */
  override energyShotCost(): number {
    return this.attributes.apply('energy_weapon_no_drain', 0) > 0 ? 0 : 5;
  }

  override energyRechargeCost(): number {
    return 5;
  }

  /** SDK: CTFRaygun::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    if (!this.energyHasEnergy()) return;
    super.primaryAttack(cmd);
  }

  override energySpeed(): number {
    return RAYGUN_SPEED;
  }
}

/** CTFDRGPomson. */
export class DRGPomson extends Raygun {
  override adjustEnergySource(src: Vec3): void {
    src.z -= POMSON_MUZZLE_DROP;
  }
}

/** CTFParticleCannon: the Cow Mangler 5000. */
export class ParticleCannon extends TFWeaponGun {
  /** m_flChargeBeginTime. */
  chargeBeginTime = 0;
  /** m_bChargedShot. */
  chargedShot = false;

  constructor(spec: WeaponSpec) {
    super(spec);
    this.initEnergy();
  }

  override isEnergyWeapon(): boolean {
    return true;
  }

  override energyShotCost(): number {
    return 5;
  }

  override energyRechargeCost(): number {
    return 5;
  }

  override energySpeed(): number {
    return PARTICLE_CANNON_SPEED;
  }

  /** SDK: CTFParticleCannon::GetAfterburnRateOnHit. */
  afterburnRateOnHit(): number {
    return PARTICLE_CANNON_AFTERBURN;
  }

  override energyExtra(): Record<string, number | string | boolean> {
    return { charged: this.chargedShot, afterburn: PARTICLE_CANNON_AFTERBURN };
  }

  /** SDK: CTFParticleCannon::PlayWeaponShootSound — the charged shot has its own (special2). */
  override playShootSound(): void {
    if (this.chargedShot) this.weaponSound('special2');
    else this.weaponSound('single_shot');
  }

  /** The charged shot spends the whole charge (ModifyProjectile → Energy_DrainEnergy( max )). */
  override removeProjectileAmmo(): void {
    if (this.chargedShot) this.clip = 0;
    else super.removeProjectileAmmo();
  }

  /** SDK: CTFParticleCannon::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    if (this.chargeBeginTime > 0) return;
    if (!this.energyHasEnergy()) return;
    this.chargedShot = false;
    super.primaryAttack(cmd);
  }

  /** SDK: CTFParticleCannon::SecondaryAttack — the charged shot, from a full charge only. */
  override secondaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    if (this.clip < this.maxClip) {
      this.reload();
      return;
    }
    if (this.nextPrimaryAttack > this.t || this.chargeBeginTime > 0) return;
    if (!this.canAttack()) {
      this.chargeBeginTime = 0;
      return;
    }
    this.chargedShot = true;
    this.weaponMode = TF_WEAPON_PRIMARY_MODE;
    this.chargeBeginTime = this.t;
    this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
    o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
    this.weaponSound('special1');
    o.cond.add(TF_COND.AIMING);
  }

  /** SDK: CTFParticleCannon::FireChargedShot. */
  fireChargedShot(cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !o.alive) return;
    o.cond.remove(TF_COND.AIMING);
    this.fireProjectile(cmd);
    this.nextPrimaryAttack = this.t + this.fireDelay();
    this.reloadMode = TF_RELOAD_START;
    this.chargeBeginTime = 0;
  }

  override itemPostFrame(cmd: UserCmd): void {
    super.itemPostFrame(cmd);
    if (this.chargeBeginTime > 0 && this.t - this.chargeBeginTime >= TF_PARTICLE_MAX_CHARGE_TIME)
      this.fireChargedShot(cmd);
  }

  /** SDK: CTFParticleCannon::Holster — not while charging (aiming), else the charge is dropped. */
  override canHolster(): boolean {
    return this.chargeBeginTime <= 0 && super.canHolster();
  }

  override holster(next: Parameters<TFWeaponGun['holster']>[0]): boolean {
    this.chargeBeginTime = 0;
    this.owner?.cond.remove(TF_COND.AIMING);
    return super.holster(next);
  }

  override refill(): void {
    super.refill();
    this.chargeBeginTime = 0;
    this.chargedShot = false;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.chargeBeginTime;
    out.aux1 = this.chargedShot ? 1 : 0;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.chargeBeginTime = num(rec.aux0);
    this.chargedShot = num(rec.aux1) !== 0;
  }
}

/** The energy projectiles a weapon fired (tests, bots). */
export const isEnergyProjectile = (e: Entity): boolean =>
  e.classname === 'tf_projectile_energy_ring' || e.classname === 'tf_projectile_energy_ball';
