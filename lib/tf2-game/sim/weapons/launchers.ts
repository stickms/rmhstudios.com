/**
 * The projectile launchers: Rocket Launcher (CTFRocketLauncher), Grenade
 * Launcher (CTFGrenadeLauncher), Syringe Gun (CTFSyringeGun) — all plain
 * CTFWeaponBaseGun fire flows with their projectile — and the Stickybomb
 * Launcher (CTFPipebombLauncher): hold to charge (launch speed 900 → 2400
 * over 4 s, auto-release at 4 s), at most 8 stickies out (a 9th detonates
 * the oldest), +attack2 detonates the armed ones (from any weapon, through
 * DoClassSpecialSkill), unarmed ones refuse with Player.UseDeny.
 */

import { IN_ATTACK, IN_ATTACK2 } from '../../core/constants';
import type { UserCmd } from '../../core/types';
import { remapClamped } from '../../core/vec';
import { STICKYBOMB } from '../../data/weapons';
import type { NetRecord } from '../net-schema';
import { TF_RELOAD_START, type WeaponSpec } from '../weapon-api';
import { TFGrenadePipebomb, type PipebombOwnerWeapon } from '../projectiles/pipebomb';
import type { Entity } from '../entity';
import { ACT } from './constants';
import { TFWeaponGun } from './gun';
import { removeDisguise } from './spy-state';
import { num, type ClassSkillWeapon } from './tf-weapon';

/** CTFRocketLauncher. */
export class RocketLauncher extends TFWeaponGun {}

/** CTFGrenadeLauncher (stock: no charge, no detonate mode). */
export class GrenadeLauncher extends TFWeaponGun {}

/** CTFSyringeGun. */
export class SyringeGun extends TFWeaponGun {}

/** CTFPipebombLauncher. */
export class StickybombLauncher extends TFWeaponGun implements ClassSkillWeapon, PipebombOwnerWeapon {
  /** m_flChargeBeginTime (0 = not charging). */
  chargeBeginTime = 0;
  /** m_Pipebombs (server), oldest first. */
  readonly pipebombs: TFGrenadePipebomb[] = [];
  /** m_iPipebombCount (networked to the owner for the HUD). */
  pipebombCount = 0;
  lastDenySoundTime = 0;
  wantsToShoot = false;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** TF_PIPEBOMB_MAX_CHARGE_TIME (GetChargeMaxTime / GetChargeForceReleaseTime). */
  chargeMaxTime(): number {
    return STICKYBOMB.maxChargeTime;
  }

  /** 0…1 of the current charge (HUD meter). */
  currentCharge(): number {
    if (this.chargeBeginTime <= 0) return 0;
    return Math.min(1, (this.t - this.chargeBeginTime) / this.chargeMaxTime());
  }

  override deploy(): boolean {
    this.chargeBeginTime = 0;
    return super.deploy();
  }

  override holster(next: Parameters<TFWeaponGun['holster']>[0]): boolean {
    if (this.chargeBeginTime > 0) this.stopSound(STICKY_CHARGE_SOUND);
    this.chargeBeginTime = 0;
    return super.holster(next);
  }

  /** WeaponReset: stickies fizzle. */
  override refill(): void {
    super.refill();
    this.detonateRemotePipebombs(true);
    this.chargeBeginTime = 0;
    this.wantsToShoot = false;
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    this.detonateRemotePipebombs(true);
    this.chargeBeginTime = 0;
  }

  /** SDK: CTFPipebombLauncher::ItemPostFrame — release (or the 4 s limit) launches. */
  override tfItemPostFrame(cmd: UserCmd): void {
    super.tfItemPostFrame(cmd);
    if (this.chargeBeginTime > 0) {
      if (this.clip > 0 && !(cmd.buttons & IN_ATTACK) && this.released(cmd, IN_ATTACK)) this.launchGrenade(cmd);
      else if (this.t - this.chargeBeginTime >= this.chargeMaxTime()) this.launchGrenade(cmd);
    }
  }

  /** SDK: CTFPipebombLauncher::ItemBusyFrame — detonation works while busy too. */
  override itemBusyFrame(cmd: UserCmd): void {
    if (cmd.buttons & IN_ATTACK2) this.secondaryAttack(cmd);
    super.itemBusyFrame(cmd);
  }

  /** SDK: CTFPipebombLauncher::PrimaryAttack — start or continue charging. */
  override primaryAttack(cmd: UserCmd): void {
    if (this.clip <= 0) return;
    const t = this.t;
    if (this.nextPrimaryAttack > t) return;
    if (!this.canAttack()) {
      this.chargeBeginTime = 0;
      return;
    }
    if (this.chargeBeginTime <= 0) {
      this.chargeBeginTime = t;
      this.sendWeaponAnim(ACT.VM_PULLBACK);
      const o = this.owner!;
      o.world.emitSound(STICKY_CHARGE_SOUND, { entity: o.id, predictedBy: o.isBot ? undefined : o.id });
    } else if (t - this.chargeBeginTime >= this.chargeMaxTime()) this.launchGrenade(cmd);
  }

  /** SDK: CTFPipebombLauncher::Reload — never while a charge is held. */
  override reload(): boolean {
    if (this.chargeBeginTime > 0) return false;
    return super.reload();
  }

  /** SDK: CTFPipebombLauncher::WeaponIdle. */
  override weaponIdle(cmd: UserCmd): void {
    if (this.chargeBeginTime > 0 && this.clip > 0 && this.released(cmd, IN_ATTACK)) this.wantsToShoot = true;
    if (this.wantsToShoot) this.launchGrenade(cmd);
    else super.weaponIdle(cmd);
  }

  /** SDK: CTFPipebombLauncher::LaunchGrenade. */
  launchGrenade(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    const t = this.t;
    this.wantsToShoot = false;
    this.calcIsAttackCritical(cmd);
    this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
    this.fireProjectile(cmd);
    this.stopSound(STICKY_CHARGE_SOUND);
    this.nextPrimaryAttack = t + this.stats.fireDelay;
    this.lastDenySoundTime = t;
    this.timeWeaponIdle = t + Math.max(this.stats.fireDelay, this.idleTime());
    this.reloadMode = TF_RELOAD_START;
    this.chargeBeginTime = 0;
    removeDisguise(o);
  }

  /** SDK: CTFPipebombLauncher::GetProjectileSpeed. */
  override projectileSpeed(): number {
    return remapClamped(this.t - this.chargeBeginTime, 0, this.chargeMaxTime(), STICKYBOMB.minChargeSpeed, STICKYBOMB.maxChargeSpeed);
  }

  /** SDK: CTFPipebombLauncher::FireProjectile — keep at most TF_WEAPON_PIPEBOMB_COUNT. */
  override fireProjectile(cmd: UserCmd): Entity | null {
    const proj = super.fireProjectile(cmd);
    if (proj instanceof TFGrenadePipebomb) {
      if (this.pipebombs.length >= STICKYBOMB.maxActive) {
        const oldest = this.pipebombs.shift();
        oldest?.setTimer(this.t);
      }
      this.pipebombs.push(proj);
      this.pipebombCount = this.pipebombs.length;
    }
    return proj;
  }

  /** SDK: CTFPipebombLauncher::SecondaryAttack — detonate, or deny while some aren't armed. */
  override secondaryAttack(_cmd: UserCmd): void {
    this.classSkill();
  }

  classSkill(): void {
    if (!this.canAttack() || this.pipebombCount <= 0) return;
    const t = this.t;
    if (this.detonateRemotePipebombs(false)) {
      if (this.lastDenySoundTime <= t) {
        this.lastDenySoundTime = t + 1;
        this.weaponSound('special2');
      }
    } else this.weaponSound('special3');
  }

  /** SDK: CTFPipebombLauncher::DetonateRemotePipebombs — returns true when some were not armed yet. */
  detonateRemotePipebombs(fizzle: boolean): boolean {
    let failed = false;
    // Copy-free walk: detonation removes from the list through onPipebombRemoved.
    for (let i = this.pipebombs.length - 1; i >= 0; i--) {
      const p = this.pipebombs[i];
      if (!p || p.removed) continue;
      if (!fizzle && !p.isArmed()) {
        failed = true;
        continue;
      }
      if (fizzle) p.fizzle = true;
      p.detonate();
    }
    return failed;
  }

  /** SDK: CTFPipebombLauncher::DeathNotice. */
  onPipebombRemoved(p: TFGrenadePipebomb): void {
    const i = this.pipebombs.indexOf(p);
    if (i >= 0) this.pipebombs.splice(i, 1);
    this.pipebombCount = this.pipebombs.length;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.chargeBeginTime;
    out.aux1 = this.pipebombCount;
    out.aux2 = this.lastDenySoundTime;
    out.aux3 = this.wantsToShoot ? 1 : 0;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.chargeBeginTime = num(rec.aux0);
    this.pipebombCount = num(rec.aux1);
    this.lastDenySoundTime = num(rec.aux2);
    this.wantsToShoot = num(rec.aux3) !== 0;
  }
}

/** TF_WEAPON_PIPEBOMB_LAUNCHER_CHARGE_SOUND. */
export const STICKY_CHARGE_SOUND = 'Weapon_StickyBombLauncher.ChargeUp';
