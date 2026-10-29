/**
 * CTFMinigun: the wind-up state machine (SharedAttack): IDLE → WindUp
 * (TF_COND_AIMING, 0.75 s, ACT_MP_ATTACK_STAND_PREFIRE) → STARTFIRING →
 * FIRING (attack) / SPINNING (attack2) / DRYFIRE (no ammo); WeaponIdle winds
 * down. Damage ramps 50 % → 100 % and spread 150 % → 100 % over the first
 * second of spin (GetProjectileDamage / GetWeaponSpread with
 * TF_MINIGUN_PENALTY_PERIOD). Can't holster while spun up. Sounds follow
 * WeaponSoundUpdate: wind up, fire loop (crit loop), spin loop, wind down,
 * empty.
 */

import { IN_ATTACK, IN_ATTACK2 } from '../../core/constants';
import type { UserCmd } from '../../core/types';
import { remapClamped } from '../../core/vec';
import { MINIGUN, type WeaponSoundCategory } from '../../data/weapons';
import { TF_COND } from '../conditions';
import type { NetRecord } from '../net-schema';
import { PLAYERANIMEVENT_ATTACK_PRIMARY } from '../player';
import type { WeaponSpec } from '../weapon-api';
import {
  AC_STATE_DRYFIRE,
  AC_STATE_FIRING,
  AC_STATE_IDLE,
  AC_STATE_SPINNING,
  AC_STATE_STARTFIRING,
  ACT,
  MINIGUN_FIRE_IDLE,
  MINIGUN_IDLE_REPEAT,
  MINIGUN_STATE_INTERVAL,
  MINIGUN_WINDDOWN_IDLE,
  PLAYERANIMEVENT_ATTACK_POST,
  PLAYERANIMEVENT_ATTACK_PRE,
  TF_WEAPON_PRIMARY_MODE,
  TF_WEAPON_SECONDARY_MODE,
} from './constants';
import { TFWeaponGun } from './gun';
import { num } from './tf-weapon';
import { hookWeapon } from '../items/attributes';

export class Minigun extends TFWeaponGun {
  /** m_iWeaponState (AC_STATE_*). */
  weaponState = AC_STATE_IDLE;
  /** m_flStartedFiringAt / m_flStartedWindUpAt (−1 = not). */
  startedFiringAt = -1;
  startedWindUpAt = -1;
  /** m_bCritShot (crit fire loop). */
  critShot = false;
  /** The sound category currently playing (m_iMinigunSoundCur), '' = none. */
  private soundCur: WeaponSoundCategory | '' = '';

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** GetWindUpDuration / GetFiringDuration. */
  windUpDuration(): number {
    return this.startedWindUpAt >= 0 ? this.t - this.startedWindUpAt : 0;
  }

  firingDuration(): number {
    return this.startedFiringAt >= 0 ? this.t - this.startedFiringAt : 0;
  }

  private spinTime(): number {
    return Math.max(this.windUpDuration() - MINIGUN.spinUpTime, this.firingDuration());
  }

  /** SDK: CTFMinigun::GetProjectileDamage — 50 % → 100 % between 0.2 s and 1 s of spin. */
  override projectileDamage(): number {
    const base = super.projectileDamage();
    const spin = this.spinTime();
    if (spin < MINIGUN.penaltyPeriod) return base * remapClamped(spin, MINIGUN.damageRampStart, MINIGUN.penaltyPeriod, MINIGUN.minDamageScale, 1);
    return base;
  }

  /** SDK: CTFMinigun::GetWeaponSpread — 150 % → 100 % over the first second. */
  override weaponSpread(): number {
    const base = super.weaponSpread();
    const spin = this.spinTime();
    if (spin < MINIGUN.penaltyPeriod) return base * remapClamped(spin, 0, MINIGUN.penaltyPeriod, MINIGUN.maxSpreadScale, 1);
    return base;
  }

  /** The minigun's tracer is on every bullet. */
  override tracerFrequency(): number {
    return this.script.tracerEffect ? 1 : 0;
  }

  /** The fire loop is WeaponSoundUpdate's job, not a per-shot sound. */
  override playShootSound(): void {}

  override primaryAttack(cmd: UserCmd): void {
    this.sharedAttack(cmd);
  }

  override secondaryAttack(cmd: UserCmd): void {
    this.sharedAttack(cmd);
  }

  /** SDK: CTFMinigun::SharedAttack. */
  sharedAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    const t = this.t;
    if (!this.canAttack()) {
      this.weaponIdle(cmd);
      return;
    }
    if (cmd.buttons & IN_ATTACK) this.weaponMode = TF_WEAPON_PRIMARY_MODE;
    else if (cmd.buttons & IN_ATTACK2) this.weaponMode = TF_WEAPON_SECONDARY_MODE;
    const secondary = this.weaponMode === TF_WEAPON_SECONDARY_MODE;
    switch (this.weaponState) {
      default:
      case AC_STATE_IDLE: {
        this.windUp();
        // TF_MINIGUN_SPINUP_TIME × mult_minigun_spinup_time (Natascha, the Brass Beast, Tomislav).
        const spin = Math.max(hookWeapon(this, o, 'mult_minigun_spinup_time', MINIGUN.spinUpTime), 0.00001);
        this.nextPrimaryAttack = t + spin;
        this.nextSecondaryAttack = t + spin;
        this.timeWeaponIdle = t + spin;
        this.startedFiringAt = -1;
        o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRE);
        break;
      }
      case AC_STATE_STARTFIRING:
        if (this.nextPrimaryAttack <= t) {
          this.weaponState = secondary ? AC_STATE_SPINNING : AC_STATE_FIRING;
          this.nextSecondaryAttack = this.nextPrimaryAttack = this.timeWeaponIdle = t + MINIGUN_STATE_INTERVAL;
        }
        break;
      case AC_STATE_FIRING:
        if (secondary) this.weaponState = AC_STATE_SPINNING;
        if (this.weaponState === AC_STATE_SPINNING) {
          this.nextSecondaryAttack = this.nextPrimaryAttack = this.timeWeaponIdle = t + MINIGUN_STATE_INTERVAL;
        } else if (this.reserve() <= 0) this.weaponState = AC_STATE_DRYFIRE;
        else {
          if (this.startedFiringAt < 0) this.startedFiringAt = t;
          super.primaryAttack(cmd);
          this.critShot = this.currentAttackIsCrit;
          o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
          this.timeWeaponIdle = t + MINIGUN_FIRE_IDLE;
        }
        break;
      case AC_STATE_DRYFIRE:
        this.startedFiringAt = -1;
        this.startedWindUpAt = -1;
        if (this.reserve() > 0) this.weaponState = AC_STATE_FIRING;
        else if (secondary) this.weaponState = AC_STATE_SPINNING;
        this.sendWeaponAnim(ACT.VM_SECONDARYATTACK);
        break;
      case AC_STATE_SPINNING:
        this.startedFiringAt = -1;
        if (!secondary) this.weaponState = this.reserve() > 0 ? AC_STATE_FIRING : AC_STATE_DRYFIRE;
        this.sendWeaponAnim(ACT.VM_SECONDARYATTACK);
        break;
    }
  }

  /** SDK: CTFMinigun::WindUp. */
  windUp(): void {
    const o = this.owner!;
    this.sendWeaponAnim(ACT.MP_ATTACK_STAND_PREFIRE);
    this.weaponState = AC_STATE_STARTFIRING;
    o.cond.add(TF_COND.AIMING);
    if (this.startedWindUpAt === -1) this.startedWindUpAt = this.t;
  }

  /** SDK: CTFMinigun::WindDown. */
  windDown(): void {
    const o = this.owner;
    if (!o) return;
    this.sendWeaponAnim(ACT.MP_ATTACK_STAND_POSTFIRE);
    this.weaponState = AC_STATE_IDLE;
    o.cond.remove(TF_COND.AIMING);
    this.timeWeaponIdle = this.t + MINIGUN_WINDDOWN_IDLE;
    this.startedWindUpAt = -1;
    this.startedFiringAt = -1;
  }

  /** SDK: CTFMinigun::WeaponIdle — releasing the buttons winds down. */
  override weaponIdle(cmd: UserCmd): void {
    const o = this.owner;
    if (!o || this.t < this.timeWeaponIdle) return;
    if (this.weaponState !== AC_STATE_IDLE) {
      o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_POST);
      this.windDown();
      return;
    }
    super.weaponIdle(cmd);
    this.timeWeaponIdle = this.t + MINIGUN_IDLE_REPEAT;
  }

  /** SDK: CTFMinigun::HandleFireOnEmpty. */
  override handleFireOnEmpty(): void {
    if (this.weaponState === AC_STATE_FIRING || this.weaponState === AC_STATE_SPINNING) {
      this.weaponState = AC_STATE_DRYFIRE;
      this.sendWeaponAnim(ACT.VM_SECONDARYATTACK);
      if (this.weaponMode === TF_WEAPON_SECONDARY_MODE) this.weaponState = AC_STATE_SPINNING;
    }
  }

  /** SDK: CTFMinigun::CanHolster — not while spun up. */
  override canHolster(): boolean {
    return this.weaponState <= AC_STATE_IDLE;
  }

  override holster(next: Parameters<TFWeaponGun['holster']>[0]): boolean {
    if (this.weaponState > AC_STATE_IDLE) this.windDown();
    this.updateSound();
    return super.holster(next);
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    this.weaponState = AC_STATE_IDLE;
    this.startedFiringAt = this.startedWindUpAt = -1;
    this.updateSound();
  }

  override refill(): void {
    super.refill();
    if (this.owner) this.owner.cond.remove(TF_COND.AIMING);
    this.weaponState = AC_STATE_IDLE;
    this.startedFiringAt = this.startedWindUpAt = -1;
  }

  override tfItemPostFrame(cmd: UserCmd): void {
    this.nextEmptySoundTime = this.t + 1;
    super.tfItemPostFrame(cmd);
    this.updateSound();
  }

  /** SDK: CTFMinigun::WeaponSoundUpdate (server-side events: loops start and stop). */
  updateSound(): void {
    let want: WeaponSoundCategory | '' = '';
    switch (this.weaponState) {
      case AC_STATE_IDLE:
        want = this.soundCur === '' ? '' : 'special2';
        break;
      case AC_STATE_STARTFIRING:
        want = 'special1';
        break;
      case AC_STATE_FIRING:
        want = this.critShot ? 'burst' : 'double_shot';
        break;
      case AC_STATE_SPINNING:
        want = 'special3';
        break;
      case AC_STATE_DRYFIRE:
        want = 'empty';
        break;
    }
    if (want === this.soundCur) return;
    if (this.soundCur !== '') this.stopSound(this.sounds[this.soundCur]);
    this.soundCur = want;
    if (want !== '') this.weaponSound(want);
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.weaponState;
    out.aux1 = this.startedFiringAt;
    out.aux2 = this.startedWindUpAt;
    out.aux3 = (this.critShot ? 1 : 0) | (this.weaponMode ? 2 : 0);
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.weaponState = num(rec.aux0);
    this.startedFiringAt = num(rec.aux1);
    this.startedWindUpAt = num(rec.aux2);
    const f = num(rec.aux3);
    this.critShot = (f & 1) !== 0;
    this.weaponMode = f & 2 ? TF_WEAPON_SECONDARY_MODE : TF_WEAPON_PRIMARY_MODE;
  }
}
