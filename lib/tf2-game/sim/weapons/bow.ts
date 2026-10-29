/**
 * The Huntsman (CTFCompoundBow over CTFPipebombLauncher, tf_weapon_compound_bow.cpp) and the
 * Crusader's Crossbow (CTFCrossbow over CTFRocketLauncher).
 *
 * The bow: +attack draws (ACT_ITEM2_VM_CHARGE, TF_COND_AIMING: 160 u/s, no jumping), release
 * fires an arrow whose damage is 50 + the script's 70 × the draw (0 → 1 over GetChargeMaxTime,
 * 1 s by default: 50 → 120, ×3 on a headshot), speed 1800 → 2600 and gravity 0.5 → 0.1. Held
 * five seconds the shot goes wild (±6° pitch and yaw). +attack2 lowers it (LowerBow: no fire
 * for 1 s). No random crits (only crit boosts). The next arrow is nocked by the fire animation
 * (the AE_WPN_INCREMENTAMMO event) when the refire time is up; with none left the Sniper
 * switches away. A teammate Pyro's flames (or a lit torch) light the drawn arrow.
 *
 * The crossbow: a scripted one-shot launcher of healing bolts at 2400 u/s, gravity 0.2.
 *
 * Environment-agnostic.
 */

import { IN_ATTACK, IN_ATTACK2 } from '../../core/constants';
import type { UserCmd } from '../../core/types';
import { remapClamped, type Vec3 } from '../../core/vec';
import { TF_COND } from '../conditions';
import { hookWeapon } from '../items/attributes';
import type { NetRecord } from '../net-schema';
import { PLAYERANIMEVENT_ATTACK_PRIMARY, type Player } from '../player';
import { TF_RELOAD_START, type WeaponSpec } from '../weapon-api';
import { ACT, vmActivityByName } from './constants';
import { TFWeaponGun } from './gun';
import { removeDisguise } from './spy-state';
import { num } from './tf-weapon';

/** TF_ARROW_MAX_CHARGE_TIME: drawn longer than this the arrow flies wild. */
export const TF_ARROW_MAX_CHARGE_TIME = 5;
/** CTFCompoundBow::GetProjectileDamage's base, before the draw's share. */
export const BOW_BASE_DAMAGE = 50;
/** GetProjectileSpeed / GetProjectileGravity ranges over the draw. */
export const BOW_MIN_SPEED = 1800;
export const BOW_MAX_SPEED = 2600;
export const BOW_MAX_GRAVITY = 0.5;
export const BOW_MIN_GRAVITY = 0.1;
/** The over-held shot's spread, ± degrees on pitch and yaw. */
export const BOW_WILD_SPREAD = 6;

/** View-model activities of the bow's ITEM2 role the base list does not have. */
const ACT_ITEM2_VM_CHARGE = 'ACT_ITEM2_VM_CHARGE';
const ACT_ITEM2_VM_IDLE_2 = 'ACT_ITEM2_VM_IDLE_2';
const ACT_ITEM2_VM_CHARGE_IDLE_3 = 'ACT_ITEM2_VM_CHARGE_IDLE_3';
const ACT_ITEM2_VM_DRYFIRE = 'ACT_ITEM2_VM_DRYFIRE';

/** CTFCompoundBow. */
export class CompoundBow extends TFWeaponGun {
  /** m_flChargeBeginTime (0 = no arrow nocked). */
  chargeBeginTime = 0;
  /** m_bNoFire: lowered, waiting for both buttons up. */
  noFire = false;
  /** m_bWantsToShoot (WeaponIdle's release). */
  wantsToShoot = false;
  /** m_bArrowAlight. */
  arrowAlight = false;
  /** The charge the last arrow left with (0…1), for tests and the HUD. */
  lastCharge = 0;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** SDK: CTFCompoundBow::GetChargeMaxTime — ApplyFireDelay( 1 ) with fast_reload. */
  chargeMaxTime(): number {
    const scale = this.stats.fireDelay / (this.script.primary.timeFireDelay || 1);
    return hookWeapon(this, this.owner, 'fast_reload', scale);
  }

  /** SDK: CTFCompoundBow::GetCurrentCharge — seconds drawn, capped at 1. */
  currentCharge(): number {
    if (this.chargeBeginTime === 0) return 0;
    return Math.min(this.t - this.chargeBeginTime, 1);
  }

  /** 0…1 of the draw (the HUD's hudbowcharge meter). */
  chargeFraction(): number {
    return Math.min(1, Math.max(0, this.currentCharge() / this.chargeMaxTime()));
  }

  /** SDK: CTFCompoundBow::GetProjectileDamage. */
  override projectileDamage(): number {
    const base = hookWeapon(this, this.owner, 'mult_dmg', BOW_BASE_DAMAGE);
    return base + this.stats.damage * this.chargeFraction();
  }

  /** SDK: CTFCompoundBow::GetProjectileSpeed. */
  override arrowSpeed(): number {
    return remapClamped(
      this.currentCharge(),
      0,
      this.chargeMaxTime(),
      BOW_MIN_SPEED,
      BOW_MAX_SPEED,
    );
  }

  /** SDK: CTFCompoundBow::GetProjectileGravity. */
  override arrowGravity(): number {
    return remapClamped(
      this.currentCharge(),
      0,
      this.chargeMaxTime(),
      BOW_MAX_GRAVITY,
      BOW_MIN_GRAVITY,
    );
  }

  override arrowExtra(): Record<string, number | string | boolean> {
    return this.arrowAlight ? { alight: true } : {};
  }

  /** SDK: CTFCompoundBow::GetProjectileFireSetup — held too long, the shot goes wild. */
  override adjustArrowAngles(angles: Vec3): void {
    if (this.t - this.chargeBeginTime < TF_ARROW_MAX_CHARGE_TIME) return;
    const rng = this.owner!.world.random;
    angles.x += -BOW_WILD_SPREAD + rng.randomFloat(0, 1) * BOW_WILD_SPREAD * 2;
    angles.y += -BOW_WILD_SPREAD + rng.randomFloat(0, 1) * BOW_WILD_SPREAD * 2;
  }

  /** SDK: CTFCompoundBow::CalcIsAttackCriticalHelper — crit boosts only. */
  override calcIsAttackCriticalHelper(_cmd: UserCmd): boolean {
    return !!this.owner && this.owner.cond.critBoosted;
  }

  /** SDK: CTFCompoundBow::OwnerCanJump — not with an arrow drawn. */
  ownerCanJump(): boolean {
    return this.chargeBeginTime === 0;
  }

  /** SDK: CTFCompoundBow::SetArrowAlight (not while the last arrow is still leaving). */
  setArrowAlight(alight: boolean): void {
    if (this.vmActivity !== ACT.VM_PRIMARYATTACK || !alight) {
      if (alight && !this.arrowAlight && this.owner)
        this.owner.world.emitSound('ArrowLight', { entity: this.owner.id });
      this.arrowAlight = alight;
    }
  }

  /** SDK: CTFCompoundBow::WeaponReset. */
  override refill(): void {
    this.lowerBow();
    super.refill();
    this.arrowAlight = false;
    this.noFire = false;
    this.wantsToShoot = false;
  }

  override deploy(): boolean {
    this.chargeBeginTime = 0;
    return super.deploy();
  }

  /** SDK: CTFCompoundBow::Holster. */
  override holster(next: Parameters<TFWeaponGun['holster']>[0]): boolean {
    const o = this.owner;
    if (o) o.cond.remove(TF_COND.AIMING);
    this.noFire = false;
    this.arrowAlight = false;
    this.chargeBeginTime = 0;
    return super.holster(next);
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    this.chargeBeginTime = 0;
    this.arrowAlight = false;
  }

  /** SDK: CTFCompoundBow::PrimaryAttack — nock and draw. */
  override primaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    if (this.clip <= 0 && this.clip !== -1) return;
    if (this.nextPrimaryAttack > this.t) return;
    if (this.noFire) return;
    if (!this.canAttack()) {
      this.chargeBeginTime = 0;
      return;
    }
    if (this.chargeBeginTime <= 0) {
      this.chargeBeginTime = this.t;
      this.sendWeaponAnimName(ACT_ITEM2_VM_CHARGE);
      o.world.emitSound('Weapon_CompoundBow.SinglePull', {
        entity: o.id,
        predictedBy: o.isBot ? undefined : o.id,
      });
      // Slower while drawn (TF_COND_AIMING: 160 u/s for the bow).
      o.cond.add(TF_COND.AIMING);
    }
  }

  /** SDK: CTFCompoundBow::SecondaryAttack → LowerBow. */
  override secondaryAttack(_cmd: UserCmd): void {
    this.lowerBow();
  }

  /** SDK: CTFCompoundBow::LowerBow — un-nock: no firing for a second, until both buttons are up. */
  lowerBow(): void {
    if (this.currentCharge() === 0) return;
    this.chargeBeginTime = 0;
    const o = this.owner;
    if (o) o.cond.remove(TF_COND.AIMING);
    this.nextPrimaryAttack = this.t + 1;
    this.noFire = true;
    this.wantsToShoot = false;
    this.sendWeaponAnimName(ACT_ITEM2_VM_DRYFIRE);
  }

  /** SDK: CTFCompoundBow::LaunchGrenade. */
  launchGrenade(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    this.calcIsAttackCritical(cmd);
    this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
    o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
    this.wantsToShoot = false;
    this.lastCharge = this.chargeFraction();
    this.fireProjectile(cmd);
    const delay = this.fireDelay();
    this.nextPrimaryAttack = this.t + delay;
    this.timeWeaponIdle =
      this.nextPrimaryAttack + 0.5 * (this.script.primary.timeFireDelay / Math.max(delay, 1e-6));
    o.cond.remove(TF_COND.AIMING);
    this.chargeBeginTime = 0;
    this.arrowAlight = false;
    this.reloadMode = TF_RELOAD_START;
    removeDisguise(o);
  }

  /** SDK: CTFCompoundBow::ItemPostFrame over CTFPipebombLauncher::ItemPostFrame. */
  override tfItemPostFrame(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    if (!this.canAttack()) this.lowerBow();
    // The fire animation nocks the next arrow (AE_WPN_INCREMENTAMMO) once the refire time is up.
    if (this.clip <= 0 && this.nextPrimaryAttack <= this.t) {
      if (this.reserve() > 0) {
        this.clip = 1;
        o.ammo[this.stats.ammoType]--;
      } else if (o.lastCmd.buttons === 0 || this.nextPrimaryAttack + 0.5 <= this.t) {
        // SwitchToNextBestWeapon: no arrows left.
        switchToNextBest(o, this);
        return;
      }
    }
    super.tfItemPostFrame(cmd);
    if (
      this.chargeBeginTime > 0 &&
      this.clip > 0 &&
      !(cmd.buttons & IN_ATTACK) &&
      this.released(cmd, IN_ATTACK)
    ) {
      this.launchGrenade(cmd);
    }
    if (!(cmd.buttons & IN_ATTACK) && !(cmd.buttons & IN_ATTACK2)) this.noFire = false;
  }

  /** SDK: CTFPipebombLauncher::WeaponIdle (the released arrow), else the bow's idle. */
  override weaponIdle(cmd: UserCmd): void {
    if (this.chargeBeginTime > 0 && this.clip > 0 && this.released(cmd, IN_ATTACK))
      this.wantsToShoot = true;
    if (this.wantsToShoot) {
      this.launchGrenade(cmd);
      return;
    }
    if (this.timeWeaponIdle > this.t) return;
    if (this.chargeBeginTime > 0) {
      this.sendWeaponAnimName(
        this.t - this.chargeBeginTime >= TF_ARROW_MAX_CHARGE_TIME
          ? ACT_ITEM2_VM_CHARGE_IDLE_3
          : ACT_ITEM2_VM_IDLE_2,
      );
      this.timeWeaponIdle = this.t + this.idleTime();
    } else super.weaponIdle(cmd);
  }

  /** The bow never reloads by hand (CTFCompoundBow::Reload waits for the refire). */
  override reload(): boolean {
    if (this.nextPrimaryAttack > this.t) return false;
    return false;
  }

  /** Sends a view-model activity by name (ITEM2 activities not in the base list). */
  sendWeaponAnimName(name: string): void {
    this.sendWeaponAnim(vmActivityByName(name));
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.chargeBeginTime;
    out.aux1 = (this.noFire ? 1 : 0) | (this.wantsToShoot ? 2 : 0) | (this.arrowAlight ? 4 : 0);
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.chargeBeginTime = num(rec.aux0);
    const f = num(rec.aux1);
    this.noFire = (f & 1) !== 0;
    this.wantsToShoot = (f & 2) !== 0;
    this.arrowAlight = (f & 4) !== 0;
  }
}

/** CTFCrossbow: healing bolts at RemapValClamped( 0.75, 0, 1, 1800, 2600 ) = 2400, gravity 0.2. */
export class Crossbow extends TFWeaponGun {
  override arrowSpeed(): number {
    return remapClamped(0.75, 0, 1, BOW_MIN_SPEED, BOW_MAX_SPEED);
  }

  override arrowGravity(): number {
    return remapClamped(0.75, 0, 1, BOW_MAX_GRAVITY, BOW_MIN_GRAVITY);
  }
}

/** A teammate's flames lit the Sniper's drawn arrow (CTFFlameEntity::OnCollideWithTeammate). */
export function lightTeammateArrow(p: Player): void {
  if (p.playerClass !== 2) return;
  const w = p.activeWeapon();
  if (w instanceof CompoundBow) w.setArrowAlight(true);
}

/** CTFGameRules::SwitchToNextBestWeapon: the last weapon, else the first that can deploy. */
export function switchToNextBest(o: Player, from: unknown): void {
  if (
    o.lastSlot >= 0 &&
    o.weapons[o.lastSlot] &&
    o.weapons[o.lastSlot] !== from &&
    o.switchToSlot(o.lastSlot)
  )
    return;
  for (let i = 0; i < o.weapons.length; i++) {
    const w = o.weapons[i];
    if (w && w !== from && w.canDeploy() && o.switchToSlot(i)) return;
  }
}
