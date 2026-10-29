/**
 * CTFWeaponBaseMelee and the stock melee weapons: swing → smack after the
 * script's SmackDelay → a lag-compensated line trace (48 units) falling back
 * to an 18³ hull → OnSwingHit (flesh / world sounds) → DoMeleeDamage
 * (DMG_MELEE | DMG_NEVERGIB | DMG_CLUB, the script damage, DMG_CRITICAL on a
 * crit). Random crits: 15 % × the crit multiplier per swing
 * (CTFWeaponBaseMelee::CalcIsAttackCriticalHelper).
 *
 * Bat, Shovel, Fire Axe, Kukri (club), Bonesaw: the base. Bottle
 * (CTFBreakableMelee): breaks on a connected crit. Fists (CTFFists): +attack
 * punches left, +attack2 right. Wrench (CTFWrench): a friendly building is
 * handed to the buildings module (`onWrenchHit`), anything else is a normal
 * swing. Knife (CTFKnife): instant swing; from behind (IsBehindAndFacingTarget)
 * a crit for twice the victim's health (TF_DMG_CUSTOM_BACKSTAB); the
 * backstab-ready view model raises its hand.
 */

import { MASK_SOLID, TF_CLASS_DEMOMAN, TF_CLASS_SPY } from '../../core/constants';
import { emptyTrace, type TraceResult, type UserCmd } from '../../core/types';
import { angleVectors, set, vec3, type Vec3 } from '../../core/vec';
import { KNIFE, MELEE, WRENCH } from '../../data/weapons';
import {
  createDamageInfo,
  DMG_CLUB,
  DMG_CRITICAL,
  DMG_MELEE,
  DMG_NEVERGIB,
  resetDamageInfo,
  TF_DMG_CUSTOM_BACKSTAB,
} from '../damage';
import { COLLISION_GROUP_NONE, DAMAGE_NO, type Entity } from '../entity';
import { TF_COND } from '../conditions';
import { PLAYERANIMEVENT_ATTACK_PRIMARY, PLAYERANIMEVENT_ATTACK_SECONDARY, type Player } from '../player';
import type { NetRecord } from '../net-schema';
import type { WeaponSpec } from '../weapon-api';
import { ACT, DEFAULT_SECONDARY_DELAY, DEMOMAN_SECONDARY_DELAY, TF_WEAPON_PRIMARY_MODE, TF_WEAPON_SECONDARY_MODE, WRENCH_BUILDING_RANGE } from './constants';
import { removeDisguise, removeInvisibility, spyState } from './spy-state';
import { num, TFWeapon } from './tf-weapon';

const SWING_MINS: Vec3 = { x: -MELEE.hullHalfExtent, y: -MELEE.hullHalfExtent, z: -MELEE.hullHalfExtent };
const SWING_MAXS: Vec3 = { x: MELEE.hullHalfExtent, y: MELEE.hullHalfExtent, z: MELEE.hullHalfExtent };
/** CalculateMeleeDamageForce: ImpulseScale(75 kg, 4 in/s) per point of damage, × tf_meleeattackforcescale / damage. */
const MELEE_IMPULSE_PER_DAMAGE = 75 * 4;
const MELEE_DAMAGE_TYPE = DMG_MELEE | DMG_NEVERGIB | DMG_CLUB;

const swingTrace = emptyTrace();
const swingStart = vec3();
const swingEnd = vec3();
const swingFwd = vec3();
const meleeInfo = createDamageInfo();

export class TFWeaponMelee extends TFWeapon {
  /** m_flSmackTime (−1 = no swing pending). */
  smackTime = -1;
  /** m_bConnected: the last smack hit an enemy. */
  connected = false;
  private readonly smackFn = (): void => this.smackNow();

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** SDK: CTFWeaponBaseMelee::GetSwingRange (shield charge 128; swords — is_a_sword — 72). */
  swingRange(): number {
    const o = this.owner;
    if (o && o.cond.has(TF_COND.SHIELD_CHARGE)) return MELEE.chargeRange;
    return this.attributes.apply('is_a_sword', 0) !== 0 ? MELEE.swordRange : MELEE.range;
  }

  override calcIsAttackCriticalHelper(cmd: UserCmd): boolean {
    return this.calcMeleeCrit(cmd);
  }

  /** SDK: CTFWeaponBaseMelee::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.canAttack()) return;
    this.weaponMode = TF_WEAPON_PRIMARY_MODE;
    this.connected = false;
    this.swing(cmd);
    removeInvisibility(o);
  }

  /** SDK: CTFWeaponBaseMelee::SecondaryAttack — the class skill (Demomen cycle fast). */
  override secondaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.canAttack()) return;
    this.doClassSpecialSkill();
    this.inAttack2 = true;
    this.nextSecondaryAttack = this.t + (o.playerClass === TF_CLASS_DEMOMAN ? DEMOMAN_SECONDARY_DELAY : DEFAULT_SECONDARY_DELAY);
  }

  /** SDK: CTFWeaponBaseMelee::Swing. */
  swing(cmd: UserCmd): void {
    const o = this.owner!;
    const t = this.t;
    this.calcIsAttackCritical(cmd);
    this.sendPlayerAnimEvent(o);
    this.doViewModelAnimation();
    const delay = this.stats.fireDelay;
    this.nextPrimaryAttack = t + delay;
    this.nextSecondaryAttack = t + delay;
    if (o.playerClass === TF_CLASS_SPY) spyState(o).stealthNextChangeTime = this.nextSecondaryAttack;
    this.timeWeaponIdle = this.nextPrimaryAttack + this.script.primary.timeIdleEmpty;
    this.weaponSound(this.currentAttackIsCrit ? 'burst' : 'melee_miss');
    this.smackTime = t + (this.script.primary.smackDelay || MELEE.defaultSmackDelay);
    this.lastFireTime = t;
  }

  /** SDK: CTFWeaponBaseMelee::DoViewModelAnimation. */
  doViewModelAnimation(): void {
    if (this.currentAttackIsCrit) {
      this.sendWeaponAnim(ACT.VM_SWINGHARD);
      return;
    }
    this.sendWeaponAnim(this.weaponMode === TF_WEAPON_PRIMARY_MODE ? ACT.VM_HITCENTER : ACT.VM_SWINGHARD);
  }

  /** SDK: CTFWeaponBaseMelee::SendPlayerAnimEvent. */
  sendPlayerAnimEvent(o: Player): void {
    o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
  }

  /** SDK: CTFWeaponBaseMelee::ItemPostFrame — the pending smack first. */
  override tfItemPostFrame(cmd: UserCmd): void {
    if (this.smackTime > 0 && this.t > this.smackTime) {
      this.smackTime = -1;
      this.smack(cmd);
    }
    super.tfItemPostFrame(cmd);
  }

  override holster(next: Parameters<TFWeapon['holster']>[0]): boolean {
    this.smackTime = -1;
    return super.holster(next);
  }

  /** SDK: CTFWeaponBaseMelee::Smack — lag-compensated swing trace and hit. */
  smack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    o.world.lagcomp.withRewind(o, cmd.tickCount, this.smackFn);
  }

  protected smackNow(): void {
    if (this.doSwingTrace(swingTrace)) this.onSwingHit(swingTrace);
  }

  /** SDK: CTFWeaponBaseMelee::DoSwingTraceInternal (non-cleave): a line, then the ±18 hull. */
  doSwingTrace(out: TraceResult, range = this.swingRange()): boolean {
    const o = this.owner!;
    const w = o.world;
    angleVectors(o.eyeAngles, swingFwd);
    o.eyePosition(swingStart);
    set(swingEnd, swingStart.x + swingFwd.x * range, swingStart.y + swingFwd.y * range, swingStart.z + swingFwd.z * range);
    const f = w.entityFilter(o, COLLISION_GROUP_NONE);
    w.traceLine(swingStart, swingEnd, MASK_SOLID, f, out);
    if (out.fraction >= 1) w.traceHull(swingStart, swingEnd, SWING_MINS, SWING_MAXS, MASK_SOLID, w.entityFilter(o, COLLISION_GROUP_NONE), out);
    return out.fraction < 1;
  }

  /** SDK: CTFWeaponBaseMelee::OnSwingHit. */
  onSwingHit(tr: TraceResult): boolean {
    const o = this.owner!;
    const w = o.world;
    const ent = w.entity(tr.entity) ?? w.worldEntity;
    let hitEnemy = false;
    if (ent.isPlayer()) {
      this.weaponSound('melee_hit');
      if (ent.team !== o.team) hitEnemy = true;
    } else this.weaponSound('melee_hit_world');
    this.doMeleeDamage(ent, tr);
    return hitEnemy;
  }

  /** SDK: CTFWeaponBaseMelee::GetMeleeDamage (the script damage; knives override). */
  meleeDamage(_target: Entity, _custom: { value: number }): number {
    return this.stats.damage;
  }

  /** SDK: CTFWeaponBaseMelee::DoMeleeDamage. */
  doMeleeDamage(ent: Entity, tr: TraceResult): void {
    const o = this.owner!;
    const w = o.world;
    if (ent !== w.worldEntity && ent.takeDamage !== DAMAGE_NO) {
      const custom = customKillBox;
      custom.value = 0;
      const damage = this.meleeDamage(ent, custom);
      const info = resetDamageInfo(meleeInfo);
      info.attacker = o.id;
      info.inflictor = o.id;
      info.weaponId = this.weaponId;
      info.weaponDefIndex = this.defindex;
      info.killIcon = this.killIcon;
      info.damage = damage;
      info.damageType = MELEE_DAMAGE_TYPE | (this.currentAttackIsCrit ? DMG_CRITICAL : 0);
      info.critType = this.currentAttackIsCrit ? 2 : 0;
      info.customKill = custom.value;
      info.hitGroup = tr.hitGroup;
      info.position.x = tr.endPos.x;
      info.position.y = tr.endPos.y;
      info.position.z = tr.endPos.z;
      const f = MELEE_IMPULSE_PER_DAMAGE * MELEE.forceScale;
      set(info.force, swingFwd.x * f, swingFwd.y * f, swingFwd.z * f);
      w.applyDamage(ent, info);
      this.onEntityHit(ent);
    }
    if (ent.team !== o.team) {
      this.connected = true;
      w.emitEffect({
        kind: ent.isPlayer() ? 'blood' : 'impact',
        pos: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z },
        normal: { x: tr.plane.normal.x, y: tr.plane.normal.y, z: tr.plane.normal.z },
        entity: ent.isPlayer() ? ent.id : undefined,
        material: tr.surfaceName,
        notTo: o.isBot ? undefined : o.id,
      });
    }
  }

  /** SDK: CTFWeaponBaseMelee::OnEntityHit. */
  onEntityHit(_ent: Entity): void {}

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.smackTime;
    out.aux1 = (this.currentAttackIsCrit ? 1 : 0) | (this.connected ? 2 : 0) | (this.weaponMode ? 4 : 0);
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.smackTime = num(rec.aux0);
    const f = num(rec.aux1);
    this.currentAttackIsCrit = (f & 1) !== 0;
    this.connected = (f & 2) !== 0;
    this.weaponMode = f & 4 ? TF_WEAPON_SECONDARY_MODE : TF_WEAPON_PRIMARY_MODE;
  }
}

const customKillBox = { value: 0 };

/** Bat, Shovel, Fire Axe, Kukri, Bonesaw. */
export class MeleeWeapon extends TFWeaponMelee {}

/** CTFBottle (CTFBreakableMelee): a connected crit breaks it (body group, until respawn). */
export class Bottle extends TFWeaponMelee {
  broken = false;

  override smack(cmd: UserCmd): void {
    super.smack(cmd);
    if (this.connected && this.currentAttackIsCrit) this.broken = true;
  }

  /** WeaponReset: mended on respawn (not on resupply while alive). */
  override refill(): void {
    super.refill();
    if (!this.owner || !this.owner.alive) this.broken = false;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    super.writeWeaponNet(out);
    out.aux2 = this.broken ? 1 : 0;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    super.readWeaponNet(rec);
    this.broken = num(rec.aux2) !== 0;
  }
}

/** CTFFists: +attack punches with the left, +attack2 with the right. */
export class Fists extends TFWeaponMelee {
  override primaryAttack(cmd: UserCmd): void {
    if (!this.canAttack()) return;
    this.weaponMode = TF_WEAPON_PRIMARY_MODE;
    this.punch(cmd);
  }

  override secondaryAttack(cmd: UserCmd): void {
    if (!this.canAttack()) return;
    this.weaponMode = TF_WEAPON_SECONDARY_MODE;
    this.punch(cmd);
  }

  /** SDK: CTFFists::Punch. */
  punch(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    this.connected = false;
    this.swing(cmd);
    this.nextSecondaryAttack = this.nextPrimaryAttack;
    removeInvisibility(o);
  }

  /** SDK: CTFFists::SendPlayerAnimEvent — a crit is the big two-handed swing. */
  override sendPlayerAnimEvent(o: Player): void {
    o.doAnimationEvent(this.currentAttackIsCrit ? PLAYERANIMEVENT_ATTACK_SECONDARY : PLAYERANIMEVENT_ATTACK_PRIMARY);
  }

  /** SDK: CTFFists::DoViewModelAnimation — left / right / both. */
  override doViewModelAnimation(): void {
    if (this.currentAttackIsCrit) this.sendWeaponAnim(ACT.VM_SWINGHARD);
    else this.sendWeaponAnim(this.weaponMode === TF_WEAPON_PRIMARY_MODE ? ACT.VM_HITLEFT : ACT.VM_HITRIGHT);
  }
}

/** What the buildings module's objects expose to the wrench (BaseObject.onWrenchHit). */
interface WrenchableObject {
  onWrenchHit?: (player: Player, wrench: Wrench) => boolean | void;
}

/** CTFWrench. */
export class Wrench extends TFWeaponMelee {
  /** WRENCH data for the buildings module (repair / upgrade per hit). */
  readonly repairPerHit = WRENCH.repairPerHit;
  readonly upgradeMetalPerHit = WRENCH.upgradeMetalPerHit;

  /** SDK: CTFWrench::Smack — friendly buildings first (70 units, players ignored), then a normal swing. */
  protected override smackNow(): void {
    const o = this.owner!;
    const w = o.world;
    angleVectors(o.eyeAngles, swingFwd);
    o.eyePosition(swingStart);
    set(
      swingEnd,
      swingStart.x + swingFwd.x * WRENCH_BUILDING_RANGE,
      swingStart.y + swingFwd.y * WRENCH_BUILDING_RANGE,
      swingStart.z + swingFwd.z * WRENCH_BUILDING_RANGE,
    );
    const f = w.entityFilterObject(null, COLLISION_GROUP_NONE);
    f.ignorePlayers = true;
    w.traceLine(swingStart, swingEnd, MASK_SOLID, f.fn, swingTrace);
    if (swingTrace.fraction >= 1) {
      const g = w.entityFilterObject(null, COLLISION_GROUP_NONE);
      g.ignorePlayers = true;
      w.traceHull(swingStart, swingEnd, SWING_MINS, SWING_MAXS, MASK_SOLID, g.fn, swingTrace);
    }
    const ent = swingTrace.fraction < 1 ? w.entity(swingTrace.entity) : null;
    if (ent && ent.isBaseObject() && ent.team === o.team) {
      this.onFriendlyBuildingHit(ent, o);
      return;
    }
    super.smackNow();
  }

  /** SDK: CTFWrench::OnFriendlyBuildingHit — the building decides; success / failure clang. */
  onFriendlyBuildingHit(obj: Entity, o: Player): void {
    const useful = (obj as Entity & WrenchableObject).onWrenchHit?.(o, this);
    this.weaponSound(useful === false ? 'special2' : 'special1');
    this.connected = true;
  }
}

const backstabTrace = emptyTrace();
const kToTarget = vec3();
const kOwnerFwd = vec3();
const kTargetFwd = vec3();
const kOwnerCenter = vec3();
const kTargetCenter = vec3();

/**
 * SDK: CTFKnife::IsBehindAndFacingTarget — in 2D: behind the target
 * (dot(toTarget, targetFwd) > 0), facing it (dot(toTarget, ownerFwd) > 0.5)
 * and not face-to-face (dot(targetFwd, ownerFwd) > −0.3).
 */
export function isBehindAndFacingTarget(owner: Player, target: Player): boolean {
  owner.worldSpaceCenter(kOwnerCenter);
  target.worldSpaceCenter(kTargetCenter);
  set(kToTarget, kTargetCenter.x - kOwnerCenter.x, kTargetCenter.y - kOwnerCenter.y, 0);
  norm2(kToTarget);
  angleVectors(owner.eyeAngles, kOwnerFwd);
  kOwnerFwd.z = 0;
  norm2(kOwnerFwd);
  angleVectors(target.eyeAngles, kTargetFwd);
  kTargetFwd.z = 0;
  norm2(kTargetFwd);
  const posVsTargetView = kToTarget.x * kTargetFwd.x + kToTarget.y * kTargetFwd.y;
  const posVsOwnerView = kToTarget.x * kOwnerFwd.x + kToTarget.y * kOwnerFwd.y;
  const viewAngles = kTargetFwd.x * kOwnerFwd.x + kTargetFwd.y * kOwnerFwd.y;
  return posVsTargetView > KNIFE.behindDot && posVsOwnerView > KNIFE.facingDot && viewAngles > KNIFE.viewDot;
}

function norm2(v: Vec3): void {
  const l = Math.hypot(v.x, v.y);
  if (l > 0) {
    v.x /= l;
    v.y /= l;
  }
}

/** CTFKnife. */
export class Knife extends TFWeaponMelee {
  /** m_hBackstabVictim (player id, 0 = none). */
  backstabVictim = 0;
  /** m_bReadyToBackstab (the raised-hand view model). */
  readyToBackstab = false;
  private readonly knifeFn = (): void => this.findBackstabVictim();
  private readonly vmThinkFn = (): void => this.backstabVMThinkNow();

  /** SDK: CTFKnife::CanPerformBackstabAgainstTarget (stock: just the position rule). */
  canPerformBackstabAgainstTarget(target: Player): boolean {
    return isBehindAndFacingTarget(this.owner!, target);
  }

  isBackstab(): boolean {
    return this.backstabVictim !== 0;
  }

  /** SDK: CTFKnife::CalcIsAttackCriticalHelper(NoCrits) — crits only from behind. */
  override calcIsAttackCriticalHelper(_cmd: UserCmd): boolean {
    return this.isBackstab();
  }

  override calcIsAttackCriticalHelperNoCrits(): boolean {
    return this.isBackstab();
  }

  /** SDK: CTFKnife::PrimaryAttack — pick the victim under lag compensation, then swing and smack at once. */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.canAttack()) return;
    this.weaponMode = TF_WEAPON_PRIMARY_MODE;
    this.backstabVictim = 0;
    o.world.lagcomp.withRewind(o, cmd.tickCount, this.knifeFn);
    removeInvisibility(o);
    this.swing(cmd);
    this.smack(cmd);
    this.smackTime = -1;
    this.readyToBackstab = false;
    removeDisguise(o);
  }

  private findBackstabVictim(): void {
    const o = this.owner!;
    if (!this.doSwingTrace(backstabTrace)) return;
    const e = o.world.entity(backstabTrace.entity);
    if (e && e.isPlayer() && e.team !== o.team && this.canPerformBackstabAgainstTarget(e as Player)) this.backstabVictim = e.id;
  }

  /** SDK: CTFKnife::GetMeleeDamage — a backstab does twice the victim's health (then ×3 crit). */
  override meleeDamage(target: Entity, custom: { value: number }): number {
    let damage = super.meleeDamage(target, custom);
    const o = this.owner!;
    if (target.isPlayer()) {
      if (this.isBackstab()) {
        damage = target.health * KNIFE.backstabHealthMult;
        custom.value = TF_DMG_CUSTOM_BACKSTAB;
      } else this.currentAttackIsCrit = o.cond.critBoosted;
    }
    return damage;
  }

  /** SDK: CTFKnife::SendPlayerAnimEvent — the backstab gesture. */
  override sendPlayerAnimEvent(o: Player): void {
    o.doAnimationEvent(this.isBackstab() ? PLAYERANIMEVENT_ATTACK_SECONDARY : PLAYERANIMEVENT_ATTACK_PRIMARY);
  }

  override sendWeaponAnim(act: number): void {
    super.sendWeaponAnim(this.readyToBackstab && act === ACT.VM_IDLE ? ACT.BACKSTAB_VM_IDLE : act);
  }

  /** SDK: CTFKnife::ItemPostFrame → BackstabVMThink. */
  override tfItemPostFrame(cmd: UserCmd): void {
    this.backstabVMThink(cmd);
    super.tfItemPostFrame(cmd);
  }

  /** SDK: CTFKnife::BackstabVMThink — raise / lower the hand while idling. */
  backstabVMThink(cmd: UserCmd): void {
    const o = this.owner;
    if (!o || o.activeWeapon() !== this) return;
    const a = this.vmActivity;
    if (a !== ACT.VM_IDLE && a !== ACT.BACKSTAB_VM_IDLE && a !== ACT.BACKSTAB_VM_UP && a !== ACT.BACKSTAB_VM_DOWN) return;
    o.world.lagcomp.withRewind(o, cmd.tickCount, this.vmThinkFn);
  }

  private backstabVMThinkNow(): void {
    const o = this.owner!;
    let ready = false;
    if (this.doSwingTrace(backstabTrace) && this.canAttack()) {
      const e = o.world.entity(backstabTrace.entity);
      if (e && e.isPlayer() && e.team !== o.team) ready = this.canPerformBackstabAgainstTarget(e as Player);
    }
    if (ready && !this.readyToBackstab) {
      super.sendWeaponAnim(ACT.BACKSTAB_VM_UP);
      this.readyToBackstab = true;
    } else if (!ready && this.readyToBackstab) {
      super.sendWeaponAnim(ACT.BACKSTAB_VM_DOWN);
      this.readyToBackstab = false;
    }
  }

  override holster(next: Parameters<TFWeapon['holster']>[0]): boolean {
    this.readyToBackstab = false;
    return super.holster(next);
  }

  protected override writeWeaponNet(out: NetRecord): void {
    super.writeWeaponNet(out);
    out.aux2 = this.readyToBackstab ? 1 : 0;
    out.aux3 = this.backstabVictim;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    super.readWeaponNet(rec);
    this.readyToBackstab = num(rec.aux2) !== 0;
    this.backstabVictim = num(rec.aux3);
  }
}

/** Damage helper kept for tests: what a backstab deals before the crit multiplier. */
export const backstabBaseDamage = (victimHealth: number): number => victimHealth * KNIFE.backstabHealthMult;

/** Re-export for the knife's world-model check. */
export const isSpy = (p: Player): boolean => p.playerClass === TF_CLASS_SPY;
