/**
 * The Loose Cannon (CTFGrenadeLauncher as TF_WEAPON_CANNON, tf_weapon_grenadelauncher.cpp): a
 * mortar — +attack lights the fuse (grenade_launcher_mortar_mode seconds, 1 s; ACT_VM_PULLBACK and
 * Weapon_LooseCannon.Charge), releasing it fires a cannonball (projectiles/cannonball.ts) that keeps
 * what is left of the fuse; held to the end it misfires and the ball bursts at once. Balls that
 * push a player put him on the double-donk list for tf_double_donk_window (0.5 s): its explosion
 * then mini-crits him (ApplyOnDamageModifyRules → IsDoubleDonk).
 *
 * Environment-agnostic.
 */

import { IN_ATTACK } from '../../core/constants';
import { NO_ENTITY, type UserCmd } from '../../core/types';
import type { Entity } from '../entity';
import { removeInvisibility } from './spy-state';
import { hookWeapon } from '../items/attributes';
import type { NetRecord } from '../net-schema';
import { PLAYERANIMEVENT_ATTACK_PRIMARY } from '../player';
import { TF_RELOAD_START, type WeaponSpec } from '../weapon-api';
import { ACT, TF_WEAPON_PRIMARY_MODE } from './constants';
import { GrenadeLauncher } from './launchers';
import { num } from './tf-weapon';

/** tf_double_donk_window. */
export const TF_DOUBLE_DONK_WINDOW = 0.5;
/** TF_WEAPON_CANNON_CHARGE_SOUND. */
const CANNON_CHARGE_SOUND = 'Weapon_LooseCannon.Charge';
/** CTFGrenadeLauncher::m_vecDonkVictims' capacity (pooled; more than enough victims at once). */
const DONK_SLOTS = 8;

/** A Donks_t. */
export class DonkVictim {
  victim = NO_ENTITY;
  expireTime = 0;
}

/** CTFGrenadeLauncher with the mortar (the Loose Cannon). */
export class Cannon extends GrenadeLauncher {
  /** m_flDetonateTime (0 = no fuse lit). */
  detonateTime = 0;
  /** m_vecDonkVictims. */
  readonly donks: DonkVictim[] = Array.from({ length: DONK_SLOTS }, () => new DonkVictim());

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** SDK: CTFGrenadeLauncher::GetMortarDetonateTimeLength. */
  mortarTime(): number {
    return hookWeapon(this, this.owner, 'grenade_launcher_mortar_mode', 0);
  }

  /** SDK: CTFGrenadeLauncher::CanCharge. */
  canCharge(): boolean {
    return this.mortarTime() > 0;
  }

  /** The fuse left (GetChargeBeginTime's inverse), 0…mortar time. */
  fuseLeft(): number {
    const m = this.mortarTime();
    if (this.detonateTime <= 0) return m;
    return Math.min(Math.max(this.detonateTime - this.t, 0), m);
  }

  override pipeClassname(): string {
    return 'tf_projectile_cannonball';
  }

  override pipeExtra(): Record<string, number | string | boolean> {
    return this.detonateTime > 0 ? { fuse: this.fuseLeft() } : {};
  }

  /** SDK: CTFGrenadeLauncher::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    if (this.clip <= 0 && this.clip !== -1) return;
    if (this.nextPrimaryAttack > this.t) return;
    if (!this.canAttack()) {
      this.detonateTime = 0;
      return;
    }
    this.weaponMode = TF_WEAPON_PRIMARY_MODE;
    if (this.canCharge()) {
      if (this.detonateTime === 0) {
        this.detonateTime = this.t + this.mortarTime();
        this.sendWeaponAnim(ACT.VM_PULLBACK);
        o.world.emitSound(CANNON_CHARGE_SOUND, {
          entity: o.id,
          predictedBy: o.isBot ? undefined : o.id,
        });
      }
    } else this.launchGrenade(cmd);
  }

  /** SDK: CTFGrenadeLauncher::LaunchGrenade + PostFire. */
  launchGrenade(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    this.calcIsAttackCritical(cmd);
    this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
    o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
    removeInvisibility(o);
    this.fireProjectile(cmd);
    this.nextPrimaryAttack = this.t + this.fireDelay();
    this.timeWeaponIdle = this.nextPrimaryAttack;
    if (this.stats.reloadsSingly) this.reloadMode = TF_RELOAD_START;
    o.world.emitEffect({
      kind: 'particle',
      system: 'loose_cannon_bang',
      pos: { x: o.origin.x, y: o.origin.y, z: o.origin.z },
      entity: o.id,
      attachment: 'muzzle',
    });
    this.detonateTime = 0;
  }

  /** SDK: CTFGrenadeLauncher::ItemPostFrame — release fires; the fuse running out misfires. */
  override tfItemPostFrame(cmd: UserCmd): void {
    super.tfItemPostFrame(cmd);
    if (this.detonateTime > 0) {
      if (this.detonateTime > this.t) {
        if (this.clip > 0 && !(cmd.buttons & IN_ATTACK)) this.launchGrenade(cmd);
      } else this.launchGrenade(cmd);
    }
  }

  /** SDK: CTFGrenadeLauncher::AddDonkVictim. */
  addDonkVictim(victim: Entity): void {
    const t = this.t;
    let slot: DonkVictim | null = null;
    for (const d of this.donks) {
      if (d.expireTime <= t) {
        slot = d;
        break;
      }
    }
    if (!slot) {
      // Reuse the one closest to expiring.
      slot = this.donks.reduce((a, b) => (a.expireTime <= b.expireTime ? a : b));
    }
    slot.victim = victim.id;
    slot.expireTime = t + TF_DOUBLE_DONK_WINDOW;
  }

  /** SDK: CTFGrenadeLauncher::IsDoubleDonk. */
  isDoubleDonk(victim: Entity): boolean {
    const t = this.t;
    for (const d of this.donks) if (t < d.expireTime && d.victim === victim.id) return true;
    return false;
  }

  override holster(next: Parameters<GrenadeLauncher['holster']>[0]): boolean {
    this.detonateTime = 0;
    return super.holster(next);
  }

  override refill(): void {
    super.refill();
    this.detonateTime = 0;
    for (const d of this.donks) {
      d.victim = NO_ENTITY;
      d.expireTime = 0;
    }
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.detonateTime;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.detonateTime = num(rec.aux0);
  }
}
