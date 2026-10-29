/**
 * CTFWeaponBase over the core's BaseWeapon: the shared frame logic every
 * stock weapon runs, ported routine by routine —
 *
 * - CBasePlayer::ItemPostFrame's busy/post split (m_flNextAttack),
 * - CTFWeaponBase::ItemPostFrame + CBaseCombatWeapon::ItemPostFrame (attack2,
 *   attack, empty click, reload key, idle) and CTFWeaponBase::ItemBusyFrame
 *   (class skill on attack2, interrupting a reload),
 * - the reload state machines: CTFWeaponBase::Reload / ReloadSingly /
 *   ReloadSinglyPostFrame / DefaultReload / SetReloadTimer / IncrementAmmo
 *   with the scripts' TimeReloadStart / TimeReload (UpdateReloadTimers),
 * - random crits: CTFWeaponBase::CalcIsAttackCritical and
 *   CalcIsAttackCriticalHelper (per-shot rolls, rapid-fire 2 s windows), the
 *   melee helper (CTFWeaponBaseMelee::CalcIsAttackCriticalHelper) and the
 *   anti-cheat token bucket (CBaseCombatWeapon::AddToCritBucket /
 *   IsAllowedToWithdrawFromCritBucket), rolled on the command's shared seed,
 * - CTFPlayer::CanAttack (cloak, taunt, humiliation) and
 *   CTFPlayer::DoClassSpecialSkill (cloak, sticky detonation),
 * - view-model activities (SendWeaponAnim) as a networked activity id +
 *   sequence counter, so the renderer and a predicting client play the same
 *   draw / idle / fire / reload sequence.
 */

import {
  FL_ONGROUND,
  IN_ATTACK,
  IN_ATTACK2,
  IN_RELOAD,
  TF_CLASS_DEMOMAN,
  TF_CLASS_SPY,
  TF_TEAM_BLUE,
} from '../../core/constants';
import { hashSeed, type UniformRandomStream } from '../../core/random';
import type { UserCmd } from '../../core/types';
import { CRIT, remapValClamped } from '../../data/damage';
import {
  STOCK_WEAPONS,
  type StockWeapon,
  type WeaponScript,
  type WeaponSoundCategory,
} from '../../data/weapons';
import { TF_COND } from '../conditions';
import { hookWeapon } from '../items/attributes';
import { activateSodaPopperHype, tryShieldCharge } from '../items/effects';
import { weaponScript } from '../items/scripts';
import { MOVE_COND_AIR_CURRENT } from '../movement-types';
import { CHAN_WEAPON } from '../events';
import { weaponSpecFor } from '../loadout';
import { MAX_PLAYERS } from '../world';
import { PLAYERANIMEVENT_RELOAD, PLAYERANIMEVENT_RELOAD_END, PLAYERANIMEVENT_RELOAD_LOOP, type Player } from '../player';
import { GR_STATE_TEAM_WIN } from '../rules';
import type { NetRecord } from '../net-schema';
import {
  BaseWeapon,
  defaultWeaponStats,
  SLOT_PRIMARY,
  TF_AMMO_COUNT,
  TF_AMMO_DUMMY,
  TF_RELOAD_FINISH,
  TF_RELOAD_START,
  TF_RELOADING,
  TF_RELOADING_CONTINUE,
  WEAPON_SLOTS,
  type WeaponSpec,
  type WeaponStats,
} from '../weapon-api';
import { ACT, DEFAULT_SECONDARY_DELAY, EMPTY_SOUND_INTERVAL, TF_WEAPON_PRIMARY_MODE } from './constants';
import { critTracker } from './crits';
import { cloakBlocksAttack, spyState } from './spy-state';

/** tf_weapon_criticals (1). Tests and server settings may turn random crits off. */
let randomCritsEnabled = true;
export function setRandomCritsEnabled(on: boolean): void {
  randomCritsEnabled = on;
}
export const areRandomCritsEnabled = (): boolean => randomCritsEnabled;

/** A weapon the owner's +attack2 class skill reaches while another weapon is out (DoClassSpecialSkill). */
export interface ClassSkillWeapon {
  classSkill(): void;
}
const hasClassSkill = (w: unknown): w is ClassSkillWeapon =>
  typeof (w as Partial<ClassSkillWeapon> | null)?.classSkill === 'function';

const AMMO_INDEX: Readonly<Record<string, number>> = {
  primary: 1,
  secondary: 2,
  metal: 3,
  grenades1: 4,
  grenades2: 5,
  grenades3: 6,
};

/** Stats for a spec: the loadout's (when given) or rebuilt from the script and item. */
export function statsForSpec(spec: WeaponSpec): WeaponStats {
  const script = weaponScript(spec.classname);
  if (!script) return defaultWeaponStats({ classname: spec.classname, defindex: spec.defindex, slot: spec.slot, ...spec.stats });
  const item: StockWeapon | undefined = STOCK_WEAPONS[spec.defindex];
  const mode = script.primary;
  return defaultWeaponStats({
    classname: script.scriptName,
    defindex: spec.defindex,
    slot: script.bucket,
    weaponId: script.weaponId,
    ammoType: script.primaryAmmo ? AMMO_INDEX[script.primaryAmmo] : TF_AMMO_DUMMY,
    maxClip: script.clipSize,
    ammoPerShot: mode.ammoPerShot,
    damage: mode.damage,
    bulletsPerShot: mode.bulletsPerShot,
    spread: mode.spread,
    range: mode.range || 8192,
    fireDelay: mode.timeFireDelay,
    timeIdle: mode.timeIdle,
    reloadTime: mode.timeReload,
    reloadStartTime: mode.timeReloadStart,
    reloadsSingly: script.reloadsSingly,
    damageType: script.damageType,
    killIcon: script.scriptName.replace(/^tf_weapon_/, ''),
    worldModel: item?.worldModel ?? script.scriptPlayerModel ?? '',
    viewModel: item?.viewModel ?? script.scriptViewModel ?? '',
    ...spec.stats,
  });
}

/** Resolves a spec by classname when the caller only knows the item (tests, bots). */
export function specFor(defindex: number, classIndex: number): WeaponSpec | null {
  return weaponSpecFor(defindex, classIndex);
}

/** TF_WEAPON_SODA_POPPER. */
const TF_WEAPON_SODA_POPPER = 76;
/** ENERGY_WEAPON_MAX_CHARGE (tf_weaponbase.h). */
export const ENERGY_WEAPON_MAX_CHARGE = 20;
/** What reserve() reports for an energy weapon: there is always more to recharge from. */
const ENERGY_RESERVE = 1 << 20;

export abstract class TFWeapon extends BaseWeapon {
  readonly script: WeaponScript;
  readonly item: StockWeapon | null;
  /** WeaponSound_t → game_sounds entry (the item's visuals overrides applied). */
  readonly sounds: Readonly<Partial<Record<WeaponSoundCategory, string>>>;
  /** Networked view-model activity (ACT index) and its change counter. */
  vmActivity: number = ACT.VM_IDLE;
  vmActivitySeq = 0;
  /** CBasePlayer::m_flNextAttack while this weapon is out: before it, only ItemBusyFrame runs. */
  nextAttack = 0;
  /** m_flReloadPriorNextFire: the attack time a reload may not undercut when interrupted. */
  reloadPriorNextFire = 0;
  /** m_iReloadStartClipAmount. */
  reloadStartClip = 0;
  /** m_iWeaponMode. */
  weaponMode = TF_WEAPON_PRIMARY_MODE;
  /** m_bCurrentAttackIsCrit / m_bCurrentCritIsRandom. */
  currentAttackIsCrit = false;
  currentCritIsRandom = false;
  /** m_flCritTokenBucket, m_nCritChecks, m_nCritSeedRequests. */
  critBucket: number = CRIT.bucket.initial;
  critChecks = 1;
  critRequests = 0;
  /** m_flCritTime: a rapid-fire crit window runs until this. */
  critTime = 0;
  /** m_flLastRapidFireCritCheckTime. */
  lastCritCheckTime = 0;
  /** m_iLastCritCheckFrame (one crit decision per tick). */
  private lastCritCheckTick = -1;
  /** m_bFireOnEmpty / m_flNextEmptySoundTime. */
  protected fireOnEmpty = false;
  protected nextEmptySoundTime = 0;

  constructor(spec: WeaponSpec) {
    super(statsForSpec(spec));
    this.script = weaponScript(this.stats.classname) as WeaponScript;
    this.item = STOCK_WEAPONS[this.stats.defindex] ?? null;
    this.sounds = this.item && Object.keys(this.item.sounds).length > 0 ? this.item.sounds : (this.script?.sounds ?? {});
  }

  // ─── Small helpers ───────────────────────────────────────────────────────

  get isMelee(): boolean {
    return !!this.script?.meleeWeapon;
  }

  get t(): number {
    return this.owner ? this.owner.world.curtime : 0;
  }

  /** SDK: CBaseCombatWeapon::SendWeaponAnim — the activity the view model plays. */
  sendWeaponAnim(act: number): void {
    this.vmActivity = act;
    this.vmActivitySeq = (this.vmActivitySeq + 1) & 255;
  }

  /** SDK: CBaseCombatWeapon::WeaponSound — the script's sound for a category, predicted by the owner. */
  weaponSound(category: WeaponSoundCategory): void {
    const o = this.owner;
    const name = this.sounds[category];
    if (!o || !name) return;
    o.world.emitSound(name, { entity: o.id, channel: CHAN_WEAPON, predictedBy: o.isBot ? undefined : o.id });
  }

  /** Stops a looping sound this weapon started on the owner. */
  stopSound(name: string | undefined, channel = CHAN_WEAPON): void {
    const o = this.owner;
    if (!o || !name || !o.world.isServer) return;
    o.world.events.push({ type: 'sound', name, entity: o.id, channel, stop: true });
  }

  /** Team-coloured particle names ("…_red" / "…_blue"). */
  teamSuffix(): string {
    return this.owner && this.owner.team === TF_TEAM_BLUE ? 'blue' : 'red';
  }

  /** A pseudo entity index for the crit seed masks (weapons are not entities here). */
  protected weaponIndex(): number {
    const o = this.owner;
    return MAX_PLAYERS + 1 + ((o ? o.id : 0) - 1) * WEAPON_SLOTS + this.slot;
  }

  reserve(): number {
    // An energy weapon recharges from nothing (CTFWeaponBase::Reload → Energy_Recharge).
    return this.isEnergyWeapon() ? ENERGY_RESERVE : this.reserveAmmo();
  }

  // ─── Energy weapons (Energy_*: the Bison, the Pomson, the Cow Mangler, the Manmelter) ───

  /** SDK: CTFWeaponBase::IsEnergyWeapon. The clip holds the energy (Clip1 → Energy_GetEnergy). */
  isEnergyWeapon(): boolean {
    return false;
  }

  /** SDK: Energy_GetShotCost / Energy_GetRechargeCost. */
  energyShotCost(): number {
    return 4;
  }

  energyRechargeCost(): number {
    return 4;
  }

  /** SDK: CTFWeaponBase::Energy_GetMaxEnergy — whole shots of ENERGY_WEAPON_MAX_CHARGE (× mult_clipsize_upgrade). */
  energyMax(): number {
    const cost = this.energyShotCost();
    if (cost <= 0) return ENERGY_WEAPON_MAX_CHARGE;
    const shots = Math.trunc(hookWeapon(this, this.owner, 'mult_clipsize_upgrade', Math.trunc(ENERGY_WEAPON_MAX_CHARGE / cost)));
    return shots * cost;
  }

  /** Energy_HasEnergy. */
  energyHasEnergy(): boolean {
    return this.clip >= this.energyShotCost();
  }

  /**
   * Makes the clip the energy store: as many units as Energy_GetMaxEnergy, a shot's cost per shot,
   * recharged a step at a time (ReloadSingly) with no reserve. Energy weapons call it from their
   * constructor.
   */
  protected initEnergy(): void {
    const max = this.energyMax();
    this.stats.maxClip = max;
    this.stats.ammoPerShot = this.energyShotCost();
    this.stats.reloadsSingly = true;
    this.clip = max;
  }

  // ─── CTFPlayer::CanAttack & co ───────────────────────────────────────────

  /** SDK: CTFWeaponBase::CanAttack → CTFPlayer::CanAttack (cloak, taunt, humiliation). */
  canAttack(): boolean {
    const o = this.owner;
    if (!o || !o.alive) return false;
    if (cloakBlocksAttack(o)) return false;
    if (o.cond.has(TF_COND.TAUNTING)) return false;
    const rules = o.world.rules;
    if (rules.state === GR_STATE_TEAM_WIN && rules.winningTeam !== o.team) return false;
    return !o.cannotAttack();
  }

  /** SDK: CTFPlayer::DoClassSpecialSkill — +attack2 with any weapon: the watch for Spies, detonation for Demomen. */
  doClassSpecialSkill(): void {
    const o = this.owner;
    if (!o || !o.alive) return;
    if (o.playerClass === TF_CLASS_SPY) {
      if (o.cond.has(TF_COND.TAUNTING) || spyState(o).stealthNextChangeTime > o.world.curtime) return;
    } else if (o.playerClass !== TF_CLASS_DEMOMAN) {
      // Engineers pick up buildings (the buildings module may install this hook on the player).
      (o as Player & { tryToPickupBuilding?: () => boolean }).tryToPickupBuilding?.();
      return;
    }
    for (let i = 0; i < o.weapons.length; i++) {
      const w = o.weapons[i];
      if (w && hasClassSkill(w)) {
        w.classSkill();
        return;
      }
    }
    // No stickybomb launcher: a Demoman's shield charges (CTFWearableDemoShield::DoSpecialAction).
    if (o.playerClass === TF_CLASS_DEMOMAN) tryShieldCharge(o);
  }

  // ─── Crits ───────────────────────────────────────────────────────────────

  /** The shared random stream for this command's crit roll (seed ^ weapon/player mask). */
  protected critStream(cmd: UserCmd, melee: boolean): UniformRandomStream {
    const o = this.owner!;
    const mask = melee ? (this.weaponIndex() << 16) | (o.id << 8) : (this.weaponIndex() << 8) | o.id;
    return o.world.sharedRandom(hashSeed((cmd.randomSeed ^ mask) | 0));
  }

  /** SDK: CTFWeaponBase::CalcIsAttackCritical (once per tick). */
  calcIsAttackCritical(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    const tick = o.world.tickCount;
    if (tick === this.lastCritCheckTick) return;
    this.lastCritCheckTick = tick;
    this.currentCritIsRandom = false;
    const rules = o.world.rules;
    if (rules.state === GR_STATE_TEAM_WIN && rules.winningTeam === o.team) this.currentAttackIsCrit = true;
    else if (!randomCritsEnabled) this.currentAttackIsCrit = this.calcIsAttackCriticalHelperNoCrits();
    else this.currentAttackIsCrit = this.calcIsAttackCriticalHelper(cmd);
  }

  /** SDK: CalcIsAttackCriticalHelperNoCrits — only crit-boosts. */
  calcIsAttackCriticalHelperNoCrits(): boolean {
    return !!this.owner && this.owner.cond.critBoosted;
  }

  /** SDK: CTFWeaponBase::CanFireCriticalShot (always for stock items outside PvE). */
  canFireCriticalShot(_headshot = false): boolean {
    return true;
  }

  /** SDK: CTFWeaponBase::CalcIsAttackCriticalHelper — ranged and rapid-fire random crits. */
  calcIsAttackCriticalHelper(cmd: UserCmd): boolean {
    const o = this.owner;
    if (!o || !this.script) return false;
    const t = o.world.curtime;
    const mult = critTracker(o).mult();
    if (!this.canFireCriticalShot()) return false;
    if (o.cond.critBoosted) return true;
    const mode = this.script.primary;
    const rapid = mode.useRapidFireCrits;
    if (rapid && this.critTime > t) return true;

    // SDK: the bucket is filled with the hooked damage × the hooked pellet count (mult_dmg, mult_bullets_per_shot).
    const projectiles = Math.max(1, this.stats.bulletsPerShot);
    let damage = this.stats.damage * projectiles;
    this.addToCritBucket(damage);
    let crit: boolean;
    this.currentCritIsRandom = true;
    if (rapid) {
      // One check a second (tf_weapon_criticals_nopred off: m_flLastCritCheckTime).
      if (t < this.lastCritCheckTime + CRIT.rapidCheckInterval) return false;
      this.lastCritCheckTime = t;
      const total = Math.min(0.99, Math.max(0.01, CRIT.chanceRapid * mult));
      const nonCrit = CRIT.rapidDuration / total - CRIT.rapidDuration;
      const start = hookWeapon(this, o, 'mult_crit_chance', 1 / nonCrit);
      const roll = this.critStream(cmd, false).randomInt(0, CRIT.randomRange - 1);
      crit = roll < start * CRIT.randomRange;
    } else {
      const chance = hookWeapon(this, o, 'mult_crit_chance', CRIT.chance * mult);
      const roll = this.critStream(cmd, false).randomInt(0, CRIT.randomRange - 1);
      crit = roll < chance * CRIT.randomRange;
    }
    this.critChecks = Math.min(this.critChecks + 1, 65535);
    if (crit) {
      if (rapid) {
        // Pay for the whole window up front, never more than the bucket cap.
        damage *= CRIT.rapidDuration / mode.timeFireDelay;
        if (damage * CRIT.multiplier > CRIT.bucket.cap) damage = CRIT.bucket.cap / CRIT.multiplier;
      }
      crit = this.isAllowedToWithdrawFromCritBucket(damage);
      if (crit && rapid) this.critTime = t + CRIT.rapidDuration;
    }
    // CanFireRandomCriticalShot's observed-rate check needs round stats the sim doesn't keep.
    return crit;
  }

  /** SDK: CTFWeaponBaseMelee::CalcIsAttackCriticalHelper — 15 % × the crit multiplier per swing. */
  protected calcMeleeCrit(cmd: UserCmd): boolean {
    const o = this.owner;
    if (!o || !this.script) return false;
    if (!this.canFireCriticalShot()) return false;
    if (o.cond.critBoosted) return true;
    const chance = hookWeapon(this, o, 'mult_crit_chance', CRIT.chanceMelee * critTracker(o).mult());
    const stream = this.critStream(cmd, true);
    const damage = this.stats.damage;
    this.addToCritBucket(damage);
    this.critChecks = Math.min(this.critChecks + 1, 65535);
    let crit = stream.randomInt(0, CRIT.randomRange - 1) < chance * CRIT.randomRange;
    if (crit) crit = this.isAllowedToWithdrawFromCritBucket(damage);
    return crit;
  }

  /** SDK: CBaseCombatWeapon::AddToCritBucket. */
  addToCritBucket(amount: number): void {
    if (this.critBucket < CRIT.bucket.cap) this.critBucket = Math.min(this.critBucket + amount, CRIT.bucket.cap);
  }

  /** SDK: CBaseCombatWeapon::IsAllowedToWithdrawFromCritBucket. */
  isAllowedToWithdrawFromCritBucket(damage: number): boolean {
    this.critRequests = Math.min(this.critRequests + 1, 65535);
    const mult = this.isMelee
      ? CRIT.bucket.meleeCostMult
      : remapValClamped(this.critRequests / this.critChecks, 0.1, 1, 1, CRIT.bucket.rangedCostMultMax);
    const cost = damage * CRIT.multiplier * mult;
    if (cost > this.critBucket) return false;
    this.critBucket -= cost;
    if (this.critBucket < CRIT.bucket.bottom) this.critBucket = CRIT.bucket.bottom;
    return true;
  }

  // ─── Deploy / holster ────────────────────────────────────────────────────

  /** SDK: CTFWeaponBase::Deploy — draw delay, ACT_VM_DRAW, m_flNextAttack. */
  override deploy(): boolean {
    super.deploy();
    this.nextSecondaryAttack = Math.max(this.nextSecondaryAttack, this.nextPrimaryAttack);
    this.nextAttack = this.nextPrimaryAttack;
    this.fireOnEmpty = false;
    this.sendWeaponAnim(ACT.VM_DRAW);
    this.weaponSound('deploy');
    return true;
  }

  override holster(next: Parameters<BaseWeapon['holster']>[0]): boolean {
    this.abortReload();
    return super.holster(next);
  }

  override refill(): void {
    super.refill();
    this.nextAttack = 0;
    this.fireOnEmpty = false;
    this.currentAttackIsCrit = false;
    this.critTime = 0;
    this.effectBarRegenTime = 0;
  }

  // ─── The frame ───────────────────────────────────────────────────────────

  /** SDK: CBasePlayer::ItemPostFrame — busy until m_flNextAttack, else the weapon's post frame. */
  override itemPostFrame(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    critTracker(o).update(o);
    airborneCondThink(o);
    if (this.nextAttack > o.world.curtime) this.itemBusyFrame(cmd);
    else this.tfItemPostFrame(cmd);
    this.checkEffectBarRegen();
  }

  override itemHolsterFrame(_cmd: UserCmd): void {
    const o = this.owner;
    if (o) critTracker(o).update(o);
    this.checkEffectBarRegen();
  }

  // ─── The effect bar (jars, drinks, the Sandvich, the cleaver, the ball) ───

  /** m_flEffectBarRegenTime: when the next charge of the effect bar's ammo comes back (0 = full). */
  effectBarRegenTime = 0;

  /** SDK: InternalGetEffectBarRechargeTime — 0 for weapons without an effect bar. */
  internalEffectBarRechargeTime(): number {
    return 0;
  }

  /** SDK: CTFWeaponBase::HasEffectBarRegeneration. */
  hasEffectBarRegeneration(): boolean {
    return this.internalEffectBarRechargeTime() > 0;
  }

  /** SDK: CTFWeaponBase::GetEffectBarRechargeTime (× effectbar_recharge_rate). */
  effectBarRechargeTime(): number {
    return hookWeapon(this, this.owner, 'effectbar_recharge_rate', this.internalEffectBarRechargeTime());
  }

  /** SDK: CTFWeaponBase::GetEffectBarAmmo — the primary ammo type. */
  effectBarAmmo(): number {
    return this.stats.ammoType;
  }

  /** SDK: CTFWeaponBase::GetEffectBarProgress (0…1; 1 when the ammo is full). */
  effectBarProgress(): number {
    const o = this.owner;
    const a = this.effectBarAmmo();
    if (o && o.ammo[a] < o.maxAmmo[a]) {
      const time = this.effectBarRechargeTime();
      if (time <= 0) return 1;
      return (time - (this.effectBarRegenTime - this.t)) / time;
    }
    return 1;
  }

  /** SDK: CTFWeaponBase::StartEffectBarRegen. */
  startEffectBarRegen(): void {
    const o = this.owner;
    const a = this.effectBarAmmo();
    const wasFull = !!o && o.ammo[a] + 1 === o.maxAmmo[a];
    if (this.effectBarRegenTime < this.t || wasFull) this.effectBarRegenTime = this.t + this.effectBarRechargeTime();
  }

  /** SDK: CTFWeaponBase::CheckEffectBarRegen. */
  checkEffectBarRegen(): void {
    if (!this.effectBarRegenTime) return;
    const o = this.owner;
    if (!o) return;
    const a = this.effectBarAmmo();
    if (o.ammo[a] === o.maxAmmo[a]) {
      this.effectBarRegenTime = 0;
      return;
    }
    if (this.effectBarRegenTime < this.t) {
      this.effectBarRegenTime = 0;
      this.effectBarRegenFinished();
    }
  }

  /** SDK: CTFWeaponBase::EffectBarRegenFinished — one more, and recharge again if not full. */
  effectBarRegenFinished(): void {
    const o = this.owner;
    const a = this.effectBarAmmo();
    if (o && o.ammo[a] < o.maxAmmo[a]) {
      o.giveAmmo(1, a);
      if (o.ammo[a] < o.maxAmmo[a]) this.startEffectBarRegen();
    }
  }

  /** SDK: CTFWeaponBase::DecrementBarRegenTime. */
  decrementBarRegenTime(time: number): void {
    this.effectBarRegenTime -= time;
  }

  /** Was this button up in the previous command (m_afButtonPressed)? */
  protected pressed(cmd: UserCmd, button: number): boolean {
    const o = this.owner!;
    return (cmd.buttons & button) !== 0 && (o.lastCmd === cmd ? false : (o.lastCmd.buttons & button) === 0);
  }

  /** m_afButtonReleased. */
  protected released(cmd: UserCmd, button: number): boolean {
    const o = this.owner!;
    return (cmd.buttons & button) === 0 && o.lastCmd !== cmd && (o.lastCmd.buttons & button) !== 0;
  }

  /** SDK: CTFWeaponBase::ItemBusyFrame — class skill on attack2, reload interruption. */
  itemBusyFrame(cmd: UserCmd): void {
    const t = this.t;
    const buttons = cmd.buttons;
    // CTFSodaPopper::ItemBusyFrame: the hype can start mid-reload.
    if (this.weaponId === TF_WEAPON_SODA_POPPER && buttons & IN_ATTACK2 && this.owner) activateSodaPopperHype(this.owner);
    if (buttons & IN_ATTACK2 && !this.inAttack2) {
      this.doClassSpecialSkill();
      this.inAttack2 = true;
    } else if (!(buttons & IN_ATTACK2) && this.inAttack2) this.inAttack2 = false;
    if (buttons & IN_ATTACK && this.clip > 0) {
      let abort = false;
      if (this.stats.reloadsSingly) {
        if (this.reloadMode !== TF_RELOAD_START) {
          this.reloadMode = TF_RELOAD_START;
          abort = true;
        }
      } else if (this.inReload && t >= this.reloadPriorNextFire) abort = true;
      if (abort) {
        this.abortReload();
        this.inReload = false;
        this.nextAttack = t;
        this.nextPrimaryAttack = Math.max(t, this.reloadPriorNextFire);
        this.timeWeaponIdle = t + this.idleTime();
      }
    }
  }

  /** SDK: CTFWeaponBase::ItemPostFrame (+ ReloadSinglyPostFrame). */
  tfItemPostFrame(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    let buttons = cmd.buttons;
    const needsReload = this.usesClip() && this.clip < this.maxClip && this.reserve() > 0;
    if (o.autoReload && this.usesClip() && !(buttons & (IN_ATTACK | IN_ATTACK2)) && needsReload) buttons |= IN_RELOAD;
    if (this.inAttack && !(buttons & IN_ATTACK)) this.inAttack = false;
    if (this.inAttack2 && !(buttons & IN_ATTACK2)) this.inAttack2 = false;
    this.baseItemPostFrame(cmd, buttons);
    if (this.stats.reloadsSingly) this.reloadSinglyPostFrame();
  }

  /** SDK: CBaseCombatWeapon::ItemPostFrame. */
  protected baseItemPostFrame(cmd: UserCmd, buttons: number): void {
    const t = this.t;
    if (this.usesClip()) this.checkReload();
    if (buttons & IN_ATTACK2 && this.nextSecondaryAttack <= t) this.secondaryAttack(cmd);
    if (buttons & IN_ATTACK && this.nextPrimaryAttack <= t) {
      const empty =
        !this.isMelee &&
        ((this.usesClip() && this.clip <= 0) || (!this.usesClip() && this.stats.ammoType !== TF_AMMO_DUMMY && this.reserve() <= 0));
      if (empty) this.handleFireOnEmpty();
      else {
        if (this.pressed(cmd, IN_ATTACK) || this.released(cmd, IN_ATTACK2)) this.nextPrimaryAttack = t;
        this.primaryAttack(cmd);
        this.inAttack = true;
      }
    }
    if (!(buttons & IN_ATTACK)) this.fireOnEmpty = false;
    if (buttons & IN_RELOAD && this.nextPrimaryAttack <= t && this.usesClip() && !this.inReload) this.reload();
    if (!(buttons & (IN_ATTACK | IN_ATTACK2)) && !(this.usesClip() && buttons & IN_RELOAD)) {
      if (!this.inReload) this.weaponIdle(cmd);
    }
  }

  /** SDK: CBaseCombatWeapon::HandleFireOnEmpty (TF2 never auto-switches; it reloads). */
  handleFireOnEmpty(): void {
    const t = this.t;
    if (this.fireOnEmpty) {
      if (this.usesClip() && this.clip <= 0 && this.reserve() > 0 && this.nextSecondaryAttack <= t) this.reload();
      return;
    }
    if (this.nextEmptySoundTime < t) {
      this.weaponSound('empty');
      this.sendWeaponAnim(ACT.VM_DRYFIRE);
      this.nextEmptySoundTime = t + EMPTY_SOUND_INTERVAL;
    }
    this.fireOnEmpty = true;
  }

  /** Default +attack2 for guns and melee (CTFWeaponBaseGun::SecondaryAttack): the class skill. */
  override secondaryAttack(_cmd: UserCmd): void {
    // CTFSodaPopper::SecondaryAttack: the hype, not the class skill.
    if (this.weaponId === TF_WEAPON_SODA_POPPER) {
      if (this.owner) activateSodaPopperHype(this.owner);
      return;
    }
    if (this.inAttack2) return;
    this.doClassSpecialSkill();
    this.inAttack2 = true;
    this.nextSecondaryAttack = this.t + DEFAULT_SECONDARY_DELAY;
  }

  /** The script's idle time (the idle sequence length the SDK reads from the model). */
  idleTime(): number {
    const idle = this.script ? this.script.primary.timeIdle : 0;
    return idle > 0 ? idle : 1;
  }

  /** SDK: CTFWeaponBase::WeaponIdle. */
  override weaponIdle(_cmd: UserCmd): void {
    const t = this.t;
    if (this.timeWeaponIdle > t) return;
    if (!(this.stats.reloadsSingly && this.reloadMode !== TF_RELOAD_START)) {
      this.sendWeaponAnim(ACT.VM_IDLE);
      this.timeWeaponIdle = t + this.idleTime();
    }
  }

  // ─── Reloading ───────────────────────────────────────────────────────────

  /** SDK: CBaseCombatWeapon::CheckReload (clip weapons). */
  checkReload(): void {
    if (this.stats.reloadsSingly) return;
    const t = this.t;
    if (this.inReload && this.nextPrimaryAttack <= t) {
      this.finishReload();
      this.nextPrimaryAttack = t;
      this.nextSecondaryAttack = t;
      this.inReload = false;
    }
  }

  /** SDK: CTFWeaponBase::Reload. */
  override reload(): boolean {
    const o = this.owner;
    if (!o || !this.usesClip()) return false;
    if (this.reloadMode === TF_RELOAD_START) {
      if (this.reserve() <= 0) return false;
      if (this.clip >= this.maxClip) return false;
    }
    if (this.stats.reloadsSingly) return this.reloadSingly();
    return this.defaultReload();
  }

  /** SDK: CTFWeaponBase::DefaultReload (script TimeReload; no view-model sequence lengths here). */
  defaultReload(): boolean {
    const o = this.owner;
    if (!o || this.inReload) return false;
    if (!(this.clip < this.maxClip && this.reserve() > 0)) return false;
    this.weaponSound('reload');
    o.doAnimationEvent(PLAYERANIMEVENT_RELOAD);
    this.sendWeaponAnim(ACT.VM_RELOAD);
    this.setReloadTimer(this.stats.reloadTime);
    this.inReload = true;
    this.onReloadStart();
    return true;
  }

  /** SDK: CTFWeaponBase::SetReloadTimer. */
  setReloadTimer(time: number): void {
    const t = this.t;
    this.reloadPriorNextFire = this.nextPrimaryAttack;
    const end = t + Math.max(time, 0.00001);
    this.nextAttack = end;
    this.nextPrimaryAttack = Math.max(end, this.reloadPriorNextFire);
    this.timeWeaponIdle = end;
  }

  /** SDK: CTFWeaponBase::ReloadSingly — start, shell after shell, finish. */
  reloadSingly(): boolean {
    const o = this.owner;
    if (!o) return false;
    const t = this.t;
    if (this.nextPrimaryAttack > t) return false;
    switch (this.reloadMode) {
      case TF_RELOAD_START:
        this.sendWeaponAnim(ACT.RELOAD_START);
        this.setReloadTimer(this.stats.reloadStartTime);
        this.reloadMode = TF_RELOADING;
        this.reloadStartClip = this.clip;
        this.onReloadStart();
        return true;
      case TF_RELOADING:
        if (this.timeWeaponIdle > t) return false;
        o.doAnimationEvent(this.clip === this.reloadStartClip ? PLAYERANIMEVENT_RELOAD : PLAYERANIMEVENT_RELOAD_LOOP);
        this.sendWeaponAnim(ACT.VM_RELOAD);
        this.setReloadTimer(this.stats.reloadTime);
        this.weaponSound('reload');
        this.reloadMode = TF_RELOADING_CONTINUE;
        return true;
      case TF_RELOADING_CONTINUE:
        if (this.timeWeaponIdle > t) return false;
        this.incrementAmmo();
        this.reloadMode = this.clip === this.maxClip || this.reserve() <= 0 ? TF_RELOAD_FINISH : TF_RELOADING;
        return true;
      case TF_RELOAD_FINISH:
      default:
        this.sendWeaponAnim(ACT.RELOAD_FINISH);
        o.doAnimationEvent(PLAYERANIMEVENT_RELOAD_END);
        this.reloadMode = TF_RELOAD_START;
        return true;
    }
  }

  /** SDK: CTFWeaponBase::IncrementAmmo. */
  incrementAmmo(): void {
    const o = this.owner;
    if (!o) return;
    if (this.isEnergyWeapon()) {
      // Energy_Recharge.
      this.clip = Math.min(this.maxClip, this.clip + this.energyRechargeCost());
      return;
    }
    const a = o.ammo;
    if (a[this.stats.ammoType] > 0 && this.clip < this.maxClip) {
      this.clip++;
      a[this.stats.ammoType]--;
    }
  }

  /** SDK: CTFWeaponBase::ReloadSinglyPostFrame. */
  reloadSinglyPostFrame(): void {
    if (this.timeWeaponIdle > this.t) return;
    if (this.isEnergyWeapon()) {
      if (this.clip < this.maxClip) this.reload();
      return;
    }
    if ((this.clip === 0 && this.reserve() > 0) || this.reloadMode !== TF_RELOAD_START) this.reload();
  }

  /** The core's single-reload driver is replaced by reloadSinglyPostFrame. */
  protected override reloadSinglyFrame(): void {
    this.reloadSingly();
  }

  // ─── Net ─────────────────────────────────────────────────────────────────

  protected override writeNetExtra(out: NetRecord): void {
    const o = this.owner;
    out.vmActivity = this.vmActivity;
    out.vmActivitySeq = this.vmActivitySeq;
    out.nextAttack = this.nextAttack;
    out.reloadPriorNextFire = this.reloadPriorNextFire;
    out.critBucket = this.critBucket;
    out.critChecks = this.critChecks;
    out.critRequests = this.critRequests;
    out.critTime = this.critTime;
    out.lastCritCheck = this.lastCritCheckTime;
    out.critMult = o ? critTracker(o).critMultByte : 0;
    out.effectBarRegenTime = this.effectBarRegenTime;
    out.aux4 = 0;
    out.aux5 = 0;
    out.aux6 = 0;
    out.aux7 = 0;
    this.writeWeaponNet(out);
  }

  protected override readNetExtra(rec: NetRecord): void {
    const o = this.owner;
    this.vmActivity = num(rec.vmActivity);
    this.vmActivitySeq = num(rec.vmActivitySeq);
    this.nextAttack = num(rec.nextAttack);
    this.reloadPriorNextFire = num(rec.reloadPriorNextFire);
    this.critBucket = num(rec.critBucket);
    this.critChecks = Math.max(1, num(rec.critChecks));
    this.critRequests = num(rec.critRequests);
    this.critTime = num(rec.critTime);
    this.lastCritCheckTime = num(rec.lastCritCheck);
    this.effectBarRegenTime = num(rec.effectBarRegenTime);
    if (o) {
      const tr = critTracker(o);
      tr.networked = true;
      tr.critMultByte = num(rec.critMult);
    }
    this.readWeaponNet(rec);
  }

  /** Weapon-specific prediction state into aux0–aux7. */
  protected writeWeaponNet(_out: NetRecord): void {}
  protected readWeaponNet(_rec: NetRecord): void {}

  /** Exposes the ammo slot count for subclasses' checks. */
  static readonly AMMO_SLOTS = TF_AMMO_COUNT;
  static readonly PRIMARY_SLOT = SLOT_PRIMARY;
}


/** A net value as a number (records hold number | string | boolean). */
export const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0);

/**
 * SDK: CTFPlayerShared::ConditionGameRulesThink — "airborne conditions end on
 * ground contact": TF_COND_KNOCKED_INTO_AIR and TF_COND_AIR_CURRENT (an airblast
 * sets both). Runs from the owner's active weapon frame, after movement.
 */
export function airborneCondThink(o: Player): void {
  if ((o.move.flags & FL_ONGROUND) === 0) return;
  if (o.cond.has(TF_COND.KNOCKED_INTO_AIR)) o.cond.remove(TF_COND.KNOCKED_INTO_AIR);
  o.move.conds &= ~MOVE_COND_AIR_CURRENT;
}
