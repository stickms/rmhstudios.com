/**
 * The flare guns (tf_weapon_flaregun.cpp): CTFFlareGun — the Flare Gun, the Detonator (set_weapon_mode 1:
 * +attack2 detonates its flares in the air), the Scorch Shot (3: flares knock players back and burst
 * on landing) — and CTFFlareGun_Revenge, the Manmelter (2): an energy weapon that crits
 * (TF_COND_CRITBOOSTED while out) once per teammate it puts out — +attack2 held sucks the fire off a
 * burning teammate in a 16-unit hull 256 units ahead, every 0.5 s, and the Pyro gets 20 health.
 *
 * Flares (projectiles/flare.ts) fly at 2000 u/s × mult_projectile_speed, gravity 0.3; one that hits
 * a burning player crits (the Detonator and the Scorch Shot mini-crit instead, through
 * or_minicrit_vs_playercond_burning; the Manmelter's never do). Flares can't be fired with the eyes
 * under water.
 *
 * Environment-agnostic.
 */

import { IN_ATTACK2, MASK_SOLID, WL_EYES } from '../../core/constants';
import { emptyTrace, type UserCmd } from '../../core/types';
import { angleVectors, vec3, type Vec3 } from '../../core/vec';
import { COLLISION_GROUP_NONE, type Entity } from '../entity';
import { TF_COND } from '../conditions';
import { hookInt, hookWeapon } from '../items/attributes';
import { setRevengeCrits } from '../items/effects';
import type { NetRecord } from '../net-schema';
import type { Player } from '../player';
import type { WeaponSpec } from '../weapon-api';
import { TFWeaponGun } from './gun';
import { num } from './tf-weapon';

/** ETFFlareType (tf_weapon_flaregun.h), the item's set_weapon_mode. */
export const FLAREGUN = { NORMAL: 0, DETONATE: 1, GRORDBORT: 2, SCORCHSHOT: 3 } as const;
/** CTFProjectile_Flare: FLARE_SPEED, FLARE_GRAVITY. */
export const FLARE_SPEED = 2000;
export const FLARE_GRAVITY = 0.3;
/** tf_flaregun_afterburn_rate (GetAfterburnRateOnHit). */
export const FLAREGUN_AFTERBURN_RATE = 7.5;
/** The Manmelter's extinguish reach and refire. */
const MANMELTER_REACH = 256;
const MANMELTER_INTERVAL = 0.5;
const MANMELTER_HULL_MIN: Vec3 = { x: -16, y: -16, z: -16 };
const MANMELTER_HULL_MAX: Vec3 = { x: 16, y: 16, z: 16 };

/** A flare a Detonator can set off (CTFProjectile_Flare::Detonate). */
interface DetonatableFlare extends Entity {
  detonate(selfOnly: boolean): void;
}

const mmEye = vec3();
const mmFwd = vec3();
const mmEnd = vec3();
const mmTrace = emptyTrace();

/** CTFFlareGun. */
export class FlareGun extends TFWeaponGun {
  /** m_flChargeBeginTime (the Manmelter's +attack2). */
  chargeBeginTime = 0;
  /** m_Flares: the Detonator's live flares, by entity id. */
  readonly flares: number[] = [];
  private lastDenySoundTime = 0;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** SDK: CTFFlareGun::GetFlareGunType. */
  flareGunType(): number {
    return hookInt(hookWeapon(this, this.owner, 'set_weapon_mode', 0));
  }

  /** SDK: CTFFlareGun::GetAfterburnRateOnHit. */
  afterburnRateOnHit(): number {
    return FLAREGUN_AFTERBURN_RATE;
  }

  override flareSpeed(): number {
    return hookWeapon(this, this.owner, 'mult_projectile_speed', FLARE_SPEED);
  }

  /** CTFProjectile_Flare::Create: FLARE_GRAVITY × mult_projectile_speed. */
  flareGravity(): number {
    return hookWeapon(this, this.owner, 'mult_projectile_speed', FLARE_GRAVITY);
  }

  override flareExtra(): Record<string, number | string | boolean> {
    return {
      gravity: this.flareGravity(),
      flareType: this.flareGunType(),
      afterburn: this.afterburnRateOnHit(),
    };
  }

  /** SDK: CTFFlareGun::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o || this.chargeBeginTime > 0) return;
    if (o.move.waterLevel !== WL_EYES) super.primaryAttack(cmd);
    else if (this.t > this.lastDenySoundTime) {
      this.weaponSound('special2');
      this.lastDenySoundTime = this.t + 1;
    }
  }

  /** SDK: CTFFlareGun::SecondaryAttack — the Detonator sets its flares off. */
  override secondaryAttack(cmd: UserCmd): void {
    if (this.flareGunType() !== FLAREGUN.DETONATE) {
      super.secondaryAttack(cmd);
      return;
    }
    const o = this.owner;
    if (!o || !this.canAttack()) return;
    const w = o.world;
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = w.entity(this.flares[i]) as DetonatableFlare | null;
      if (f && typeof f.detonate === 'function') f.detonate(false);
    }
  }

  /** CTFFlareGun::AddFlare (FireFlare, the Detonator). */
  override onFlareFired(flare: Entity): void {
    if (this.flareGunType() === FLAREGUN.DETONATE) this.flares.push(flare.id);
  }

  /** CTFFlareGun::DeathNotice. */
  onFlareRemoved(flare: Entity): void {
    const i = this.flares.indexOf(flare.id);
    if (i >= 0) this.flares.splice(i, 1);
  }

  /** SDK: CTFFlareGun::ItemPostFrame — the charge lasts while +attack2 is held. */
  override itemPostFrame(cmd: UserCmd): void {
    super.itemPostFrame(cmd);
    if (this.chargeBeginTime > 0) {
      if (!(cmd.buttons & IN_ATTACK2)) this.stopCharge();
      else this.chargePostFrame();
    }
  }

  chargePostFrame(): void {}

  stopCharge(): void {
    this.chargeBeginTime = 0;
  }

  override holster(next: Parameters<TFWeaponGun['holster']>[0]): boolean {
    this.stopCharge();
    return super.holster(next);
  }

  override refill(): void {
    super.refill();
    this.chargeBeginTime = 0;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.chargeBeginTime;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.chargeBeginTime = num(rec.aux0);
  }
}

/** CTFFlareGun_Revenge: the Manmelter. */
export class FlareGunRevenge extends FlareGun {
  /** m_fLastExtinguishTime. */
  lastExtinguishTime = 0;

  constructor(spec: WeaponSpec) {
    super(spec);
    this.initEnergy();
    // Its flares cost nothing (no ModifyProjectile drain): it never needs to recharge.
    this.stats.ammoPerShot = 0;
  }

  override isEnergyWeapon(): boolean {
    return true;
  }

  /** SDK: CTFFlareGun_Revenge::Deploy — banked crits boost it while it is out. */
  override deploy(): boolean {
    const o = this.owner;
    if (o && o.unlock.revengeCrits > 0) o.cond.add(TF_COND.CRITBOOSTED);
    this.stopCharge();
    return super.deploy();
  }

  /** SDK: CTFFlareGun_Revenge::Holster. */
  override holster(next: Parameters<TFWeaponGun['holster']>[0]): boolean {
    const o = this.owner;
    if (o && o.unlock.revengeCrits > 0) o.cond.remove(TF_COND.CRITBOOSTED);
    return super.holster(next);
  }

  /** SDK: CTFFlareGun_Revenge::PrimaryAttack — a shot spends a banked crit. */
  override primaryAttack(cmd: UserCmd): void {
    if (!this.canAttack()) return;
    const before = this.lastFireTime;
    super.primaryAttack(cmd);
    const o = this.owner;
    if (o && this.lastFireTime !== before) setRevengeCrits(o, o.unlock.revengeCrits - 1);
  }

  /** SDK: CTFFlareGun_Revenge::SecondaryAttack — start the extinguishing charge. */
  override secondaryAttack(_cmd: UserCmd): void {
    if (this.nextSecondaryAttack > this.t) return;
    if (!this.owner) return;
    if (this.chargeBeginTime === 0) {
      this.chargeBeginTime = this.t;
      this.weaponSound('double_shot');
    }
    this.nextSecondaryAttack = this.t + 0.5;
  }

  /** SDK: CTFFlareGun_Revenge::ChargePostFrame — put out a burning teammate ahead, every 0.5 s. */
  override chargePostFrame(): void {
    const o = this.owner;
    if (!o || this.t <= this.lastExtinguishTime + MANMELTER_INTERVAL) return;
    const w = o.world;
    o.eyePosition(mmEye);
    angleVectors(o.eyeAngles, mmFwd);
    mmEnd.x = mmEye.x + mmFwd.x * MANMELTER_REACH;
    mmEnd.y = mmEye.y + mmFwd.y * MANMELTER_REACH;
    mmEnd.z = mmEye.z + mmFwd.z * MANMELTER_REACH;
    w.traceHull(
      mmEye,
      mmEnd,
      MANMELTER_HULL_MIN,
      MANMELTER_HULL_MAX,
      MASK_SOLID,
      w.entityFilter(o, COLLISION_GROUP_NONE),
      mmTrace,
    );
    const hit = w.entity(mmTrace.entity);
    if (!hit || !hit.isPlayer()) return;
    const target = hit as Player;
    if (target.team !== o.team || !target.cond.has(TF_COND.BURNING)) return;
    // The player that lit them, before the fire goes (GetOriginalBurnAttacker).
    const burner = w.entity(target.burnAttacker);
    // ExtinguishPlayer.
    w.emitSound('TFPlayer.FlameOut', { entity: target.id });
    target.extinguish();
    o.stats.bonusPoints += 10;
    this.lastExtinguishTime = this.t;
    if (burner && burner.isPlayer() && burner.team !== o.team) {
      setRevengeCrits(o, o.unlock.revengeCrits + 1);
      this.weaponSound('special1');
      if (hookInt(hookWeapon(this, o, 'extinguish_restores_health', 0)) > 0) o.takeHealth(20);
    }
  }

  protected override writeWeaponNet(out: NetRecord): void {
    super.writeWeaponNet(out);
    out.aux1 = this.lastExtinguishTime;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    super.readWeaponNet(rec);
    this.lastExtinguishTime = num(rec.aux1);
  }
}
