/**
 * CWeaponMedigun (stock Medi Gun).
 *
 * Hold +attack: FindAndHealTargets — lock the teammate under the crosshair
 * within the script Range (450) (FindNewTargetForSlot), keep him while he is
 * within 1.2 × that and in line of sight, re-checked once a second
 * (MaintainTargetInSlot). The beam heals through the core's healer list at
 * the script rate (24/s) × 1 → 3 as the patient's time since damage goes
 * 10 → 15 s (CTFPlayerShared::ConditionThink), overhealing to 150 %.
 * ÜberCharge builds frametime / weapon_medigun_charge_rate (40 s), halved
 * while the patient is at ≥ 95 % of his max overheal (outside setup), split
 * among his healers, ×3 in setup. +attack2 at 100 % releases it: medic and
 * patient are invulnerable (TF_COND_INVULNERABLE) while the charge drains
 * over weapon_medigun_chargerelease_rate (8 s), lingering tf_invuln_time
 * (1 s) after it ends or the beam leaves a patient
 * (RecalculateChargeEffects / SetChargeEffect).
 */

import { CONTENTS_HITBOX, IN_ATTACK, IN_ATTACK2, MASK_SHOT, TF_TEAM_BLUE } from '../../core/constants';
import { emptyTrace, NO_ENTITY, type UserCmd } from '../../core/types';
import { angleVectors, remapClamped, set, vec3 } from '../../core/vec';
import { MEDIGUN } from '../../data/weapons';
import { TF_COND } from '../conditions';
import { COLLISION_GROUP_NONE, type Entity } from '../entity';
import type { NetRecord } from '../net-schema';
import type { Player } from '../player';
import type { WeaponSpec } from '../weapon-api';
import { ACT, MEDIGUN_TARGET_CHECK_INTERVAL, PLAYERANIMEVENT_ATTACK_POST, PLAYERANIMEVENT_ATTACK_PRE } from './constants';
import { isStealthed } from './spy-state';
import { num, TFWeapon } from './tf-weapon';
import { hookInt, hookPlayer, hookWeapon } from '../items/attributes';

const mgTrace = emptyTrace();
const mgSrc = vec3();
const mgEnd = vec3();
const mgFwd = vec3();
const mgPoint = vec3();
const mgCenter = vec3();
/** m_DetachedTargets capacity (a medic rarely swaps beams more than this within tf_invuln_time). */
const MAX_DETACHED = 8;

export class Medigun extends TFWeapon {
  /** m_hHealingTarget (also the owner's `healTarget`). */
  healTarget: number = NO_ENTITY;
  lastHealingTarget: number = NO_ENTITY;
  /** m_flChargeLevel 0…1. */
  chargeLevel = 0;
  /** m_bChargeRelease / m_flReleaseStartedAt. */
  chargeRelease = false;
  releaseStartedAt = 0;
  /** m_bHealing / m_bAttacking / m_bHolstered. */
  healing = false;
  holstered = true;
  nextTargetCheckTime = 0;
  /** The ready sound / particle fired for this charge. */
  private readyNotified = false;
  private readonly detachedIds = new Int32Array(MAX_DETACHED).fill(NO_ENTITY);
  private readonly detachedTimes = new Float64Array(MAX_DETACHED);
  private readonly findFn = (): void => {
    this.foundTarget = this.findAndHealTargets();
  };
  private foundTarget = false;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** SDK: GetTargetRange / GetStickRange / GetHealRate. */
  targetRange(): number {
    return this.stats.range || MEDIGUN.range;
  }

  stickRange(): number {
    return this.targetRange() * MEDIGUN.stickRangeMult;
  }

  /** SDK: CWeaponMedigun::GetHealRate — the script rate × the owner's mult_medigun_healrate. */
  healRate(): number {
    return hookPlayer(this.owner, 'mult_medigun_healrate', this.stats.damage || MEDIGUN.baseHealRate);
  }

  /**
   * SDK: CWeaponMedigun::GetOverHealBonus — how far past max health the beam overheals:
   * tf_max_health_boost, with mult_medigun_overheal_amount added as a bonus or scaling the
   * overheal part as a penalty (the Quick-Fix's 0.5 → 125 %).
   */
  overhealMult(): number {
    let bonus = MEDIGUN.overhealMult - 1;
    const mod = hookWeapon(this, this.owner, 'mult_medigun_overheal_amount', 1);
    if (mod >= 1) bonus += mod;
    else if (bonus > 0) bonus = bonus * mod + 1;
    return Math.max(1, bonus);
  }

  /** SDK: CWeaponMedigun::GetChargeType (set_charge_type): 0 ÜberCharge, 1 Kritzkrieg crits. */
  chargeType(): number {
    return hookInt(hookWeapon(this, this.owner, 'set_charge_type', 0));
  }

  /** SDK: CWeaponMedigun::IsReleasingCharge. */
  isReleasingCharge(): boolean {
    return this.chargeRelease && !this.holstered;
  }

  override deploy(): boolean {
    this.holstered = false;
    return super.deploy();
  }

  override holster(next: Parameters<TFWeapon['holster']>[0]): boolean {
    this.removeHealingTarget(true);
    this.holstered = true;
    return super.holster(next);
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    this.removeHealingTarget(true);
    this.chargeRelease = false;
    this.chargeLevel = 0;
    this.readyNotified = false;
    this.holstered = true;
  }

  override refill(): void {
    super.refill();
    if (!this.owner || !this.owner.alive) {
      this.chargeLevel = 0;
      this.chargeRelease = false;
      this.readyNotified = false;
    }
  }

  /** SDK: CWeaponMedigun::ItemPostFrame. */
  override tfItemPostFrame(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    if (!this.canAttack()) {
      this.removeHealingTarget(true);
      this.chargeThink();
      return;
    }
    if (cmd.buttons & IN_ATTACK) this.primaryAttack(cmd);
    else if (this.healing) this.removeHealingTarget();
    if (cmd.buttons & IN_ATTACK2) this.secondaryAttack(cmd);
    this.weaponIdle(cmd);
    this.chargeThink();
  }

  override itemBusyFrame(cmd: UserCmd): void {
    super.itemBusyFrame(cmd);
    this.chargeThink();
  }

  /** SDK: CWeaponMedigun::ItemHolsterFrame → DrainCharge (+ the charge effects). */
  override itemHolsterFrame(cmd: UserCmd): void {
    super.itemHolsterFrame(cmd);
    this.chargeThink();
  }

  /** DrainCharge + RecalculateChargeEffects, once per command. */
  private chargeThink(): void {
    this.drainCharge();
    this.applyChargeEffects();
  }

  /** SDK: CWeaponMedigun::PrimaryAttack (lag-compensated target search). */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.canAttack()) return;
    this.foundTarget = false;
    o.world.lagcomp.withRewind(o, cmd.tickCount, this.findFn);
    if (this.foundTarget) {
      if (!this.healing) {
        this.sendWeaponAnim(ACT.MP_ATTACK_STAND_PREFIRE);
        o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRE);
      }
      this.healing = true;
    } else this.removeHealingTarget();
  }

  /** SDK: CWeaponMedigun::FindAndHealTargets. */
  findAndHealTargets(): boolean {
    const o = this.owner!;
    const w = o.world;
    const prev = this.healTarget;
    const cur = w.entity(prev);
    if (cur && cur.alive) this.maintainTargetInSlot();
    else this.findNewTargetForSlot();
    const target = w.player(this.healTarget);
    if (!target || !target.alive) return false;
    if (target.id !== prev) this.startHealingTarget(target);
    // The beam's heal rate with the out-of-combat ramp (ConditionThink's flScale).
    const scale = remapClamped(w.curtime - target.lastDamageTime, MEDIGUN.healRampStart, MEDIGUN.healRampEnd, 1, MEDIGUN.healRampMaxMult);
    target.addHealer(o.id, this.healRate() * scale, this.overhealMult());
    if (!this.chargeRelease) this.buildCharge(target);
    return true;
  }

  /** The ÜberCharge build in FindAndHealTargets. */
  private buildCharge(patient: Player): void {
    const w = this.owner!.world;
    let amount = w.frametime / MEDIGUN.chargeTime;
    const rules = w.rules;
    let mod = 1;
    const boostMax = Math.floor(patient.maxBuffedHealth() * MEDIGUN.fullHealthThreshold);
    if (patient.health >= boostMax && !rules.inSetup) mod *= MEDIGUN.fullHealthChargeMult;
    const healers = patient.healers.length;
    if (healers > 1) mod /= healers;
    amount *= mod;
    if (rules.inSetup) amount *= MEDIGUN.setupChargeMult;
    // The owner's charge-rate attributes (mult_medigun_overheal_uberchargerate on a full-health
    // patient outside setup, then mult_medigun_uberchargerate).
    const owner = this.owner!;
    if (patient.health >= patient.maxHealth && !rules.inSetup) {
      amount = hookPlayer(owner, 'mult_medigun_overheal_uberchargerate', amount);
    }
    amount = hookPlayer(owner, 'mult_medigun_uberchargerate', amount);
    const next = Math.min(this.chargeLevel + amount, 1);
    if (next >= 1 && this.chargeLevel < 1) this.notifyChargeReady();
    this.chargeLevel = next;
  }

  private notifyChargeReady(): void {
    const o = this.owner!;
    if (this.readyNotified) return;
    this.readyNotified = true;
    o.world.emitSound('WeaponMedigun.Charged', { entity: o.id, to: o.id });
    o.world.emitEffect({ kind: 'particle', system: this.chargedEffectName(), pos: { x: o.origin.x, y: o.origin.y, z: o.origin.z }, entity: o.id, attachment: 'muzzle', value: 1 });
  }

  /** medicgun_invulnstatus_fullcharge_<team> (the charged-gun glow). */
  chargedEffectName(): string {
    return this.owner && this.owner.team === TF_TEAM_BLUE ? 'medicgun_invulnstatus_fullcharge_blue' : 'medicgun_invulnstatus_fullcharge_red';
  }

  /** SDK: CWeaponMedigun::AllowedToHealTarget. */
  allowedToHealTarget(e: Entity | null): boolean {
    const o = this.owner;
    if (!o || !e || !e.isPlayer() || !e.alive) return false;
    const p = e as Player;
    const stealthed = isStealthed(p) && !isStealthed(o);
    const disguised = p.cond.has(TF_COND.DISGUISED);
    return !stealthed && (p.team === o.team || (disguised && p.disguiseTeam === o.team));
  }

  /** SDK: CWeaponMedigun::MaintainTargetInSlot. */
  private maintainTargetInSlot(): void {
    const o = this.owner!;
    const w = o.world;
    const target = w.entity(this.healTarget);
    if (!target) {
      this.removeHealingTarget();
      return;
    }
    o.eyePosition(mgSrc);
    target.nearestPoint(mgSrc, mgPoint);
    const dist = Math.hypot(mgPoint.x - mgSrc.x, mgPoint.y - mgSrc.y, mgPoint.z - mgSrc.z);
    if (dist < this.stickRange()) {
      if (this.nextTargetCheckTime > w.curtime) return;
      this.nextTargetCheckTime = w.curtime + MEDIGUN_TARGET_CHECK_INTERVAL;
      angleVectors(o.eyeAngles, mgFwd);
      const r = this.targetRange();
      set(mgEnd, mgSrc.x + mgFwd.x * r, mgSrc.y + mgFwd.y * r, mgSrc.z + mgFwd.z * r);
      w.traceLine(mgSrc, mgEnd, MASK_SHOT & ~CONTENTS_HITBOX, w.entityFilter(o, COLLISION_GROUP_NONE), mgTrace);
      if (mgTrace.entity === target.id) return;
      // CMedigunFilter: teammates don't block the beam.
      const f = w.entityFilterObject(o, COLLISION_GROUP_NONE);
      f.ignoreTeam = o.team;
      target.worldSpaceCenter(mgCenter);
      w.traceLine(mgSrc, mgCenter, MASK_SHOT & ~CONTENTS_HITBOX, f.fn, mgTrace);
      if (mgTrace.fraction === 1 || mgTrace.entity === target.id) return;
      if (target.isPlayer()) (target as Player).eyePosition(mgCenter);
      const g = w.entityFilterObject(o, COLLISION_GROUP_NONE);
      g.ignoreTeam = o.team;
      w.traceLine(mgSrc, mgCenter, MASK_SHOT & ~CONTENTS_HITBOX, g.fn, mgTrace);
      if (mgTrace.fraction === 1 || mgTrace.entity === target.id) return;
    }
    this.removeHealingTarget();
  }

  /** SDK: CWeaponMedigun::FindNewTargetForSlot. */
  private findNewTargetForSlot(): void {
    const o = this.owner!;
    const w = o.world;
    if (this.healTarget !== NO_ENTITY) this.removeHealingTarget();
    o.eyePosition(mgSrc);
    angleVectors(o.eyeAngles, mgFwd);
    const r = this.targetRange();
    set(mgEnd, mgSrc.x + mgFwd.x * r, mgSrc.y + mgFwd.y * r, mgSrc.z + mgFwd.z * r);
    w.traceLine(mgSrc, mgEnd, MASK_SHOT & ~CONTENTS_HITBOX, w.entityFilter(o, COLLISION_GROUP_NONE), mgTrace);
    if (mgTrace.fraction === 1) return;
    const target = w.entity(mgTrace.entity);
    if (!target || target === w.worldEntity) return;
    if (target.id === this.healTarget || !this.allowedToHealTarget(target)) return;
    this.healTarget = target.id;
    o.healTarget = target.id;
    this.nextTargetCheckTime = w.curtime + MEDIGUN_TARGET_CHECK_INTERVAL;
  }

  /** SDK: CWeaponMedigun::StartHealingTarget → CTFPlayerShared::Heal. */
  private startHealingTarget(target: Player): void {
    const o = this.owner!;
    target.addHealer(o.id, this.healRate(), this.overhealMult());
    o.world.emitEffect({
      kind: 'beam',
      system: this.beamName(),
      pos: { x: o.origin.x, y: o.origin.y, z: o.origin.z },
      entity: o.id,
      attachment: 'muzzle',
      value: target.id,
    });
    o.world.emitSound('WeaponMedigun.HealingWorld', { entity: o.id });
  }

  /** medicgun_beam_<team>[_invun]. */
  beamName(): string {
    const team = this.owner && this.owner.team === TF_TEAM_BLUE ? 'blue' : 'red';
    return this.isReleasingCharge() ? `medicgun_beam_${team}_invun` : `medicgun_beam_${team}`;
  }

  /** SDK: CWeaponMedigun::RemoveHealingTarget. */
  removeHealingTarget(_stopHealingSelf = false): void {
    const o = this.owner;
    if (!o) return;
    const w = o.world;
    if (this.chargeRelease && this.healTarget !== NO_ENTITY) this.noteDetached(this.healTarget, w.curtime);
    const target = w.player(this.healTarget);
    if (target) target.removeHealer(o.id);
    if (this.healTarget !== NO_ENTITY) {
      w.emitEffect({ kind: 'beam', system: this.beamName(), pos: { x: o.origin.x, y: o.origin.y, z: o.origin.z }, entity: o.id, value: 0 });
      if (w.isServer) w.events.push({ type: 'sound', name: 'WeaponMedigun.HealingWorld', entity: o.id, channel: 0, stop: true });
    }
    this.lastHealingTarget = this.healTarget;
    this.healTarget = NO_ENTITY;
    o.healTarget = NO_ENTITY;
    if (this.healing) {
      this.sendWeaponAnim(ACT.MP_ATTACK_STAND_POSTFIRE);
      o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_POST);
    }
    this.healing = false;
  }

  private noteDetached(id: number, t: number): void {
    let slot = -1;
    for (let i = 0; i < MAX_DETACHED; i++) {
      if (this.detachedIds[i] === id) {
        slot = i;
        break;
      }
      if (slot < 0 && this.detachedIds[i] === NO_ENTITY) slot = i;
    }
    if (slot < 0) slot = 0;
    this.detachedIds[slot] = id;
    this.detachedTimes[slot] = t;
  }

  /** SDK: CWeaponMedigun::SecondaryAttack — release a full charge. */
  override secondaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.canAttack()) return;
    if (this.chargeLevel < 1 || this.chargeRelease) return;
    this.chargeRelease = true;
    this.releaseStartedAt = this.t;
    o.world.emitSound(this.chargeType() === 1 ? 'TFPlayer.CritBoostOn' : 'TFPlayer.InvulnerableOn', { entity: o.id });
    this.applyChargeEffects();
    if (this.healTarget !== NO_ENTITY) {
      o.world.emitEffect({ kind: 'beam', system: this.beamName(), pos: { x: o.origin.x, y: o.origin.y, z: o.origin.z }, entity: o.id, value: this.healTarget });
    }
  }

  /** SDK: CWeaponMedigun::DrainCharge (+ SubtractChargeAndUpdateDeployState). */
  drainCharge(): void {
    const o = this.owner;
    if (!o || !this.chargeRelease) return;
    const t = o.world.curtime;
    let amount = o.world.frametime / MEDIGUN.releaseTime;
    const extra = amount * 0.5;
    for (let i = 0; i < MAX_DETACHED; i++) {
      const id = this.detachedIds[i];
      if (id === NO_ENTITY) continue;
      const p = o.world.player(id);
      if (!p || !p.alive || id === this.healTarget || this.detachedTimes[i] < t - MEDIGUN.invulnLinger) {
        this.detachedIds[i] = NO_ENTITY;
        continue;
      }
      amount += extra;
    }
    this.chargeLevel = Math.max(this.chargeLevel - amount, 0);
    if (this.chargeLevel <= 0) {
      this.chargeRelease = false;
      this.releaseStartedAt = 0;
      this.readyNotified = false;
      this.detachedIds.fill(NO_ENTITY);
      o.world.emitSound(this.chargeType() === 1 ? 'TFPlayer.CritBoostOff' : 'TFPlayer.InvulnerableOff', { entity: o.id });
      o.world.emitEffect({ kind: 'particle', system: this.chargedEffectName(), pos: { x: o.origin.x, y: o.origin.y, z: o.origin.z }, entity: o.id, value: 0 });
    }
  }

  /**
   * RecalculateChargeEffects: invulnerable medic and patient, lingering tf_invuln_time — or, for a
   * Kritzkrieg (MEDIGUN_CHARGE_CRITICALBOOST), crit-boosted.
   */
  applyChargeEffects(): void {
    const o = this.owner;
    if (!o || !o.alive || !this.isReleasingCharge()) return;
    const cond = this.chargeType() === 1 ? TF_COND.CRITBOOSTED : TF_COND.INVULNERABLE;
    o.cond.add(cond, MEDIGUN.invulnLinger, o.id);
    const patient = o.world.player(this.healTarget);
    if (patient && patient.alive) patient.cond.add(cond, MEDIGUN.invulnLinger, o.id);
  }

  /** SDK: CWeaponMedigun::WeaponIdle. */
  override weaponIdle(cmd: UserCmd): void {
    if (this.timeWeaponIdle > this.t) return;
    if (this.healing) {
      this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
      return;
    }
    super.weaponIdle(cmd);
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.chargeLevel;
    out.aux1 = (this.chargeRelease ? 1 : 0) | (this.healing ? 2 : 0) | (this.holstered ? 4 : 0) | (this.readyNotified ? 8 : 0);
    out.aux2 = this.healTarget;
    out.aux3 = this.nextTargetCheckTime;
    out.aux4 = this.releaseStartedAt;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.chargeLevel = num(rec.aux0);
    const f = num(rec.aux1);
    this.chargeRelease = (f & 1) !== 0;
    this.healing = (f & 2) !== 0;
    this.holstered = (f & 4) !== 0;
    this.readyNotified = (f & 8) !== 0;
    this.healTarget = num(rec.aux2);
    this.nextTargetCheckTime = num(rec.aux3);
    this.releaseStartedAt = num(rec.aux4);
  }
}

