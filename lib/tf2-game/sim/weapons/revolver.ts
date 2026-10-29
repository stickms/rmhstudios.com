/**
 * CTFRevolver (tf_weapon_revolver.cpp) with the Ambassador's headshots (set_weapon_mode 1,
 * CanHeadshot): a shot fired at least a second after the last one has hit locations
 * (DMG_USE_HITLOCATIONS) and no spread, the spread coming back over the next half second; it never
 * crits at random, only on a headshot within 1200 units (2D) — crit_dmg_falloff keeps the distance
 * falloff on that crit (items/damage-rules.ts).
 *
 * Environment-agnostic.
 */

import { HITGROUP_HEAD, type TraceResult, type UserCmd } from '../../core/types';
import { remapClamped } from '../../core/vec';
import {
  DMG_CRITICAL,
  DMG_USE_HITLOCATIONS,
  TF_DMG_CUSTOM_HEADSHOT,
  type DamageInfo,
} from '../damage';
import type { Entity } from '../entity';
import { hookInt, hookWeapon } from '../items/attributes';
import type { NetRecord } from '../net-schema';
import type { WeaponSpec } from '../weapon-api';
import { HitscanGun } from './gun';
import { num } from './tf-weapon';

/** CTFRevolver::CanFireCriticalShot: no headshot crits past this (2D). */
export const AMBASSADOR_CRIT_RANGE = 1200;

export class Revolver extends HitscanGun {
  /** m_flLastAccuracyCheck. */
  lastAccuracyCheck = 0;
  /** The current shot had hit locations (fired ≥ 1 s after the last). */
  private accurateShot = false;

  constructor(spec: WeaponSpec) {
    super(spec);
    this.onBulletHit = (victim, tr, info) => this.onHeadshotCheck(victim, tr, info);
  }

  /** CTFRevolver::CanHeadshot (set_weapon_mode 1, the Ambassador). */
  canHeadshot(): boolean {
    return hookInt(hookWeapon(this, this.owner, 'set_weapon_mode', 0)) === 1;
  }

  /** SDK: CTFRevolver::GetWeaponSpread — the first shot after a second is perfectly accurate. */
  override weaponSpread(): number {
    const spread = super.weaponSpread();
    if (!this.canHeadshot()) return spread;
    return remapClamped(this.t - this.lastAccuracyCheck, 1, 0.5, 0, spread);
  }

  /** SDK: CTFRevolver::GetDamageType. */
  override bulletDamageType(): number {
    const t = super.bulletDamageType();
    return this.accurateShot ? t | DMG_USE_HITLOCATIONS : t & ~DMG_USE_HITLOCATIONS;
  }

  /** SDK: CTFRevolver::CanFireCriticalShot( false ): the Ambassador never crits at random. */
  override calcIsAttackCriticalHelper(cmd: UserCmd): boolean {
    if (this.canHeadshot()) return !!this.owner && this.owner.cond.critBoosted;
    return super.calcIsAttackCriticalHelper(cmd);
  }

  /** SDK: CTFRevolver::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    this.accurateShot = this.canHeadshot() && this.t - this.lastAccuracyCheck > 1;
    const before = this.lastFireTime;
    super.primaryAttack(cmd);
    if (this.lastFireTime !== before) this.lastAccuracyCheck = this.t;
  }

  /** CTFPlayer::TraceAttack's headshot rule with CTFRevolver::CanFireCriticalShot( true, target ). */
  private onHeadshotCheck(victim: Entity, tr: TraceResult, info: DamageInfo): void {
    if (!victim.isPlayer() || !(info.damageType & DMG_USE_HITLOCATIONS)) return;
    if (tr.hitGroup !== HITGROUP_HEAD) return;
    const o = this.owner;
    if (!o) return;
    const dx = o.origin.x - victim.origin.x;
    const dy = o.origin.y - victim.origin.y;
    if (!o.cond.critBoosted && dx * dx + dy * dy > AMBASSADOR_CRIT_RANGE * AMBASSADOR_CRIT_RANGE)
      return;
    info.damageType |= DMG_CRITICAL;
    info.critType = 2;
    info.customKill = TF_DMG_CUSTOM_HEADSHOT;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.lastAccuracyCheck;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.lastAccuracyCheck = num(rec.aux0);
  }
}
