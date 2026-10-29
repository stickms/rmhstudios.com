/**
 * CTFSniperRifle: +attack2 zooms (TF_COND_ZOOMED + TF_COND_AIMING, 0.3 s
 * lockout; refused mid-jump), the charge builds 50/s once the lockout ends
 * and drains 75/s unzoomed (capped at 150); a shot does max(charge, 50)
 * with no distance modifier; zoomed shots keep DMG_USE_HITLOCATIONS so a
 * head hit ≥ 0.2 s after zooming is a crit with TF_DMG_CUSTOM_HEADSHOT
 * (CTFPlayer::TraceAttack + CTFSniperRifle::CanFireCriticalShot). After a
 * zoomed shot the scope drops 0.5 s later and comes back 0.9 s after that
 * (cl_autorezoom). No random crits. The laser dot (CSniperDot) is its own
 * networked entity everyone sees.
 */

import { CONTENTS_WINDOW, IN_ATTACK, IN_ATTACK2, MASK_SHOT } from '../../core/constants';
import { emptyTrace, HITGROUP_HEAD, type TraceResult, type UserCmd } from '../../core/types';
import { angleVectors, set, vec3, vectorAngles } from '../../core/vec';
import { SNIPER_RIFLE } from '../../data/weapons';
import { TF_COND } from '../conditions';
import { DMG_CRITICAL, DMG_USE_HITLOCATIONS, TF_DMG_CUSTOM_HEADSHOT, type DamageInfo } from '../damage';
import { COLLISION_GROUP_NONE, Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { NET_ENTITY, registerNetSchema, type NetRecord, type NetSchema } from '../net-schema';
import type { WeaponSpec } from '../weapon-api';
import {
  SNIPER_NO_REZOOM_SECONDARY,
  SNIPER_REZOOM_DELAY,
  SNIPER_UNZOOM_DELAY,
  TOGGLE_ZOOM_SECONDARY,
} from './constants';
import { TFWeaponGun } from './gun';
import { num } from './tf-weapon';
import { hookWeapon } from '../items/attributes';

/** cl_autorezoom (1). */
const AUTO_REZOOM = true;
/** MAX_TRACE_LENGTH (56756 = 1.732 × 32768). */
const MAX_TRACE_LENGTH = 1.732050807569 * 32768;

/** env_sniperdot: the Sniper's laser dot (CSniperDot) — position, owner, team, charge start. */
export const NET_SNIPERDOT: NetSchema = registerNetSchema(64, 'sniperdot', [
  ...NET_ENTITY.fields,
  { name: 'chargeStartTime', kind: 'f32' },
]);

export class SniperDot extends Entity {
  /** CSniperDot::m_flChargeStartTime (the dot brightens with the charge). */
  chargeStartTime = 0;

  constructor(classname: string) {
    super(classname);
  }

  override netSchema(): NetSchema | null {
    return NET_SNIPERDOT;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.chargeStartTime = this.chargeStartTime;
  }
}
registerEntityClass('env_sniperdot', SniperDot);

const dotTrace = emptyTrace();
const dotStart = vec3();
const dotEnd = vec3();
const dotFwd = vec3();

export class SniperRifle extends TFWeaponGun {
  /** m_flChargedDamage (0…150). */
  chargedDamage = 0;
  /** m_flUnzoomTime / m_flRezoomTime (−1 = none) / m_bRezoomAfterShot. */
  unzoomTime = -1;
  rezoomTime = -1;
  rezoomAfterShot = false;
  /** When the scope came up (CBasePlayer::GetFOVTime). */
  zoomedAt = 0;
  /** The dot entity (server only), NO entity = 0. */
  private dot: SniperDot | null = null;

  constructor(spec: WeaponSpec) {
    super(spec);
    this.onBulletHit = (victim, tr, info) => this.onHeadshotCheck(victim, tr, info);
  }

  isZoomed(): boolean {
    return !!this.owner && this.owner.cond.has(TF_COND.ZOOMED);
  }

  isFullyCharged(): boolean {
    return this.chargedDamage >= SNIPER_RIFLE.maxDamage;
  }

  /** SDK: CTFSniperRifle::GetProjectileDamage. */
  override projectileDamage(): number {
    return Math.max(this.chargedDamage, SNIPER_RIFLE.minDamage);
  }

  /** SDK: CTFSniperRifle::GetDamageType — hit locations only while zoomed. */
  override bulletDamageType(): number {
    let t = this.stats.damageType;
    if (!this.isZoomed()) t &= ~DMG_USE_HITLOCATIONS;
    return t | (this.currentAttackIsCrit ? DMG_CRITICAL : 0);
  }

  /** SDK: CTFSniperRifle::CanFireCriticalShot — only zoomed headshots (or crit boosts). */
  override canFireCriticalShot(headshot = false): boolean {
    const o = this.owner;
    if (!o) return false;
    if (o.cond.critBoosted) return true;
    if (!headshot) return false;
    if (!this.isZoomed()) return false;
    if (this.t - this.zoomedAt < SNIPER_RIFLE.noCritAfterZoom) return false;
    return true;
  }

  /** Random crits never happen: CanFireCriticalShot(false) refuses unless crit-boosted. */
  override calcIsAttackCriticalHelper(_cmd: UserCmd): boolean {
    return !!this.owner && this.owner.cond.critBoosted;
  }

  /** SDK: CTFPlayer::TraceAttack's headshot rule, through FireBulletsParams.onHit. */
  private onHeadshotCheck(victim: Entity, tr: TraceResult, info: DamageInfo): void {
    if (!victim.isPlayer()) return;
    if (!(info.damageType & DMG_USE_HITLOCATIONS)) return;
    if (tr.hitGroup !== HITGROUP_HEAD) return;
    if (!this.canFireCriticalShot(true)) return;
    info.damageType |= DMG_CRITICAL;
    info.critType = 2;
    info.customKill = TF_DMG_CUSTOM_HEADSHOT;
  }

  /** The rifle has no reload (bolt time is the fire delay). */
  override reload(): boolean {
    return true;
  }

  /** SDK: CTFSniperRifle::CanHolster — not while scoped and rechambering. */
  override canHolster(): boolean {
    if (this.isZoomed() && this.nextPrimaryAttack > this.t) return false;
    return super.canHolster();
  }

  override holster(next: Parameters<TFWeaponGun['holster']>[0]): boolean {
    this.destroyDot();
    if (this.isZoomed()) this.zoomOut();
    this.chargedDamage = 0;
    this.resetTimers();
    return super.holster(next);
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    this.destroyDot();
    this.chargedDamage = 0;
    this.resetTimers();
  }

  override refill(): void {
    super.refill();
    if (this.owner && this.isZoomed()) this.zoomOut();
    this.chargedDamage = 0;
    this.resetTimers();
  }

  resetTimers(): void {
    this.unzoomTime = -1;
    this.rezoomTime = -1;
    this.rezoomAfterShot = false;
  }

  /** SDK: CTFSniperRifle::ItemPostFrame. */
  override tfItemPostFrame(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    const t = this.t;
    const buttons = cmd.buttons;
    if (this.inAttack && !(buttons & IN_ATTACK)) this.inAttack = false;
    if (!this.canAttack()) {
      if (this.isZoomed()) this.toggleZoom();
      return;
    }
    this.handleZooms(cmd);
    if (this.dot) this.updateDot();
    if (o.move.jumping) {
      if (this.isZoomed()) this.toggleZoom();
      this.chargedDamage = 0;
      this.rezoomAfterShot = false;
      this.rezoomTime = -1;
    } else if (this.nextSecondaryAttack <= t) {
      const dt = o.world.frametime;
      if (o.cond.has(TF_COND.AIMING) && !this.rezoomAfterShot) {
        // CTFSniperRifle::ApplyChargeSpeedModifications: × mult_sniper_charge_per_sec (the Sydney Sleeper).
        const base = hookWeapon(this, o, 'mult_sniper_charge_per_sec', SNIPER_RIFLE.chargePerSecond);
        const rate = Math.min(Math.max(base, 0), 2 * SNIPER_RIFLE.chargePerSecond);
        this.chargedDamage = Math.min(this.chargedDamage + dt * rate, SNIPER_RIFLE.maxDamage);
      } else this.chargedDamage = Math.max(0, this.chargedDamage - dt * SNIPER_RIFLE.unchargePerSecond);
    }
    if (buttons & IN_ATTACK) this.fire(cmd);
    if (!(buttons & (IN_ATTACK | IN_ATTACK2)) && !this.inReload) this.weaponIdle(cmd);
  }

  /** SDK: CTFSniperRifle::HandleZooms. */
  handleZooms(cmd: UserCmd): void {
    const o = this.owner!;
    const t = this.t;
    if (o.cond.has(TF_COND.TAUNTING)) {
      if (o.cond.has(TF_COND.AIMING)) this.toggleZoom();
      this.resetTimers();
    }
    if (this.unzoomTime > 0 && t > this.unzoomTime) {
      if (this.rezoomAfterShot) {
        this.zoomOutIn();
        this.rezoomAfterShot = false;
      } else this.zoomOut();
      this.unzoomTime = -1;
    }
    if (this.rezoomTime > 0 && t > this.rezoomTime) {
      this.zoomIn();
      this.rezoomTime = -1;
    }
    if (cmd.buttons & IN_ATTACK2 && this.nextSecondaryAttack <= t) {
      if (this.rezoomTime > 0 || this.unzoomTime > 0) {
        this.nextSecondaryAttack = this.rezoomTime + SNIPER_RIFLE.zoomTime;
        this.rezoomTime = -1;
      } else this.zoom();
    }
  }

  /** SDK: CTFSniperRifle::Zoom. */
  zoom(): void {
    const o = this.owner!;
    if (o.move.jumping && !this.isZoomed()) return;
    this.toggleZoom();
    this.nextPrimaryAttack = Math.max(this.nextPrimaryAttack, this.t + SNIPER_RIFLE.zoomFireDelay);
    this.nextSecondaryAttack = this.t + SNIPER_RIFLE.zoomTime;
  }

  /** SDK: CTFWeaponBaseGun::ToggleZoom. */
  toggleZoom(): void {
    if (this.isZoomed()) this.zoomOut();
    else this.zoomIn();
    this.nextSecondaryAttack = this.t + TOGGLE_ZOOM_SECONDARY;
  }

  /** SDK: CTFSniperRifle::ZoomIn (+ CTFWeaponBaseGun::ZoomIn: TF_WEAPON_ZOOM_FOV). */
  zoomIn(): void {
    const o = this.owner;
    if (!o || this.reserve() <= 0) return;
    o.cond.add(TF_COND.ZOOMED);
    o.cond.add(TF_COND.AIMING);
    this.zoomedAt = this.t;
    this.createDot();
  }

  /** SDK: CTFSniperRifle::ZoomOut. */
  zoomOut(): void {
    const o = this.owner;
    if (!o) return;
    o.cond.remove(TF_COND.ZOOMED);
    o.cond.remove(TF_COND.AIMING);
    this.destroyDot();
    this.unzoomTime = -1;
    this.rezoomTime = -1;
    this.rezoomAfterShot = false;
    this.chargedDamage = 0;
  }

  /** SDK: CTFSniperRifle::ZoomOutIn (cl_autorezoom on). */
  zoomOutIn(): void {
    this.zoomOut();
    const o = this.owner;
    if (!o) return;
    if (AUTO_REZOOM) this.rezoomTime = this.t + SNIPER_REZOOM_DELAY;
    else this.nextSecondaryAttack = this.t + SNIPER_NO_REZOOM_SECONDARY;
  }

  /** SDK: CTFSniperRifle::Fire. */
  fire(cmd: UserCmd): void {
    const t = this.t;
    if (this.reserve() <= 0) {
      this.handleFireOnEmpty();
      return;
    }
    if (this.nextPrimaryAttack > t) return;
    this.primaryAttack(cmd);
    this.inAttack = true;
    if (this.isZoomed()) {
      this.unzoomTime = t + SNIPER_UNZOOM_DELAY;
      this.rezoomAfterShot = this.reserve() > 0;
    } else this.nextSecondaryAttack = t + this.stats.fireDelay;
    this.chargedDamage = 0;
    if (this.dot) this.dot.chargeStartTime = t;
  }

  // ─── Laser dot ───────────────────────────────────────────────────────────

  private createDot(): void {
    const o = this.owner;
    if (!o || this.dot || !o.world.isServer) return;
    const d = o.world.spawnEntity('env_sniperdot', (e) => {
      e.owner = o.id;
      e.team = o.team;
      e.model = 'sniperdot';
    }) as SniperDot;
    d.chargeStartTime = this.t;
    this.dot = d;
    this.updateDot();
  }

  private destroyDot(): void {
    if (!this.dot) return;
    if (!this.dot.removed) this.dot.world.remove(this.dot);
    this.dot = null;
  }

  /** SDK: CTFSniperRifle::UpdateSniperDot — where the crosshair meets the world or a body. */
  private updateDot(): void {
    const o = this.owner;
    const d = this.dot;
    if (!o || !d) return;
    angleVectors(o.eyeAngles, dotFwd);
    o.eyePosition(dotStart);
    set(dotEnd, dotStart.x + dotFwd.x * MAX_TRACE_LENGTH, dotStart.y + dotFwd.y * MAX_TRACE_LENGTH, dotStart.z + dotFwd.z * MAX_TRACE_LENGTH);
    o.world.traceLine(dotStart, dotEnd, MASK_SHOT & ~CONTENTS_WINDOW, o.world.entityFilter(o, COLLISION_GROUP_NONE), dotTrace);
    d.origin.x = dotTrace.endPos.x;
    d.origin.y = dotTrace.endPos.y;
    d.origin.z = dotTrace.endPos.z;
    vectorAngles(dotTrace.plane.normal, d.angles);
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.chargedDamage;
    out.aux1 = this.unzoomTime;
    out.aux2 = this.rezoomTime;
    out.aux3 = this.rezoomAfterShot ? 1 : 0;
    out.aux4 = this.zoomedAt;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.chargedDamage = num(rec.aux0);
    this.unzoomTime = num(rec.aux1);
    this.rezoomTime = num(rec.aux2);
    this.rezoomAfterShot = num(rec.aux3) !== 0;
    this.zoomedAt = num(rec.aux4);
  }
}

/** A full-charge zoomed headshot's damage before the crit multiplier (for tests and the HUD). */
export const sniperDamage = (charge: number): number => Math.max(charge, SNIPER_RIFLE.minDamage);
