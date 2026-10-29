/**
 * The player state and the per-tick rules unlock items need, from CTFPlayerShared
 * (tf_player_shared.cpp) and CTFPlayer (tf_player.cpp): stuns (StunPlayer and the stun
 * stack), bleeding (MakeBleed and its ConditionGameRulesThink tick), the rage meter and
 * buff pulses (HandleRageGain, ActivateRageBuff, UpdateRageBuffsAndRage, PulseRageBuff),
 * the Demoman's charge meter and shield charge (UpdateChargeMeter, DemoShieldChargeThink,
 * EndCharge, CalcChargeCrit), the Scout's energy drink and hype meters
 * (UpdateEnergyDrinkMeter), feign death, the conditions healing washes off faster
 * (ConditionExpiresFast), decapitations and revenge crits.
 *
 * Meters live in the player's networked `meters` (the owner predicts and the HUD reads
 * them): 0 the charge meter (m_flChargeMeter), 1 rage (m_flRageMeter), 2 the energy drink
 * (m_flEnergyDrinkMeter), 3 the secondary slot's item charge meter (m_flItemChargeMeter:
 * the Razorback, the Gas Passer). Hype is the movement state's `scoutHype`.
 *
 * Environment-agnostic and allocation-free per tick (stun and bleed records are pooled).
 */

import {
  FL_ONGROUND,
  TF_CLASS_DEMOMAN,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_PYRO,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TICK_INTERVAL,
  WL_WAIST,
} from '../../core/constants';
import { NO_ENTITY } from '../../core/types';
import { remapClamped } from '../../core/vec';
import { TF_DMG_CUSTOM } from '../../data/damage';
import { TF_COND } from '../conditions';
import { createDamageInfo, resetDamageInfo } from '../damage';
import type { MaxSpeedInput } from '../class-speeds';
import {
  MOVE_COND_CONTROL_STUNNED,
  MOVE_COND_LOSER_STUNNED,
  MOVE_COND_PARACHUTE_ACTIVE,
  MOVE_COND_PARACHUTE_DEPLOYED,
  MOVE_COND_SODAPOPPER_HYPE,
  type MoveAttributes,
} from '../movement-types';
import type { Player } from '../player';
import { GR_STATE_PREROUND } from '../rules';
import type { Weapon } from '../weapon-api';
import { hookInt, hookPlayer, hookWeapon, type AttributeSet } from './attributes';

// ─── SDK constants ─────────────────────────────────────────────────────────

/** TF_STUN_* (tf_shareddefs.h). */
export const TF_STUN_NONE = 0;
export const TF_STUN_MOVEMENT = 1 << 0;
export const TF_STUN_CONTROLS = 1 << 1;
export const TF_STUN_MOVEMENT_FORWARD_ONLY = 1 << 2;
export const TF_STUN_SPECIAL_SOUND = 1 << 3;
export const TF_STUN_DODGE_COOLDOWN = 1 << 4;
export const TF_STUN_NO_EFFECTS = 1 << 5;
export const TF_STUN_LOSER_STATE = 1 << 6;
export const TF_STUN_BY_TRIGGER = 1 << 7;
export const TF_STUN_SOUND = 1 << 8;
export const TF_STUN_BOTH = TF_STUN_MOVEMENT | TF_STUN_CONTROLS;
/** CONTROL_STUN_ANIM_TIME (tf_player_shared.h): a control stun lasts this much longer. */
export const CONTROL_STUN_ANIM_TIME = 1.5;

/** TF_BLEEDING_FREQUENCY / TF_BLEEDING_DMG (tf_shareddefs.h). */
export const TF_BLEEDING_FREQUENCY = 0.5;
export const TF_BLEEDING_DMG = 4;

/** CTFPlayerShared::m_iNextMeleeCrit (MELEE_NOCRIT / MINICRIT / CRIT). */
export const MELEE_NOCRIT = 0;
export const MELEE_MINICRIT = 1;
export const MELEE_CRIT = 2;

/** kRageBuffFlag_* and g_RageBuffTypes (tf_shareddefs.h): how each buff type earns rage. */
export const RAGE_ON_DAMAGE_DEALT = 0x01;
export const RAGE_ON_DAMAGE_RECEIVED = 0x02;
export const RAGE_ON_MEDIC_HEALING_RECEIVED = 0x04;
export const RAGE_ON_BURN_DAMAGE_DEALT = 0x08;
export const RAGE_ON_HEAL = 0x10;
export const RAGE_BUFF_TYPES: ReadonlyArray<{ flags: number; scale: number; pulses: number }> = [
  { flags: 0, scale: 0, pulses: 10 },
  { flags: RAGE_ON_DAMAGE_DEALT, scale: 1, pulses: 10 }, // 1 Buff Banner
  { flags: RAGE_ON_DAMAGE_DEALT, scale: 1, pulses: 10 }, // 2 Battalion's Backup
  { flags: RAGE_ON_DAMAGE_DEALT, scale: 1.25, pulses: 10 }, // 3 Concheror
  { flags: RAGE_ON_MEDIC_HEALING_RECEIVED, scale: 1, pulses: 10 }, // 4 (unused)
  { flags: RAGE_ON_BURN_DAMAGE_DEALT, scale: 1, pulses: 10 }, // 5 Phlogistinator
  { flags: RAGE_ON_HEAL, scale: 1, pulses: 10 }, // 6 Hitman's Heatmaker
];
/** g_SoldierBuffAttributeIDToConditionMap (tf_player_shared.cpp). */
export const SOLDIER_BUFF_CONDS: readonly number[] = [
  -1,
  TF_COND.OFFENSEBUFF,
  TF_COND.DEFENSEBUFF,
  TF_COND.REGENONDAMAGEBUFF,
  TF_COND.NOHEALINGDAMAGEBUFF,
  TF_COND.CRITBOOSTED_RAGE_BUFF,
  TF_COND.SNIPERCHARGE_RAGE_BUFF,
];
/** PulseRageBuff: the buff reaches teammates within 450 units, each pulse lasting 1.2 s. */
export const RAGE_BUFF_RADIUS = 450;
export const RAGE_BUFF_PULSE_DURATION = 1.2;
/** tf_flamethrower_flametime + 0.1: the Phlogistinator's rage cooldown after Mmmph. */
export const PYRO_RAGE_COOLDOWN = 0.5 + 0.1;

/** tf_scout_energydrink_consume_rate / _regen_rate. */
export const ENERGY_DRINK_CONSUME_RATE = 12.5;
export const ENERGY_DRINK_REGEN_RATE = 3.3;
/** tf_demoman_charge_regen_rate / tf_demoman_charge_drain_time. */
export const DEMO_CHARGE_REGEN_RATE = 8.3;
export const DEMO_CHARGE_DRAIN_TIME = 1.5;
/** CTFPlayerShared::CalculateChargeCap's base yaw cap (degrees per input frame). */
export const DEMO_CHARGE_YAW_CAP = 0.45;
/** tf_feign_death_speed_duration / tf_feign_death_duration. */
export const FEIGN_DEATH_SPEED_DURATION = 3;
/** tf_feign_death_activate_damage_scale / tf_feign_death_damage_scale / tf_stealth_damage_reduction. */
export const FEIGN_DEATH_ACTIVATE_DAMAGE_SCALE = 0.25;
export const FEIGN_DEATH_DAMAGE_SCALE = 0.35;
export const STEALTH_DAMAGE_REDUCTION = 0.8;

/** Conditions healing removes faster (ConditionExpiresFast, tf_shareddefs.cpp). */
const EXPIRES_FAST: readonly number[] = [
  TF_COND.BURNING,
  TF_COND.URINE,
  TF_COND.BLEEDING,
  TF_COND.MAD_MILK,
  TF_COND.GAS,
];

/** g_aDebuffConditions (tf_player_shared.cpp): what a shield charge (and the Quick-Fix uber) removes. */
export const DEBUFF_CONDS: readonly number[] = [
  TF_COND.BURNING,
  TF_COND.URINE,
  TF_COND.BLEEDING,
  TF_COND.MAD_MILK,
  TF_COND.GAS,
];

/** Weapon ids the player rules look items up by (Weapon_OwnsThisID). */
export const WID = {
  SNIPERRIFLE: 17,
  MINIGUN: 18,
  ROCKETLAUNCHER: 22,
  PIPEBOMBLAUNCHER: 24,
  FLAMETHROWER: 25,
  MEDIGUN: 50,
  INVIS: 57,
  FLAREGUN: 58,
  FLAREGUN_REVENGE: 84,
  LUNCHBOX: 59,
  JAR: 60,
  COMPOUND_BOW: 61,
  BUFF_ITEM: 62,
  SWORD: 64,
  LASER_POINTER: 67,
  SENTRY_REVENGE: 69,
  JAR_MILK: 70,
  HANDGUN_SCOUT_PRIMARY: 71,
  CROSSBOW: 73,
  SODA_POPPER: 76,
  SNIPERRIFLE_DECAP: 77,
  MECHANICAL_ARM: 80,
  PEP_BRAWLER_BLASTER: 85,
  CLEAVER: 86,
  CANNON: 91,
  SNIPERRIFLE_CLASSIC: 99,
  PARACHUTE: 100,
  CHARGED_SMG: 103,
  JAR_GAS: 107,
  FLAME_BALL: 109,
} as const;

// ─── The state ─────────────────────────────────────────────────────────────

/** stun_struct_t. `amount` is 0…255 as the SDK stores it. */
export class StunRecord {
  attacker = NO_ENTITY;
  duration = 0;
  expireTime = 0;
  startFadeTime = 0;
  amount = 0;
  flags = 0;
}

/** bleed_struct_t. */
export class BleedRecord {
  attacker = NO_ENTITY;
  weapon: Weapon | null = null;
  /** flBleedingTime: the next tick (the SDK seeds it with the duration, so the first tick is at once). */
  nextTime = 0;
  removeTime = 0;
  damage = TF_BLEEDING_DMG;
  permanent = false;
  customKill: number = TF_DMG_CUSTOM.TF_DMG_CUSTOM_BLEEDING;
}

/** RageBuff (CTFPlayerShared::m_RageBuffSlots). */
export class RageBuffSlot {
  buffType = 0;
  pulseCount = 0;
  nextPulseTime = 0;
}

/** What unlock items keep on a player (the CTFPlayerShared members the stock game does not need). */
export class UnlockState {
  /** m_PlayerStuns (active ones first `stunCount` entries) and m_iStunIndex. */
  readonly stuns: StunRecord[] = [];
  stunCount = 0;
  stunIndex = -1;
  /** m_PlayerBleeds. */
  readonly bleeds: BleedRecord[] = [];
  bleedCount = 0;
  /** m_iDecapitations (Eyelander heads, Bazaar Bargain heads). */
  decapitations = 0;
  /** m_iRevengeCrits (Frontier Justice, Manmelter, Diamondback). */
  revengeCrits = 0;
  /** m_iNextMeleeCrit after a shield charge; cleared 0.3 s after (RemoveMeleeCrit). */
  nextMeleeCrit = MELEE_NOCRIT;
  meleeCritClearTime = 0;
  /** m_bPostShieldCharge / m_flChargeEndTime. */
  postShieldCharge = false;
  chargeEndTime = 0;
  /** The previous command's eye yaw while charging (m_qPreviousChargeEyeAngle). */
  chargeYaw = 0;
  /** m_RageBuffSlots (kBuffSlot_Rage, kBuffSlot_Decaying), m_bRageDraining, m_flNextRageEarnTime. */
  readonly rageSlots: RageBuffSlot[] = [new RageBuffSlot(), new RageBuffSlot()];
  rageDraining = false;
  nextRageEarnTime = 0;
  /** m_bFeignDeathReady / m_flFeignDeathEnd. */
  feignDeathReady = false;
  feignDeathEnd = 0;
  /** m_pMarkedForDeathTarget: the one player our mark_for_death weapon marked. */
  markedTarget = NO_ENTITY;
  /** m_hPeeAttacker: who jarated or milked us last. */
  peeAttacker = NO_ENTITY;
  /** GetWaterExitTime: when we last left the water (crit_vs_wet_players). */
  waterExitTime = 0;
  wasInWater = false;
  /** The Razorback broke on a backstab and is recharging (hidden until OnResourceMeterFilled). */
  razorbackBroken = false;
  /** CTFWearableDemoShield::m_bImpactedSomething for the current charge. */
  shieldImpacted = false;
  /** m_bIsCalculatingMaximumSpeed: the re-entrancy guard of TeamFortress_CalculateMaxSpeed. */
  calculatingSpeed = false;
  /** m_iPhaseDamage: what Bonk! dodged (the slow when it wears off scales with it); TF_COND_PHASE last tick. */
  phaseDamage = 0;
  wasPhased = false;
  /** The Dalokohs Bar's "hidden maxhealth non buffed" custom attribute: +amount until `maxHealthBonusEnd`. */
  maxHealthBonus = 0;
  maxHealthBonusEnd = 0;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** CBaseCombatCharacter::Weapon_OwnsThisID. */
export function ownsWeaponId(p: Player, id: number): Weapon | null {
  const ws = p.weapons;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (w && w.weaponId === id) return w;
  }
  return null;
}

/** A worn weapon-slot item by item class (GetEquippedDemoShield, the Razorback …). */
export function wornItem(p: Player, itemClass: string): AttributeSet | null {
  const worn = p.wornAttributes;
  for (let i = 0; i < worn.length; i++) if (worn[i].itemClass === itemClass) return worn[i];
  return null;
}

/** CTFPlayerShared::HasDemoShieldEquipped. */
export const hasDemoShield = (p: Player): boolean => wornItem(p, 'tf_wearable_demoshield') !== null;

// ─── Stuns (CTFPlayerShared::StunPlayer) ───────────────────────────────────

const activeStun = (u: UnlockState): StunRecord | null =>
  u.stunIndex >= 0 && u.stunIndex < u.stunCount ? u.stuns[u.stunIndex] : null;

/** CTFPlayerShared::GetActiveStunInfo. */
export function activeStunInfo(p: Player): StunRecord | null {
  return activeStun(p.unlock);
}

/** SDK: CTFPlayerShared::StunPlayer — `reduction` 0…1 slows movement; flags TF_STUN_*. */
export function stunPlayer(
  p: Player,
  time: number,
  reduction: number,
  flags: number,
  attacker: Player | null,
): void {
  const u = p.unlock;
  if (u.stunCount + 1 >= 250) return;
  if (p.cond.has(TF_COND.PHASE) || p.cond.has(TF_COND.MEGAHEAL)) return;
  if (p.cond.has(TF_COND.INVULNERABLE_HIDE_UNLESS_DAMAGED)) return;
  const t = p.world.curtime;
  const amount = remapClamped(reduction, 0, 1, 0, 255);
  let stomp = false;
  const cur = activeStun(u);
  if (p.cond.has(TF_COND.STUNNED)) {
    if (cur) {
      if (amount > cur.amount || flags & TF_STUN_CONTROLS || flags & TF_STUN_LOSER_STATE)
        stomp = true;
      else if (t + time < cur.expireTime) return;
    }
  } else if (cur) {
    // Something removed TF_COND_STUNNED: start over.
    u.stunCount = 0;
    u.stunIndex = -1;
    return;
  }
  let rec = u.stuns[u.stunCount];
  if (!rec) {
    rec = new StunRecord();
    u.stuns[u.stunCount] = rec;
  }
  rec.attacker = attacker ? attacker.id : NO_ENTITY;
  rec.duration = time;
  rec.expireTime = t + time;
  rec.startFadeTime = t + time;
  rec.amount = amount;
  rec.flags = flags;
  const idx = u.stunCount++;
  if (!(stomp || !cur)) return;
  const oldAmount = cur ? cur.amount : 0;
  u.stunIndex = idx;
  if (oldAmount > amount) rec.amount = oldAmount;
  if (rec.flags & TF_STUN_CONTROLS) rec.expireTime += CONTROL_STUN_ANIM_TIME;
  rec.startFadeTime = t + rec.duration;
  if (
    rec.flags &
    (TF_STUN_SOUND | TF_STUN_SPECIAL_SOUND | TF_STUN_CONTROLS | TF_STUN_LOSER_STATE)
  ) {
    // CTFPlayer::StunSound: the big stun for the ball's full-range hit, the small one otherwise.
    const big = (rec.flags & TF_STUN_SPECIAL_SOUND) !== 0;
    p.world.emitSound(big ? 'TFPlayer.StunImpactRange' : 'TFPlayer.StunImpact', { entity: p.id });
  }
  if (rec.flags & (TF_STUN_CONTROLS | TF_STUN_LOSER_STATE)) {
    if (p.cond.has(TF_COND.TAUNTING)) p.cond.remove(TF_COND.TAUNTING);
    // OnAddStunned: a control stun ends a shield charge.
    if (p.cond.has(TF_COND.SHIELD_CHARGE)) {
      p.meters[0] = 0;
      p.cond.remove(TF_COND.SHIELD_CHARGE);
    }
  }
  p.cond.add(TF_COND.STUNNED, -1, rec.attacker);
}

/** SDK: CTFPlayerShared::GetAmountStunned (0…1). */
export function amountStunned(p: Player, flags: number): number {
  const s = activeStun(p.unlock);
  if (!s || !p.cond.has(TF_COND.STUNNED) || !(flags & s.flags) || s.expireTime <= p.world.curtime)
    return 0;
  return Math.min(Math.max(s.amount, 0), 255) / 255;
}

/** SDK: CTFPlayerShared::IsControlStunned. */
export function isControlStunned(p: Player): boolean {
  const s = activeStun(p.unlock);
  return !!s && p.cond.has(TF_COND.STUNNED) && (s.flags & TF_STUN_CONTROLS) !== 0;
}

/** SDK: CTFPlayerShared::IsLoserStateStunned. */
export function isLoserStateStunned(p: Player): boolean {
  const s = activeStun(p.unlock);
  return !!s && p.cond.has(TF_COND.STUNNED) && (s.flags & TF_STUN_LOSER_STATE) !== 0;
}

/** CTFPlayerShared::ConditionThink's stun stack: expire the active stun, then apply the strongest left. */
function stunThink(p: Player): void {
  const u = p.unlock;
  if (!p.cond.has(TF_COND.STUNNED)) {
    if (u.stunCount) {
      u.stunCount = 0;
      u.stunIndex = -1;
    }
    return;
  }
  const s = activeStun(u);
  if (!s) {
    p.cond.remove(TF_COND.STUNNED);
    return;
  }
  if (p.world.curtime <= s.expireTime) return;
  // m_PlayerStuns.Remove( m_iStunIndex ) (keeping order, records recycled).
  const removed = u.stuns[u.stunIndex];
  for (let i = u.stunIndex; i < u.stunCount - 1; i++) u.stuns[i] = u.stuns[i + 1];
  u.stuns[u.stunCount - 1] = removed;
  u.stunCount--;
  u.stunIndex = -1;
  if (u.stunCount) {
    let strongest = 0;
    for (let i = 1; i < u.stunCount; i++)
      if (u.stuns[i].amount > u.stuns[strongest].amount) strongest = i;
    u.stunIndex = strongest;
  } else p.cond.remove(TF_COND.STUNNED);
}

// ─── Bleeding (CTFPlayerShared::MakeBleed) ─────────────────────────────────

/** SDK: CTFPlayerShared::MakeBleed. */
export function makeBleed(
  victim: Player,
  attacker: Player,
  weapon: Weapon | null,
  time: number,
  damage = TF_BLEEDING_DMG,
  permanent = false,
  customKill: number = TF_DMG_CUSTOM.TF_DMG_CUSTOM_BLEEDING,
): void {
  if (!victim.alive) return;
  const u = victim.unlock;
  const expire = victim.world.curtime + time;
  for (let i = 0; i < u.bleedCount; i++) {
    const b = u.bleeds[i];
    if (b.attacker === attacker.id && b.weapon === weapon && expire > b.removeTime) {
      b.removeTime = expire;
      return;
    }
  }
  let b = u.bleeds[u.bleedCount];
  if (!b) {
    b = new BleedRecord();
    u.bleeds[u.bleedCount] = b;
  }
  b.attacker = attacker.id;
  b.weapon = weapon;
  b.nextTime = time;
  b.removeTime = expire;
  b.damage = damage;
  b.permanent = permanent;
  b.customKill = customKill;
  u.bleedCount++;
  if (!victim.cond.has(TF_COND.BLEEDING)) victim.cond.add(TF_COND.BLEEDING, -1, attacker.id);
}

// Lazily created: this module sits on the sim/damage import cycle, so no
// top-level calls into it.
let bleedInfo: ReturnType<typeof createDamageInfo> | null = null;
/** DMG_SLASH (sim/damage.ts). */
const DMG_SLASH = 1 << 2;

function removeBleed(u: UnlockState, i: number): void {
  // FastRemove: the last record takes its place.
  const last = u.bleedCount - 1;
  const tmp = u.bleeds[i];
  u.bleeds[i] = u.bleeds[last];
  u.bleeds[last] = tmp;
  tmp.weapon = null;
  u.bleedCount--;
}

/** ConditionGameRulesThink's bleed tick (DMG_SLASH every TF_BLEEDING_FREQUENCY). */
function bleedThink(p: Player): void {
  const u = p.unlock;
  if (!p.cond.has(TF_COND.BLEEDING)) {
    u.bleedCount = 0;
    return;
  }
  const t = p.world.curtime;
  for (let i = u.bleedCount - 1; i >= 0 && i < u.bleedCount; i--) {
    const b = u.bleeds[i];
    if (t >= b.removeTime && !b.permanent) removeBleed(u, i);
    else if (t >= b.nextTime) {
      b.nextTime = t + TF_BLEEDING_FREQUENCY;
      // CTakeDamageInfo( attacker, attacker, weapon, damage, DMG_SLASH, nDmgType ).
      const info = resetDamageInfo((bleedInfo ??= createDamageInfo()));
      info.attacker = b.attacker;
      info.inflictor = b.attacker;
      info.weaponId = b.weapon ? b.weapon.weaponId : 0;
      info.weaponDefIndex = b.weapon ? b.weapon.defindex : -1;
      info.killIcon = b.weapon ? b.weapon.killIcon : 'bleed_kill';
      info.damage = b.damage;
      info.damageType = DMG_SLASH;
      info.customKill = b.customKill;
      p.worldSpaceCenter(info.position);
      p.world.applyDamage(p, info);
      if (!p.alive || u.bleedCount === 0) break;
    }
  }
  if (u.bleedCount === 0 && p.alive) p.cond.remove(TF_COND.BLEEDING);
}

// ─── Rage (HandleRageGain, ActivateRageBuff, UpdateRageBuffsAndRage) ───────

/** The buff type of the player's rage item (CTFBuffItem::GetBuffType, CTFFlameThrower::GetBuffType). */
export function rageBuffType(p: Player): number {
  return hookInt(hookPlayer(p, 'set_buff_type', 0));
}

/** SDK: CTFPlayerShared::SetRageMeter. */
export function setRageMeter(p: Player, val: number): void {
  const u = p.unlock;
  if (!p.cond.has(TF_COND.SNIPERCHARGE_RAGE_BUFF) && p.playerClass !== TF_CLASS_SPY) {
    if (u.rageDraining) return;
    if (val > p.meters[1] && p.world.curtime < u.nextRageEarnTime) return;
  }
  p.meters[1] = Math.min(val, 100);
}

/** SDK: HandleRageGain (tf_player.cpp). */
export function handleRageGain(
  p: Player | null,
  flags: number,
  damage: number,
  inverseScale: number,
): void {
  if (!p || !p.alive) return;
  let item: Weapon | null = null;
  if (p.playerClass === TF_CLASS_SOLDIER) item = ownsWeaponId(p, WID.BUFF_ITEM);
  else if (p.playerClass === TF_CLASS_PYRO) item = ownsWeaponId(p, WID.FLAMETHROWER);
  if (item) {
    const id = hookInt(hookWeapon(item, p, 'set_buff_type', 0));
    const type = RAGE_BUFF_TYPES[id];
    if (id > 0 && type && type.flags & flags)
      setRageMeter(p, p.meters[1] + type.scale * (damage / inverseScale));
  }
  // Hitman's Heatmaker / generate_rage_on_dmg (Heavy, Engineer) / generate_rage_on_heal (Medic).
  if (hookInt(hookPlayer(p, 'generate_rage_on_dmg', 0)) && flags & RAGE_ON_DAMAGE_DEALT) {
    if (p.playerClass === TF_CLASS_HEAVYWEAPONS)
      setRageMeter(p, p.meters[1] + 0.22 * (damage / inverseScale));
  }
}

/** SDK: CTFPlayerShared::ActivateRageBuff. */
export function activateRageBuff(p: Player, buffType: number): void {
  if (p.meters[1] < 100 && buffType !== 6) return;
  const type = RAGE_BUFF_TYPES[buffType];
  if (!type || buffType <= 0) {
    resetRageSystem(p);
    return;
  }
  let pulses = hookPlayer(p, 'mod_buff_duration', type.pulses);
  if (buffType === 6) pulses *= p.meters[1] / 100;
  const u = p.unlock;
  u.rageDraining = true;
  const slot = u.rageSlots[0];
  slot.buffType = buffType;
  slot.pulseCount = Math.trunc(pulses);
  slot.nextPulseTime = p.world.curtime + 1;
  pulseRageBuff(p, slot);
}

/** SDK: CTFPlayerShared::PulseRageBuff — the buff condition on every teammate within reach. */
function pulseRageBuff(p: Player, slot: RageBuffSlot): void {
  const cond =
    slot.buffType > 0 && slot.buffType < SOLDIER_BUFF_CONDS.length
      ? SOLDIER_BUFF_CONDS[slot.buffType]
      : -1;
  if (cond < 0) return;
  const radius = hookPlayer(p, 'mod_soldier_buff_range', RAGE_BUFF_RADIUS);
  const r2 = radius * radius;
  const self = cond === TF_COND.CRITBOOSTED_RAGE_BUFF || cond === TF_COND.SNIPERCHARGE_RAGE_BUFF;
  const w = p.world;
  w.forEachPlayer((o) => {
    if (!o.alive || o.team !== p.team) return;
    if (o !== p && self) return;
    if (o.cond.has(TF_COND.DISGUISED) && o.disguiseTeam !== p.team) return;
    if (o.cond.has(TF_COND.STEALTHED)) return;
    const dx = o.origin.x - p.origin.x;
    const dy = o.origin.y - p.origin.y;
    const dz = o.origin.z - p.origin.z;
    if (dx * dx + dy * dy + dz * dz > r2) return;
    o.cond.add(cond, RAGE_BUFF_PULSE_DURATION, p.id);
    // OnAddSoldierOffensiveHealthRegenBuff: the Concheror's buff carries the speed boost.
    if (cond === TF_COND.REGENONDAMAGEBUFF)
      o.cond.add(TF_COND.SPEED_BOOST, RAGE_BUFF_PULSE_DURATION, p.id);
  });
}

/** SDK: CTFPlayerShared::ResetRageSystem. */
export function resetRageSystem(p: Player): void {
  const u = p.unlock;
  p.meters[1] = 0;
  u.rageDraining = false;
  u.nextRageEarnTime = 0;
  for (const s of u.rageSlots) {
    s.buffType = 0;
    s.pulseCount = 0;
    s.nextPulseTime = 0;
  }
}

/** SDK: CTFPlayerShared::UpdateRageBuffsAndRage. */
function rageThink(p: Player, dt: number): void {
  const u = p.unlock;
  if (u.rageDraining) {
    const id = rageBuffType(p);
    const type = RAGE_BUFF_TYPES[id];
    const pulses = type ? hookPlayer(p, 'mod_buff_duration', type.pulses) : 0;
    if (pulses > 0) {
      p.meters[1] -= dt * (100 / pulses);
      if (p.meters[1] <= 0) {
        p.meters[1] = 0;
        u.rageDraining = false;
        if (SOLDIER_BUFF_CONDS[id] === TF_COND.CRITBOOSTED_RAGE_BUFF)
          u.nextRageEarnTime = p.world.curtime + PYRO_RAGE_COOLDOWN;
      }
    } else resetRageSystem(p);
  }
  const t = p.world.curtime;
  for (let i = 0; i < u.rageSlots.length; i++) {
    const s = u.rageSlots[i];
    if (t > s.nextPulseTime && s.pulseCount > 0) {
      s.nextPulseTime += 1;
      s.pulseCount--;
      pulseRageBuff(p, s);
    }
  }
}

// ─── Scout drinks and hype (UpdateEnergyDrinkMeter) ────────────────────────

/** CTFPlayer::AddCustomAttribute( "hidden maxhealth non buffed", amount, duration ) (the Dalokohs Bar). */
export function setTemporaryMaxHealthBonus(p: Player, amount: number, duration: number): void {
  const u = p.unlock;
  u.maxHealthBonus = amount;
  u.maxHealthBonusEnd = p.world.curtime + duration;
  p.maxHealth = p.computeMaxHealth();
}

/** The unlock part of CTFPlayer::GetMaxHealthForBuffing (custom attributes). */
export const unlockMaxHealthBonus = (p: Player): number =>
  p.unlock.maxHealthBonus + swordHealthMod(p);

/** SDK: CTFPlayerShared::OnRemovePhase — slowed 5 s by 25 → 50 % as the dodged damage goes 10 → 200. */
function phaseThink(p: Player): void {
  const u = p.unlock;
  const phased = p.cond.has(TF_COND.PHASE);
  if (u.wasPhased && !phased) {
    if (u.phaseDamage > 0 && p.alive)
      stunPlayer(
        p,
        5,
        remapClamped(u.phaseDamage, 10, 200, 0.25, 0.5),
        TF_STUN_MOVEMENT | TF_STUN_SOUND,
        p,
      );
    u.phaseDamage = 0;
  }
  u.wasPhased = phased;
}

/** SDK: CTFSodaPopper::SecondaryAttack — a full hype meter starts the hype (five air jumps while it drains). */
export function activateSodaPopperHype(p: Player): void {
  if (isHypeBuffed(p)) return;
  if (p.move.scoutHype >= 100) p.cond.add(TF_COND.SODAPOPPER_HYPE);
}

/** MAX_DECAPITATIONS (tf_shareddefs.h): heads count for speed and health up to this. */
export const MAX_DECAPITATIONS = 4;

/** SDK: CTFSword::GetSwordHealthMod — +15 max health a head (to 4) for a Demoman's head-taking sword. */
export function swordHealthMod(p: Player): number {
  if (p.playerClass !== TF_CLASS_DEMOMAN) return 0;
  const sword = ownsWeaponId(p, WID.SWORD);
  if (!sword || hookInt(hookWeapon(sword, p, 'decapitate_type', 0)) === 0) return 0;
  return Math.min(MAX_DECAPITATIONS, p.unlock.decapitations) * 15;
}

/** CTFPlayerShared::IsHypeBuffed. */
export const isHypeBuffed = (p: Player): boolean => p.cond.has(TF_COND.SODAPOPPER_HYPE);

/** A weapon that crits on banked revenge crits (CTFWeaponBase::CanHaveRevengeCrits). */
const canHaveRevengeCrits = (w: Weapon | null): boolean =>
  !!w &&
  (w.weaponId === WID.SENTRY_REVENGE ||
    w.weaponId === WID.FLAREGUN_REVENGE ||
    hookInt(hookWeapon(w, null, 'sapper_kills_collect_crits', 0)) !== 0);

/** SDK: CTFPlayerShared::SetRevengeCrits (0…35; the crit boost follows while such a weapon is out). */
export function setRevengeCrits(p: Player, val: number): void {
  const u = p.unlock;
  u.revengeCrits = Math.min(Math.max(Math.trunc(val), 0), 35);
  if (canHaveRevengeCrits(p.activeWeapon())) {
    if (u.revengeCrits > 0 && !p.cond.has(TF_COND.CRITBOOSTED)) p.cond.add(TF_COND.CRITBOOSTED);
    else if (u.revengeCrits === 0 && p.cond.has(TF_COND.CRITBOOSTED))
      p.cond.remove(TF_COND.CRITBOOSTED);
  }
}

/** SDK: CTFPlayerShared::SetScoutHypeMeter. */
export function setScoutHypeMeter(p: Player, val: number): void {
  if (isHypeBuffed(p)) return;
  p.move.scoutHype = Math.min(Math.max(val, 0), 100);
}

function energyDrinkThink(p: Player, dt: number): void {
  if (p.playerClass !== TF_CLASS_SCOUT) return;
  if (isHypeBuffed(p)) {
    p.move.scoutHype -= dt * (ENERGY_DRINK_CONSUME_RATE * 0.75);
    if (p.move.scoutHype <= 0) {
      p.move.scoutHype = 0;
      p.cond.remove(TF_COND.SODAPOPPER_HYPE);
    }
  }
  if (p.cond.has(TF_COND.PHASE) || p.cond.has(TF_COND.ENERGY_BUFF)) {
    p.meters[2] -= dt * ENERGY_DRINK_CONSUME_RATE;
    if (p.meters[2] <= 0) {
      p.meters[2] = 0;
      p.cond.remove(TF_COND.PHASE);
      p.cond.remove(TF_COND.ENERGY_BUFF);
    }
  } else if (p.meters[2] < 100) {
    p.meters[2] += dt * ENERGY_DRINK_REGEN_RATE;
    const drink = ownsWeaponId(p, WID.LUNCHBOX);
    if (drink) {
      // "In case something replenishes grenades": a full drink resets the meter.
      if (p.meters[2] < 100 && p.ammo[5] === p.maxAmmo[5]) p.meters[2] = 100;
    } else if (p.meters[2] >= 100) p.meters[2] = 100;
  }
}

// ─── Shield charge (UpdateChargeMeter, DemoShieldChargeThink) ──────────────

function chargeThink(p: Player, dt: number): void {
  if (p.playerClass !== TF_CLASS_DEMOMAN) return;
  const u = p.unlock;
  if (p.cond.has(TF_COND.SHIELD_CHARGE)) {
    const drainTime = hookPlayer(p, 'mod_charge_time', DEMO_CHARGE_DRAIN_TIME);
    p.meters[0] -= dt * (100 / drainTime);
    if (p.meters[0] <= 0) {
      p.meters[0] = 0;
      p.cond.remove(TF_COND.SHIELD_CHARGE);
    }
  } else if (p.meters[0] < 100) {
    const regen = Math.max(hookPlayer(p, 'charge_recharge_rate', DEMO_CHARGE_REGEN_RATE), 1);
    p.meters[0] = Math.min(100, p.meters[0] + dt * regen);
  }
  // DemoShieldChargeThink.
  const t = p.world.curtime;
  if (p.cond.has(TF_COND.SHIELD_CHARGE) || u.postShieldCharge) {
    if (u.postShieldCharge && t - u.chargeEndTime >= 0.3) {
      p.cond.remove(TF_COND.CRITBOOSTED_DEMO_CHARGE);
      u.postShieldCharge = false;
    } else if (
      p.cond.has(TF_COND.SHIELD_CHARGE) &&
      p.meters[0] < 75 &&
      !p.cond.has(TF_COND.CRITBOOSTED_DEMO_CHARGE)
    ) {
      p.cond.add(TF_COND.CRITBOOSTED_DEMO_CHARGE);
    }
  }
  // CTFPlayer::RemoveMeleeCrit (a context think 0.3 s after CalcChargeCrit).
  if (u.meleeCritClearTime > 0 && t >= u.meleeCritClearTime) removeMeleeCrit(p);
}

/** SDK: CTFPlayer::RemoveMeleeCrit. */
export function removeMeleeCrit(p: Player): void {
  const u = p.unlock;
  u.nextMeleeCrit = MELEE_NOCRIT;
  u.postShieldCharge = false;
  u.meleeCritClearTime = 0;
  p.cond.remove(TF_COND.CRITBOOSTED_DEMO_CHARGE);
}

/** SDK: CTFPlayerShared::CalcChargeCrit — the melee hit that ends a charge crits by how far it ran. */
export function calcChargeCrit(p: Player, forceCrit = false): void {
  const u = p.unlock;
  const meter = p.meters[0];
  const tideTurner = hookInt(hookPlayer(p, 'lose_demo_charge_on_damage_when_charging', 0)) !== 0;
  if (tideTurner && meter <= 75) u.nextMeleeCrit = MELEE_MINICRIT;
  else if (meter <= 40 || forceCrit) u.nextMeleeCrit = MELEE_CRIT;
  else if (meter <= 75) u.nextMeleeCrit = MELEE_MINICRIT;
  u.meleeCritClearTime = p.world.curtime + 0.3;
}

/** SDK: CTFWearableDemoShield::CanCharge + DoCharge (+attack2 with a shield and a full meter). */
export function tryShieldCharge(p: Player): boolean {
  if (!hasDemoShield(p)) return false;
  const rules = p.world.rules;
  if (rules.state === GR_STATE_PREROUND) return false;
  if (rules.isHumiliated(p)) return false;
  if (p.cond.has(TF_COND.STUNNED) || p.cond.has(TF_COND.TAUNTING)) return false;
  if (p.meters[0] !== 100) return false;
  const time = hookPlayer(p, 'mod_charge_time', DEMO_CHARGE_DRAIN_TIME);
  p.cond.add(TF_COND.SHIELD_CHARGE, time);
  p.unlock.chargeYaw = p.eyeAngles.y;
  p.unlock.shieldImpacted = false;
  // OnAddShieldCharge: debuffs come off.
  for (let i = 0; i < DEBUFF_CONDS.length; i++) p.cond.remove(DEBUFF_CONDS[i]);
  if (p.cond.has(TF_COND.BURNING) === false) p.afterburnDuration = 0;
  p.world.emitSound('DemoCharge.Charging', { entity: p.id });
  return true;
}

/**
 * SDK: CTFPlayer::EndClassSpecialSkill — a melee swing ends a Demoman's shield charge (when he
 * has no stickybomb launcher, whose +attack2 the class skill would be instead).
 */
export function endClassSpecialSkill(p: Player): void {
  if (!p.alive || p.playerClass !== TF_CLASS_DEMOMAN) return;
  if (ownsWeaponId(p, WID.PIPEBOMBLAUNCHER)) return;
  endShieldChargeByAttack(p);
}

/** SDK: CTFWearableDemoShield::EndSpecialAction — swinging a melee weapon ends the charge. */
export function endShieldChargeByAttack(p: Player): void {
  if (!p.cond.has(TF_COND.SHIELD_CHARGE)) return;
  const shield = wornItem(p, 'tf_wearable_demoshield');
  if (shield && shield.apply('attack_not_cancel_charge', 0) > 0) return;
  calcChargeCrit(p);
  p.meters[0] = 0;
  p.cond.remove(TF_COND.SHIELD_CHARGE);
}

/** SDK: CTFPlayerShared::CalculateChargeCap — degrees of yaw per tick while charging. */
export function chargeYawCap(p: Player): number {
  let cap = hookPlayer(p, 'charge_turn_control', DEMO_CHARGE_YAW_CAP);
  // tf_demoman_charge_frametime_scaling: scaled by the frame time (here, the tick).
  cap *= remapClamped(TICK_INTERVAL, TICK_INTERVAL * 0.2, TICK_INTERVAL * 2, 0.25, 2);
  return cap;
}

// ─── Per tick ──────────────────────────────────────────────────────────────

/**
 * The unlock half of CTFPlayerShared::ConditionGameRulesThink + ConditionThink, run from the
 * player's per-tick think before the condition timers count down.
 */
export function unlockThink(p: Player, dt: number): void {
  const u = p.unlock;
  const t = p.world.curtime;
  // ConditionExpiresFast: healers wash debuffs off faster (urine ×(1 + n), the rest ×(1 + 4n)).
  const healers = p.healers.length;
  if (healers > 0) {
    for (let i = 0; i < EXPIRES_FAST.length; i++) {
      const c = EXPIRES_FAST[i];
      if (c === TF_COND.BURNING || !p.cond.has(c)) continue;
      const rem = p.cond.remaining[c];
      if (rem < 0) continue;
      const extra = c === TF_COND.URINE ? healers * dt : healers * dt * 4;
      p.cond.remaining[c] = Math.max(rem - extra, 1e-6);
    }
    // Bleeds run out three times as fast while healed (the SDK's flReduction of 2).
    for (let i = 0; i < u.bleedCount; i++) u.bleeds[i].removeTime -= 2 * dt;
  }
  // Water washes off jarate, milk and gas; GetWaterExitTime for the Neon Annihilator.
  const inWater = p.move.waterLevel >= WL_WAIST;
  if (inWater) {
    p.cond.remove(TF_COND.URINE);
    p.cond.remove(TF_COND.MAD_MILK);
    p.cond.remove(TF_COND.GAS);
  }
  if (u.wasInWater && p.move.waterLevel === 0) u.waterExitTime = t;
  u.wasInWater = p.move.waterLevel > 0;
  // Airborne conditions end on ground contact (the parachute's).
  if (p.move.flags & FL_ONGROUND) {
    p.move.conds &= ~(MOVE_COND_PARACHUTE_ACTIVE | MOVE_COND_PARACHUTE_DEPLOYED);
    p.cond.remove(TF_COND.PARACHUTE_ACTIVE);
    p.cond.remove(TF_COND.PARACHUTE_DEPLOYED);
  } else {
    // Mirror the movement-owned parachute bits onto the networked conditions (renderer, HUD).
    if (p.move.conds & MOVE_COND_PARACHUTE_ACTIVE) p.cond.add(TF_COND.PARACHUTE_ACTIVE);
    else p.cond.remove(TF_COND.PARACHUTE_ACTIVE);
    if (p.move.conds & MOVE_COND_PARACHUTE_DEPLOYED) p.cond.add(TF_COND.PARACHUTE_DEPLOYED);
  }
  if (p.cond.has(TF_COND.FEIGN_DEATH) && u.feignDeathEnd < t) p.cond.remove(TF_COND.FEIGN_DEATH);
  if (u.maxHealthBonus !== 0 && t >= u.maxHealthBonusEnd) {
    u.maxHealthBonus = 0;
    p.maxHealth = p.computeMaxHealth();
  }
  phaseThink(p);
  stunThink(p);
  bleedThink(p);
  if (!p.alive) return;
  rageThink(p, dt);
  energyDrinkThink(p, dt);
  chargeThink(p, dt);
  itemChargeMeterThink(p, dt);
}

/** SDK: CTFPlayerShared::UpdateItemChargeMeters (the secondary slot: Razorback, Gas Passer). */
function itemChargeMeterThink(p: Player, dt: number): void {
  const razor = wornItem(p, 'tf_wearable_razorback');
  if (razor) {
    const type = hookInt(razor.apply('item_meter_charge_type', 0));
    const rate = razor.apply('item_meter_charge_rate', 0);
    // ATTRIBUTE_METER_TYPE_TIME (1) / COMBO (3).
    if ((type === 1 || type === 3) && rate !== 0 && p.meters[3] < 100) {
      p.meters[3] = Math.min(100, p.meters[3] + (dt * 100) / rate);
      if (p.meters[3] >= 100) p.unlock.razorbackBroken = false;
    }
    return;
  }
  // The Heavy's lunch box (item_meter_charge_type 1): OnResourceMeterFilled gives it back.
  const food = p.playerClass === TF_CLASS_HEAVYWEAPONS ? ownsWeaponId(p, WID.LUNCHBOX) : null;
  if (food) {
    const type = hookInt(hookWeapon(food, p, 'item_meter_charge_type', 0));
    const rate = hookWeapon(food, p, 'item_meter_charge_rate', 0);
    if ((type === 1 || type === 3) && rate !== 0 && p.meters[3] < 100) {
      p.meters[3] = Math.min(100, p.meters[3] + (dt * 100) / rate);
      if (p.meters[3] >= 100) p.giveAmmo(1, food.ammoType);
    }
    return;
  }
  const gas = ownsWeaponId(p, WID.JAR_GAS);
  if (gas) {
    const type = hookInt(hookWeapon(gas, p, 'item_meter_charge_type', 0));
    const rate = hookWeapon(gas, p, 'item_meter_charge_rate', 0);
    if ((type === 1 || type === 3) && rate !== 0 && p.meters[3] < 100) {
      p.meters[3] = Math.min(
        100,
        p.meters[3] + (dt * 100 * hookWeapon(gas, p, 'mult_item_meter_charge_rate', 1)) / rate,
      );
      // CTFJarGas::OnResourceMeterFilled: one more can.
      if (p.meters[3] >= 100) p.giveAmmo(1, gas.ammoType);
    }
  }
}

/** Movement conditions unlocks own (stuns, hype); the game recomputes them every command. */
export const UNLOCK_MOVE_CONDS =
  MOVE_COND_CONTROL_STUNNED | MOVE_COND_LOSER_STUNNED | MOVE_COND_SODAPOPPER_HYPE;

/**
 * What movement reads from unlocks (CTFGameMovement's GetAmountStunned / IsControlStunned /
 * InCond(TF_COND_SODAPOPPER_HYPE), and the CALL_ATTRIB_HOOK_*s on movement attributes):
 * returns the MOVE_COND_* bits and writes the stun amount and attributes into the move state.
 */
export function unlockMoveInputs(p: Player): number {
  const m = p.move;
  let conds = 0;
  if (isControlStunned(p)) conds |= MOVE_COND_CONTROL_STUNNED;
  if (isLoserStateStunned(p)) conds |= MOVE_COND_LOSER_STUNNED;
  if (p.cond.has(TF_COND.SODAPOPPER_HYPE)) conds |= MOVE_COND_SODAPOPPER_HYPE;
  m.stunAmount = amountStunned(p, TF_STUN_MOVEMENT);
  const s = activeStun(p.unlock);
  m.stunForwardOnly =
    !!s && p.cond.has(TF_COND.STUNNED) && (s.flags & TF_STUN_MOVEMENT_FORWARD_ONLY) !== 0;
  writeMoveAttributes(p, m.attrs);
  return conds;
}

/** The movement attributes from items (TF movement's CALL_ATTRIB_HOOK_* reads). */
function writeMoveAttributes(p: Player, a: MoveAttributes): void {
  const w = p.activeWeapon();
  // CTFGameMovement: mod_jump_height on the player, mod_jump_height_from_weapon on the active weapon.
  a.jumpHeightMod =
    hookPlayer(p, 'mod_jump_height', 1) *
    (w ? hookWeapon(w, null, 'mod_jump_height_from_weapon', 1) : 1);
  a.airControlMod = hookPlayer(p, 'mod_air_control', 1);
  a.blastJumpAirControlMod = hookPlayer(p, 'mod_air_control_blast_jump', 1);
  // tf_scout_air_dash_count + air_dash_count (the Atomizer, on the active weapon).
  a.airDashCount = 1 + (w ? hookInt(hookWeapon(w, null, 'air_dash_count', 0)) : 0);
  a.airDashDisabled = hookInt(hookPlayer(p, 'set_scout_doublejump_disabled', 0)) !== 0;
  // CTFPlayer::CanJump: no_jump, and the active weapon's OwnerCanJump (a drawn bow).
  const ownerCanJump = w as (Weapon & { ownerCanJump?: () => boolean }) | null;
  a.noJump =
    hookInt(hookPlayer(p, 'no_jump', 0)) !== 0 ||
    (ownerCanJump?.ownerCanJump ? !ownerCanJump.ownerCanJump() : false);
  a.noDuck = hookInt(hookPlayer(p, 'no_duck', 0)) !== 0;
  a.hypeResetsOnJump = hookPlayer(p, 'hype_resets_on_jump', 0);
  // The B.A.S.E. Jumper (parachute_attribute on the worn-or-held parachute).
  a.parachute = hookInt(hookPlayer(p, 'parachute_attribute', 0)) !== 0;
  a.parachuteDisabled = hookInt(hookPlayer(p, 'parachute_disabled', 0)) !== 0;
}

/** The unlock inputs of TeamFortress_CalculateMaxSpeed. */
export function unlockSpeedInputs(p: Player, s: MaxSpeedInput): void {
  const w = p.activeWeapon();
  s.healTargetMaxSpeed = undefined;
  s.aimingWithBow = !!w && w.weaponId === WID.COMPOUND_BOW;
  const sword = p.playerClass === TF_CLASS_DEMOMAN ? ownsWeaponId(p, WID.SWORD) : null;
  s.swordSpeedMod = sword ? swordSpeedMod(p, sword) : 1;
  s.heavyEnergyBuff = p.playerClass === TF_CLASS_HEAVYWEAPONS && p.cond.has(TF_COND.ENERGY_BUFF);
  s.babyFaceHype =
    p.playerClass === TF_CLASS_SCOUT && ownsWeaponId(p, WID.PEP_BRAWLER_BLASTER)
      ? p.move.scoutHype
      : undefined;
  s.loserStunned = isLoserStateStunned(p);
  // CTFPlayer::CanPlayerMove: not while taunting (eating, drinking).
  if (p.cond.has(TF_COND.TAUNTING)) s.canMove = false;
  const st = activeStun(p.unlock);
  s.stunByTrigger = !!st && (st.flags & TF_STUN_BY_TRIGGER) !== 0;
  // mult_player_movespeed_shieldrequired (Ali Baba's Wee Booties, the Bootlegger).
  if (hasDemoShield(p))
    s.moveSpeedMult =
      (s.moveSpeedMult ?? 1) * hookPlayer(p, 'mult_player_movespeed_shieldrequired', 1);
  // Medics match their heal target's speed (a Quick-Fix keeps up with a charging Demoman).
  if (p.playerClass === 5 && w && w.weaponId === WID.MEDIGUN) {
    const target = p.world.entity(p.healTarget);
    if (target && target.isPlayer() && target !== p) {
      const tp = target as Player;
      const quickFix =
        hookInt(hookWeapon(w, p, 'set_charge_type', 0)) === 2 ||
        hookInt(hookWeapon(w, p, 'set_weapon_mode', 0)) === 2;
      if (quickFix && tp.cond.has(TF_COND.SHIELD_CHARGE)) s.healTargetMaxSpeed = 750;
      else if (!tp.unlock.calculatingSpeed) {
        // pHealTarget->TeamFortress_CalculateMaxSpeed( true ), guarded against two medics healing each other.
        p.unlock.calculatingSpeed = true;
        s.healTargetMaxSpeed = tp.computeMaxSpeed();
        p.unlock.calculatingSpeed = false;
      }
    }
  }
}

/** SDK: CTFSword::GetSwordSpeedMod — 8 % per head up to 4 heads, for swords that take heads. */
export function swordSpeedMod(p: Player, sword: Weapon): number {
  if (hookInt(hookWeapon(sword, p, 'decapitate_type', 0)) === 0) return 1;
  return 1 + Math.min(p.unlock.decapitations, 4) * 0.08;
}

/** The weapon a sniper rifle or the Huntsman lit (fire arrows) — for the kill icon of afterburn. */
export function burnKillType(weapon: Weapon | null): number {
  if (!weapon) return TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING;
  if (weapon.weaponId === WID.FLAREGUN) return TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING_FLARE;
  if (weapon.weaponId === WID.COMPOUND_BOW) return TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING_ARROW;
  return TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING;
}

// ─── Spawn, resupply, death ────────────────────────────────────────────────

/**
 * SDK: CTFPlayerShared::Spawn / SetDefaultItemChargeMeters and CTFPlayer::Regenerate's meters:
 * the charge meter and the drink start full, rage and hype at zero (kept through a resupply,
 * lost on death), the item charge meter at the item's default.
 */
export function resetUnlockMeters(p: Player, spawn: boolean): void {
  const u = p.unlock;
  p.meters[0] = 100;
  p.meters[2] = 100;
  // The Razorback starts up (item_meter_resupply_denied is not on it), the Gas Passer empty.
  // SetDefaultItemChargeMeters: the Razorback starts up, the Gas Passer empty (GetDefaultItemChargeMeterValue 0) —
  // and a resupply leaves its meter alone (item_meter_resupply_denied).
  const gas = ownsWeaponId(p, WID.JAR_GAS);
  if (wornItem(p, 'tf_wearable_razorback')) p.meters[3] = 100;
  else if (gas) {
    if (spawn || !hookInt(hookWeapon(gas, p, 'item_meter_resupply_denied', 0))) p.meters[3] = 0;
  } else p.meters[3] = 100;
  u.razorbackBroken = false;
  if (spawn) {
    resetRageSystem(p);
    p.move.scoutHype = 0;
    u.decapitations = 0;
    u.revengeCrits = 0;
    u.stunCount = 0;
    u.stunIndex = -1;
    u.bleedCount = 0;
    u.nextMeleeCrit = MELEE_NOCRIT;
    u.meleeCritClearTime = 0;
    u.postShieldCharge = false;
    u.feignDeathReady = false;
    u.feignDeathEnd = 0;
    u.peeAttacker = NO_ENTITY;
    u.phaseDamage = 0;
    u.wasPhased = false;
    u.maxHealthBonus = 0;
    u.maxHealthBonusEnd = 0;
  }
}

/** The owner died: everything per-life goes (Event_Killed → RemoveAllCond, ResetRageSystem). */
export function onUnlockOwnerDied(p: Player): void {
  const u = p.unlock;
  resetRageSystem(p);
  u.stunCount = 0;
  u.stunIndex = -1;
  for (let i = 0; i < u.bleedCount; i++) u.bleeds[i].weapon = null;
  u.bleedCount = 0;
  u.nextMeleeCrit = MELEE_NOCRIT;
  u.meleeCritClearTime = 0;
  u.postShieldCharge = false;
  u.feignDeathReady = false;
  u.decapitations = 0;
  u.revengeCrits = 0;
  u.phaseDamage = 0;
  u.maxHealthBonus = 0;
  p.move.scoutHype = 0;
}

// ─── Network (the owner's private player record: prediction and the HUD) ───

/**
 * The unlock state the owner predicts and the HUD shows, in one u32: heads (8 bits), revenge crits
 * (6), the next melee crit (2), the Dead Ringer armed (1), the Razorback broken (1), rage draining (1).
 */
export function packUnlockNet(p: Player): number {
  const u = p.unlock;
  return (
    (Math.min(u.decapitations, 255) & 0xff) |
    ((Math.min(u.revengeCrits, 63) & 0x3f) << 8) |
    ((u.nextMeleeCrit & 3) << 14) |
    (u.feignDeathReady ? 1 << 16 : 0) |
    (u.razorbackBroken ? 1 << 17 : 0) |
    (u.rageDraining ? 1 << 18 : 0)
  );
}

/** The inverse of packUnlockNet (client prediction restore). */
export function unpackUnlockNet(p: Player, v: number): void {
  const u = p.unlock;
  u.decapitations = v & 0xff;
  u.revengeCrits = (v >>> 8) & 0x3f;
  u.nextMeleeCrit = (v >>> 14) & 3;
  u.feignDeathReady = (v & (1 << 16)) !== 0;
  u.razorbackBroken = (v & (1 << 17)) !== 0;
  u.rageDraining = (v & (1 << 18)) !== 0;
}

// Sniper-class constant exported for the rules that check it.
export const UNLOCK_CLASS = { SNIPER: TF_CLASS_SNIPER, SPY: TF_CLASS_SPY } as const;

/** CTFPlayerShared::Burn's afterburn immunity: the active weapon, a shield, a Sniper's wearable, TF_COND_AFTERBURN_IMMUNE. */
export function afterburnImmune(p: Player): boolean {
  if (p.cond.has(TF_COND.AFTERBURN_IMMUNE)) return true;
  const w = p.activeWeapon();
  if (w && hookInt(hookWeapon(w, null, 'afterburn_immunity', 0)) !== 0) return true;
  const worn = p.wornAttributes;
  for (let i = 0; i < worn.length; i++) {
    const a = worn[i];
    if (a.itemClass === 'tf_wearable_demoshield' || p.playerClass === TF_CLASS_SNIPER) {
      if (hookInt(a.apply('afterburn_immunity', 0)) !== 0) return true;
    }
  }
  return false;
}

/**
 * Before a command runs (CTFPlayerMove::SetupMove): a charging Demoman's yaw turns at most
 * CalculateChargeCap per tick (the client's CAM_CapYaw, enforced on the command itself so the
 * server and the predicting client agree).
 */
export function unlockPreCommand(p: Player, cmd: { viewAngles: { y: number } }): void {
  const u = p.unlock;
  if (!p.cond.has(TF_COND.SHIELD_CHARGE)) {
    u.chargeYaw = cmd.viewAngles.y;
    return;
  }
  const cap = chargeYawCap(p);
  let d = cmd.viewAngles.y - u.chargeYaw;
  d -= 360 * Math.round(d / 360);
  if (d > cap) d = cap;
  else if (d < -cap) d = -cap;
  cmd.viewAngles.y = u.chargeYaw + d;
  u.chargeYaw = cmd.viewAngles.y;
}

/** SDK: CTFPlayerShared::OnAttack — Crit-a-Cola marks its drinker for death when he attacks. */
export function onAttack(p: Player): void {
  if (!p.cond.has(TF_COND.ENERGY_BUFF)) return;
  const t = hookPlayer(p, 'mod_mark_attacker_for_death', 1);
  if (t > 1) p.cond.add(TF_COND.MARKEDFORDEATH_SILENT, t);
}
