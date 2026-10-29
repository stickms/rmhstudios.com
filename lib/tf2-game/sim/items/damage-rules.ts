/**
 * The damage rules unlock items bring, each at the place the SDK runs it:
 *
 *   - CTFGameRules::ApplyOnDamageModifyRules — forced crits (or_crit_vs_playercond,
 *     crit_vs_wet_players, axtinguisher_properties, crit_while_airborne), the mini-crit
 *     sources (attack_minicrits_and_consumes_burning, flares on burning targets, the Loose
 *     Cannon's double donk, the Atomizer's air jump, Sydney Sleeper headshots,
 *     or_minicrit_vs_playercond_burning, closerange_backattack_minicrits, charged Cow
 *     Mangler shots, long-range cleavers), minicrits_become_crits, damage against the same
 *     class or non-burning targets, crit_dmg_falloff, crits_become_minicrits, the energy
 *     buff's damage taken, cloak on hit and backstab shields (CheckBlockBackstab);
 *   - CTFPlayer::OnTakeDamage / OnTakeDamage_Alive — Bonk!'s phase, bleeding from
 *     bleeding_duration, rage from damage (HandleRageGain), hype lost on taking damage, the
 *     Tide Turner's charge loss, gas igniting, the Dead Ringer's feign death, Sydney Sleeper
 *     jarate, the Spy-cicle's fire immunity;
 *   - CTFPlayer::Event_KilledOther — the killing weapon's OnPlayerKill, kill crit boosts,
 *     kill_refills_meter, rage_on_kill.
 *
 * Environment-agnostic.
 */

import { HITGROUP_HEAD } from '../../core/types';
import {
  FL_ONGROUND,
  TF_CLASS_DEMOMAN,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_PYRO,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SPY,
  MASK_SOLID,
} from '../../core/constants';
import { emptyTrace } from '../../core/types';
import { angleVectors, vec3 } from '../../core/vec';
import { TF_DEATH_FEIGN_DEATH } from '../events';
import { COLLISION_GROUP_NONE } from '../entity';
import { remapClamped } from '../../core/vec';
import { TF_DMG_CUSTOM } from '../../data/damage';
import { TF_COND } from '../conditions';
import {
  applyPushFromDamage,
  CRIT_FULL,
  CRIT_MINI,
  CRIT_NONE,
  DMG_BLAST,
  DMG_BURN,
  DMG_CRITICAL,
  DMG_FALL,
  DMG_IGNITE,
  DMG_IGNORE_MAXHEALTH,
  DMG_MELEE,
  DMG_PLASMA,
  createDamageInfo,
  isHeadshot,
  resetDamageInfo,
  TF_DMG_CUSTOM_BACKSTAB,
  type DamageInfo,
} from '../damage';
import type { Entity } from '../entity';
import type { Player } from '../player';
import type { Weapon } from '../weapon-api';
import type { GameWorld } from '../world';
import { hookInt, hookPlayer, hookWeapon } from './attributes';
import {
  calcChargeCrit,
  FEIGN_DEATH_SPEED_DURATION,
  handleRageGain,
  makeBleed,
  ownsWeaponId,
  RAGE_ON_BURN_DAMAGE_DEALT,
  RAGE_ON_DAMAGE_DEALT,
  RAGE_ON_DAMAGE_RECEIVED,
  setRageMeter,
  setScoutHypeMeter,
  stunPlayer,
  TF_STUN_MOVEMENT,
  WID,
  wornItem,
} from './effects';
import { damageWeapon, inAirDueToExplosion } from './hooks';

/** condition_to_attribute_translation (tf_shareddefs.cpp): or_crit_vs_playercond's bits. */
const CRIT_VS_COND: readonly number[] = [
  TF_COND.BURNING,
  TF_COND.AIMING,
  TF_COND.ZOOMED,
  TF_COND.DISGUISING,
  TF_COND.DISGUISED,
  TF_COND.STEALTHED,
  TF_COND.INVULNERABLE,
  TF_COND.TELEPORTED,
  TF_COND.TAUNTING,
  TF_COND.INVULNERABLE_WEARINGOFF,
  TF_COND.STEALTHED_BLINK,
  TF_COND.SELECTED_TO_TELEPORT,
  TF_COND.CRITBOOSTED,
  TF_COND.TMPDAMAGEBONUS,
  TF_COND.FEIGN_DEATH,
  TF_COND.PHASE,
  TF_COND.STUNNED,
  TF_COND.HEALTH_BUFF,
  TF_COND.HEALTH_OVERHEALED,
  TF_COND.URINE,
  TF_COND.ENERGY_BUFF,
];

/** IsDOTDmg (tf_shareddefs.h). */
export const isDotDamage = (custom: number): boolean =>
  custom === TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING ||
  custom === TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING_FLARE ||
  custom === TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING_ARROW ||
  custom === TF_DMG_CUSTOM.TF_DMG_CUSTOM_BLEEDING;

/** tf_dev_marked_for_death_lifetime / tf_dev_health_on_damage_recover_percentage. */
export const MARKED_FOR_DEATH_LIFETIME = 15;
export const HEALTH_ON_DAMAGE_RECOVER = 0.35;

/** A weapon with behaviour on a kill it made (CTFWeaponBase::OnPlayerKill). */
export interface KillAwareWeapon {
  onPlayerKill(victim: Player, info: DamageInfo): void;
}
const isKillAware = (w: unknown): w is KillAwareWeapon =>
  typeof (w as Partial<KillAwareWeapon> | null)?.onPlayerKill === 'function';

/** A weapon whose double donk window ApplyOnDamageModifyRules asks about (CTFGrenadeLauncher::IsDoubleDonk). */
export interface DoubleDonkWeapon {
  isDoubleDonk(victim: Entity): boolean;
}

/** The victim's back faces the attacker (the Axtinguisher / Back Scatter / Backburner test, 2D). */
export function behindVictim(attacker: Player, victim: Player, dot: number): boolean {
  let x = victim.origin.x - attacker.origin.x;
  let y = victim.origin.y - attacker.origin.y;
  const len = Math.hypot(x, y);
  if (len > 0) {
    x /= len;
    y /= len;
  }
  const yaw = (victim.eyeAngles.y * Math.PI) / 180;
  const pitch = (victim.eyeAngles.x * Math.PI) / 180;
  const fx = Math.cos(pitch) * Math.cos(yaw);
  const fy = Math.cos(pitch) * Math.sin(yaw);
  return x * fx + y * fy > dot;
}

// ─── CTFGameRules::ApplyOnDamageModifyRules ────────────────────────────────

/** The forced-crit block before the mini-crit checks. */
export function unlockForcedCrits(
  world: GameWorld,
  info: DamageInfo,
  victim: Player | null,
  attacker: Player | null,
): void {
  const weapon = damageWeapon(world, info);
  if (!weapon) return;
  const owner = weapon.owner;
  const setCrit = (): void => {
    info.damageType |= DMG_CRITICAL;
    info.critType = CRIT_FULL;
  };
  if (victim) {
    const condBits = hookInt(hookWeapon(weapon, owner, 'or_crit_vs_playercond', 0));
    if (condBits) {
      for (let i = 0; i < CRIT_VS_COND.length; i++) {
        if (condBits & (1 << i) && victim.cond.has(CRIT_VS_COND[i])) {
          setCrit();
          break;
        }
      }
    }
    if (hookInt(hookWeapon(weapon, owner, 'crit_vs_wet_players', 0))) {
      const exit = victim.unlock.waterExitTime;
      if (
        victim.cond.has(TF_COND.URINE) ||
        victim.cond.has(TF_COND.MAD_MILK) ||
        victim.cond.has(TF_COND.GAS) ||
        victim.move.waterLevel > 0 ||
        (exit > 0 && world.curtime - exit < 5)
      )
        setCrit();
    }
    const notBits = hookInt(hookWeapon(weapon, owner, 'or_crit_vs_not_playercond', 0));
    if (notBits) {
      for (let i = 0; i < CRIT_VS_COND.length; i++) {
        if (notBits & (1 << i) && !victim.cond.has(CRIT_VS_COND[i])) {
          setCrit();
          break;
        }
      }
    }
    if (
      attacker &&
      hookInt(hookWeapon(weapon, owner, 'axtinguisher_properties', 0)) &&
      victim.cond.has(TF_COND.BURNING)
    ) {
      if (behindVictim(attacker, victim, 0)) setCrit();
      else info.critType = CRIT_MINI;
    }
  }
  // crit_while_airborne (the Market Gardener): only while rocket jumping.
  if (
    attacker &&
    hookInt(hookWeapon(weapon, owner, 'crit_while_airborne', 0)) &&
    inAirDueToExplosion(attacker)
  )
    setCrit();
}

/**
 * The unlock mini-crit sources, after the stock ones (the victim's jarate / marks, the
 * attacker's buffs). Returns the damage (the Axtinguisher adds to it, a double donk takes
 * the shot's maximum).
 */
export function unlockMiniCrits(
  world: GameWorld,
  info: DamageInfo,
  victim: Player | null,
  attacker: Player | null,
  damage: number,
): number {
  const weapon = damageWeapon(world, info);
  // attack_minicrits_and_consumes_burning (the Axtinguisher family, on the active melee weapon).
  if (
    weapon &&
    attacker &&
    victim &&
    victim.cond.has(TF_COND.BURNING) &&
    info.damageType & DMG_MELEE
  ) {
    const active = attacker.activeWeapon();
    if (
      active === weapon &&
      hookInt(hookWeapon(active, attacker, 'attack_minicrits_and_consumes_burning', 0))
    ) {
      damage += remapClamped(victim.afterburnDuration, 0.5, 10, 20, 4 * 20);
      victim.extinguish();
      world.emitSound('TFPlayer.FlameOut', { entity: victim.id });
      if (info.critType === CRIT_NONE) info.critType = CRIT_MINI;
      info.customKill = TF_DMG_CUSTOM.TF_DMG_CUSTOM_AXTINGUISHER_BOOSTED;
    }
  }
  if (info.critType !== CRIT_NONE) return damage;
  if (info.customKill === TF_DMG_CUSTOM.TF_DMG_CUSTOM_PLASMA_CHARGED) info.critType = CRIT_MINI;
  else if (info.customKill === TF_DMG_CUSTOM.TF_DMG_CUSTOM_CLEAVER_CRIT) info.critType = CRIT_MINI;
  else if (
    info.damageType & DMG_IGNITE &&
    victim?.cond.has(TF_COND.BURNING) &&
    info.customKill === TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING_FLARE &&
    weapon?.weaponId === WID.FLAREGUN
  )
    // A flare (not the Manmelter, a FLAREGUN_GRORDBORT … which is its own weapon id) on a burning target.
    info.critType = CRIT_MINI;
  else if (attacker && weapon?.weaponId === WID.CANNON && info.damageType & DMG_BLAST && victim) {
    const gl = weapon as unknown as Partial<DoubleDonkWeapon>;
    if (gl.isDoubleDonk?.(victim)) {
      info.critType = CRIT_MINI;
      damage = Math.max(damage, info.maxDamage);
    }
  } else if (
    attacker &&
    attacker.playerClass === TF_CLASS_SCOUT &&
    !(attacker.move.flags & FL_ONGROUND)
  ) {
    // The Atomizer's extra jump mini-crits while airborne (air_dash_count on the active weapon).
    if (
      weapon &&
      weapon === attacker.activeWeapon() &&
      hookInt(hookWeapon(weapon, null, 'air_dash_count', 0))
    )
      info.critType = CRIT_MINI;
  } else if (
    victim &&
    attacker &&
    attacker.playerClass === TF_CLASS_SNIPER &&
    weapon &&
    isSniperRifleWeapon(weapon)
  ) {
    // Sydney Sleeper: a jarate headshot mini-crits.
    if (isHeadshot(info.customKill) || info.hitGroup === HITGROUP_HEAD) {
      const rifle = weapon as Weapon & { isZoomed?: () => boolean; jarateTime?: () => number };
      if (rifle.isZoomed?.() && (rifle.jarateTime?.() ?? 0) >= 1) info.critType = CRIT_MINI;
    }
  }
  if (info.critType === CRIT_NONE && weapon) {
    const owner = weapon.owner;
    if (
      hookInt(hookWeapon(weapon, owner, 'or_minicrit_vs_playercond_burning', 0)) === 1 &&
      victim?.cond.has(TF_COND.BURNING) &&
      !(info.damageType & DMG_BURN)
    )
      info.critType = CRIT_MINI;
  }
  // closerange_backattack_minicrits (the Back Scatter): within 512 from behind, a 150° cone.
  if (
    info.critType === CRIT_NONE &&
    weapon &&
    attacker &&
    victim &&
    hookInt(hookWeapon(weapon, weapon.owner, 'closerange_backattack_minicrits', 0)) === 1
  ) {
    const dx = victim.origin.x - attacker.origin.x;
    const dy = victim.origin.y - attacker.origin.y;
    const dz = victim.origin.z - attacker.origin.z;
    if (dx * dx + dy * dy + dz * dz < 512 * 512 && behindVictim(attacker, victim, 0.259))
      info.critType = CRIT_MINI;
  }
  return damage;
}

/** minicrits_become_crits (the Bushwacka, the Fan O'War). */
export function unlockPromoteMiniCrit(world: GameWorld, info: DamageInfo): void {
  if (info.critType !== CRIT_MINI) return;
  const weapon = damageWeapon(world, info);
  if (weapon && hookInt(hookWeapon(weapon, weapon.owner, 'minicrits_become_crits', 0)) === 1) {
    info.critType = CRIT_FULL;
    info.damageType |= DMG_CRITICAL;
  }
}

/** After mult_dmg_vs_players: mult_dmg_vs_same_class, set_nocrit_vs_nonburning, mult_dmg_vs_nonburning. */
export function unlockDamageVsPlayers(
  world: GameWorld,
  info: DamageInfo,
  victim: Player,
  attacker: Player | null,
  damage: number,
): number {
  const weapon = damageWeapon(world, info);
  if (!weapon) return damage;
  if (attacker && victim.playerClass === attacker.playerClass)
    damage = hookWeapon(weapon, weapon.owner, 'mult_dmg_vs_same_class', damage);
  if (!victim.cond.has(TF_COND.BURNING)) {
    if (info.damageType & DMG_CRITICAL && attacker && !attacker.cond.critBoosted) {
      if (hookInt(hookWeapon(weapon, weapon.owner, 'set_nocrit_vs_nonburning', 0))) {
        info.damageType &= ~DMG_CRITICAL;
        info.critType = CRIT_NONE;
      }
    }
    damage = hookWeapon(weapon, weapon.owner, 'mult_dmg_vs_nonburning', damage);
  }
  return damage;
}

/**
 * Before the distance and crit maths: crits_become_minicrits demotes a crit (lambdaDoMinicrit),
 * and crit_dmg_falloff (the Ambassador) keeps the distance falloff on a crit. Returns that flag.
 */
export function unlockPreDistance(world: GameWorld, info: DamageInfo): boolean {
  const weapon = damageWeapon(world, info);
  if (!weapon) return false;
  if (
    (info.critType === CRIT_FULL || info.damageType & DMG_CRITICAL) &&
    info.critType !== CRIT_MINI
  ) {
    if (hookInt(hookWeapon(weapon, weapon.owner, 'crits_become_minicrits', 0)) !== 0) {
      info.damageType &= ~DMG_CRITICAL;
      info.critType = CRIT_MINI;
    }
  }
  return hookInt(hookWeapon(weapon, weapon.owner, 'crit_dmg_falloff', 0)) !== 0;
}

/** Crit-a-Cola and the Buffalo Steak: energy_buff_dmg_taken_multiplier on non-crit damage taken. */
export function unlockEnergyBuffDamageTaken(
  victim: Player | null,
  info: DamageInfo,
  damage: number,
): number {
  if (!victim || !victim.cond.has(TF_COND.ENERGY_BUFF) || info.critType !== CRIT_NONE)
    return damage;
  return hookPlayer(victim, 'energy_buff_dmg_taken_multiplier', damage);
}

/** After the damage is final: add_cloak_on_hit, jarate_backstabber, CheckBlockBackstab. */
export function unlockPostModify(
  world: GameWorld,
  info: DamageInfo,
  victim: Player | null,
  attacker: Player | null,
  damage: number,
): number {
  if (attacker && attacker.playerClass === TF_CLASS_SPY) {
    const active = attacker.activeWeapon();
    const cloak = active ? hookInt(hookWeapon(active, attacker, 'add_cloak_on_hit', 0)) : 0;
    if (cloak > 0) attacker.cloakMeter = Math.min(100, attacker.cloakMeter + cloak);
  }
  if (info.customKill === TF_DMG_CUSTOM_BACKSTAB && victim) {
    if (attacker && hookInt(hookPlayer(victim, 'jarate_backstabber', 0)) > 0) {
      attacker.cond.add(TF_COND.URINE, 10, victim.id);
      attacker.unlock.peeAttacker = victim.id;
    }
    if (checkBlockBackstab(victim)) {
      damage = 0;
      world.emitSound('Player.Spy_Shield_Break', { entity: victim.id });
      const rifle = victim.activeWeapon() as
        (Weapon & { isZoomed?: () => boolean; zoomOut?: () => void }) | null;
      if (rifle?.isZoomed?.()) rifle.zoomOut?.();
      const knife = attacker?.activeWeapon() as (Weapon & { backstabBlocked?: () => void }) | null;
      knife?.backstabBlocked?.();
    }
  }
  return damage;
}

/**
 * SDK: CTFPlayer::CheckBlockBackstab — a worn set_blockbackstab_once item (the Razorback) takes
 * the stab when its meter is full, then breaks and recharges.
 */
export function checkBlockBackstab(victim: Player): boolean {
  const razor = wornItem(victim, 'tf_wearable_razorback');
  if (!razor || hookInt(razor.apply('set_blockbackstab_once', 0)) === 0) return false;
  const type = hookInt(razor.apply('item_meter_charge_type', 0));
  if (type !== 0 && victim.meters[3] < 100) return false;
  victim.meters[3] = 0;
  victim.unlock.razorbackBroken = true;
  return true;
}

const isSniperRifleWeapon = (w: Weapon): boolean =>
  w.weaponId === WID.SNIPERRIFLE ||
  w.weaponId === WID.SNIPERRIFLE_DECAP ||
  w.weaponId === WID.SNIPERRIFLE_CLASSIC;

// ─── CTFPlayer::OnTakeDamage ───────────────────────────────────────────────

/** Bonk!'s phase (TF_COND_PHASE): the hit does no damage, but still pushes, and the shooter sees "miss". */
export function unlockPreventsDamage(
  victim: Player,
  info: DamageInfo,
  inflictor: Entity | null,
  dir: { x: number; y: number; z: number },
): boolean {
  if (!victim.cond.has(TF_COND.PHASE)) return false;
  const attacker = victim.world.entity(info.attacker);
  if (attacker && attacker.isPlayer()) {
    victim.world.emitEffect({
      kind: 'particle',
      system: 'miss_text',
      pos: {
        x: victim.origin.x,
        y: victim.origin.y,
        z: victim.origin.z + victim.maxs.z * 0.5 + 32,
      },
      to: attacker.id,
    });
  }
  if (inflictor) applyPushFromDamage(victim, info, dir as never);
  victim.unlock.phaseDamage += info.damage;
  return true;
}

/** The unlock reactions to a hit that removed health (`removed`), before the death check. */
export function unlockOnDamaged(
  victim: Player,
  attackerEnt: Entity | null,
  info: DamageInfo,
  removed: number,
): void {
  const world = victim.world;
  const attacker = attackerEnt && attackerEnt.isPlayer() ? (attackerEnt as Player) : null;
  const weapon = damageWeapon(world, info);
  const selfBlast = attacker === victim && (info.damageType & DMG_BLAST) !== 0;
  // OnTakeDamage_Alive: bleeding_duration on the weapon that hit.
  if (
    attacker &&
    attacker !== victim &&
    weapon &&
    info.customKill !== TF_DMG_CUSTOM.TF_DMG_CUSTOM_BLEEDING &&
    !selfBlast
  ) {
    const bleed = hookWeapon(weapon, weapon.owner, 'bleeding_duration', 0);
    if (bleed > 0) makeBleed(victim, attacker, weapon, bleed);
  }
  // The Tide Turner: damage taken while charging drains the meter.
  if (
    victim.playerClass === TF_CLASS_DEMOMAN &&
    victim.cond.has(TF_COND.SHIELD_CHARGE) &&
    attacker !== victim &&
    !(info.damageType & DMG_FALL)
  ) {
    const penalty = hookInt(hookPlayer(victim, 'lose_demo_charge_on_damage_when_charging', 0));
    if (penalty) victim.meters[0] = Math.max(victim.meters[0] - penalty * info.damage, 0);
  }
  // Rage (HandleRageGain): the attacker for damage dealt, the victim for damage taken, Pyros for burns.
  if (removed > 0 && attacker !== victim) {
    const scale = weapon ? hookWeapon(weapon, weapon.owner, 'rage_giving_scale', 1) : 1;
    handleRageGain(attacker, RAGE_ON_DAMAGE_DEALT, info.damage * scale, 6);
    if (!(info.damageType & DMG_FALL))
      handleRageGain(victim, RAGE_ON_DAMAGE_RECEIVED, info.damage * scale, 3.5);
    if (info.damageType & (DMG_BURN | DMG_PLASMA))
      handleRageGain(attacker, RAGE_ON_BURN_DAMAGE_DEALT, info.damage * scale, 3);
  }
  // CTFPlayer::OnTakeDamage: a Heavy hurt while eating loses the food (DrainAmmo( true )), bars excepted.
  if (victim.playerClass === TF_CLASS_HEAVYWEAPONS && victim.cond.has(TF_COND.TAUNTING)) {
    const box = victim.activeWeapon() as
      (Weapon & { drainAmmo?: (force: boolean) => void; lunchboxType?: () => number }) | null;
    if (box && box.weaponId === WID.LUNCHBOX && box.drainAmmo && box.lunchboxType) {
      const type = box.lunchboxType();
      if (type !== 1 && type !== 7) box.drainAmmo(true);
    }
  }
  // The Gas Passer's meter also fills by damage dealt (item_meter_charge_type 2 / 3: ATTRIBUTE_METER_TYPE_DAMAGE / COMBO).
  if (attacker && attacker !== victim && removed > 0 && attacker.playerClass === TF_CLASS_PYRO) {
    const gas = ownsWeaponId(attacker, WID.JAR_GAS);
    if (gas && attacker.meters[3] < 100) {
      const type = hookInt(hookWeapon(gas, attacker, 'item_meter_charge_type', 0));
      const full = hookWeapon(gas, attacker, 'item_meter_damage_for_full_charge', 0);
      if ((type === 2 || type === 3) && full > 0) {
        attacker.meters[3] = Math.min(100, attacker.meters[3] + (info.damage / full) * 100);
        if (attacker.meters[3] >= 100) attacker.giveAmmo(1, gas.ammoType);
      }
    }
  }
  // Baby Face's Blaster: hype lost when hurt.
  if (victim.playerClass === TF_CLASS_SCOUT) {
    const lose = hookInt(hookPlayer(victim, 'lose_hype_on_take_damage', 0));
    if (lose) setScoutHypeMeter(victim, victim.move.scoutHype - lose * info.damage);
  }
  // The Spy-cicle (ApplyOnInjuredAttributes, on any weapon the Spy could draw).
  if (info.damageType & (DMG_BURN | DMG_IGNITE)) {
    for (const w of victim.weapons) {
      if (!w) continue;
      const fireproof = hookInt(hookWeapon(w, victim, 'become_fireproof_on_hit_by_fire', 0));
      if (fireproof > 0 && w.canDeploy()) {
        victim.cond.add(TF_COND.FIRE_IMMUNE, 1);
        if (victim.cond.has(TF_COND.BURNING)) {
          world.emitSound('TFPlayer.FlameOut', { entity: victim.id });
          victim.extinguish();
        }
        victim.cond.add(TF_COND.AFTERBURN_IMMUNE, fireproof);
        const melts = w as Weapon & { meltInFire?: () => void };
        melts.meltInFire?.();
        break;
      }
    }
  }
  // Sydney Sleeper: zoomed hits jarate for the charge's jarate time.
  if (attacker && weapon && isSniperRifleWeapon(weapon) && victim.alive) {
    const rifle = weapon as Weapon & { isZoomed?: () => boolean; jarateTime?: () => number };
    const t = rifle.jarateTime?.() ?? 0;
    if (
      t >= 1 &&
      (rifle.isZoomed?.() || weapon.weaponId === WID.SNIPERRIFLE_CLASSIC) &&
      !victim.cond.invulnerable &&
      !victim.cond.has(TF_COND.PHASE)
    ) {
      victim.cond.add(TF_COND.URINE, t, attacker.id);
      world.emitEffect({
        kind: 'particle',
        system: 'peejar_impact_small',
        pos: { x: info.position.x, y: info.position.y, z: info.position.z },
      });
    }
  }
  // Gas Passer: the next hit ignites (CTFPlayer::OnTakeDamage).
  if (removed > 0 && victim.cond.has(TF_COND.GAS) && victim.alive) {
    const tosserEnt = world.entity(victim.cond.getProvider(TF_COND.GAS));
    const tosser = tosserEnt && tosserEnt.isPlayer() ? (tosserEnt as Player) : null;
    if (victim.playerClass === TF_CLASS_PYRO) victim.cond.add(TF_COND.BURNING_PYRO, 10);
    const can = tosser ? ownsWeaponId(tosser, WID.JAR_GAS) : null;
    victim.ignite(tosser ? tosser.id : victim.id, can ? can.weaponId : 0, 10, can);
    victim.cond.remove(TF_COND.GAS);
  }
  // The Dead Ringer: a hit while it is ready feigns death (SpyDeadRingerDeath).
  if (
    victim.playerClass === TF_CLASS_SPY &&
    victim.unlock.feignDeathReady &&
    victim.alive &&
    victim.health > 0
  ) {
    if (info.customKill !== TF_DMG_CUSTOM.TF_DMG_CUSTOM_TELEFRAG) {
      victim.unlock.feignDeathReady = false;
      if (!victim.cond.has(TF_COND.TAUNTING)) feignDeath(victim, info);
    }
  }
}

/**
 * SDK: CTFPlayer::SpyDeadRingerDeath → FeignDeath — a fake death notice and ragdoll, the
 * cloak at once (no fade), the speed boost and afterburn immunity while it lasts.
 */
export function feignDeath(spy: Player, info: DamageInfo): void {
  const world = spy.world;
  const watch = ownsWeaponId(spy, WID.INVIS) as
    (Weapon & { onFeignDeath?: () => void; canFeignDeath?: () => boolean }) | null;
  // SpyDeadRingerDeath: not while cloaked, only from a full meter.
  if (watch?.canFeignDeath && !watch.canFeignDeath()) return;
  watch?.onFeignDeath?.();
  // OnAddFeignDeath.
  spy.cond.add(TF_COND.FEIGN_DEATH, -1, spy.id);
  spy.cond.add(TF_COND.SPEED_BOOST, FEIGN_DEATH_SPEED_DURATION);
  spy.cond.add(TF_COND.AFTERBURN_IMMUNE, FEIGN_DEATH_SPEED_DURATION);
  spy.unlock.feignDeathEnd = world.curtime + FEIGN_DEATH_SPEED_DURATION;
  // The extinguish and debuff removal that come with it (FeignDeath: RemoveCond burning/bleeding).
  spy.extinguish();
  spy.cond.remove(TF_COND.BLEEDING);
  spy.unlock.bleedCount = 0;
  if (spy.cond.has(TF_COND.DISGUISED)) {
    // FeignDeath keeps the disguise (bDeathnotice ragdoll shows the disguise).
  }
  // The death notice and the ragdoll everyone sees.
  const killer = world.entity(info.attacker);
  world.events.push({
    type: 'death',
    victim: spy.id,
    attacker: killer && killer.isPlayer() && killer !== spy ? killer.id : 0,
    assister: 0,
    inflictor: info.inflictor > 0 ? info.inflictor : 0,
    weapon: info.killIcon,
    weaponDefIndex: info.weaponDefIndex,
    crit: info.critType,
    customKill: info.customKill,
    damageType: info.damageType,
    deathFlags: TF_DEATH_FEIGN_DEATH,
    victimClass: spy.playerClass,
    gib: false,
    burning: false,
  });
  world.emitEffect({
    kind: 'ragdoll',
    pos: { x: spy.origin.x, y: spy.origin.y, z: spy.origin.z },
    entity: spy.id,
    team: spy.cond.has(TF_COND.DISGUISED) ? spy.disguiseTeam : spy.team,
    value: spy.cond.has(TF_COND.DISGUISED) ? spy.disguiseClass : spy.playerClass,
    force: {
      x: info.force.x + spy.velocity.x,
      y: info.force.y + spy.velocity.y,
      z: info.force.z + spy.velocity.z,
    },
  });
}

/** A charge ended against something (CTFGameMovement → CTFPlayerShared::EndCharge). */
export function onUnlockChargeEnd(p: Player): void {
  if (!p.cond.has(TF_COND.SHIELD_CHARGE) || !p.world.isServer) return;
  if (p.meters[0] < 90) {
    shieldBash(p, p.meters[0]);
    calcChargeCrit(p);
    p.cond.setDuration(TF_COND.SHIELD_CHARGE, 1e-6);
  }
}

/** Bash impact damage: 15 → 50 as the meter goes 90 → 40, +10 % per head (max 5), charge_impact_damage. */
export function shieldBashDamage(p: Player, meter: number): number {
  let dmg = remapClamped(meter, 90, 40, 15, 50);
  const heads = Math.min(p.unlock.decapitations, 5);
  if (heads > 0) dmg *= 1 + heads * 0.1;
  return hookPlayer(p, 'charge_impact_damage', dmg);
}

const bashStart = vec3();
const bashEnd = vec3();
const bashFwd = vec3();
// Lazily created (this module is on the sim/damage import cycle).
let bashTrace: ReturnType<typeof emptyTrace> | null = null;
let bashInfo: ReturnType<typeof createDamageInfo> | null = null;
const BASH_MINS = { x: -24, y: -24, z: -24 };
const BASH_MAXS = { x: 24, y: 24, z: 24 };

/** SDK: CTFWearableDemoShield::ShieldBash — a 48-unit hull trace ahead; a player there takes the bash. */
function shieldBash(p: Player, meter: number): void {
  const u = p.unlock;
  if (u.shieldImpacted) return;
  u.shieldImpacted = true;
  // Weapon_ShootPosition + forward × 48, a ±24 hull.
  const w = p.world;
  p.eyePosition(bashStart);
  angleVectors(p.eyeAngles, bashFwd);
  bashEnd.x = bashStart.x + bashFwd.x * 48;
  bashEnd.y = bashStart.y + bashFwd.y * 48;
  bashEnd.z = bashStart.z + bashFwd.z * 48;
  w.traceHull(
    bashStart,
    bashEnd,
    BASH_MINS,
    BASH_MAXS,
    MASK_SOLID,
    w.entityFilter(p, COLLISION_GROUP_NONE),
    (bashTrace ??= emptyTrace()),
  );
  if (bashTrace.fraction >= 1) return;
  const hit = w.entity(bashTrace.entity) ?? w.worldEntity;
  if (hit.isPlayer()) {
    p.world.emitSound('DemoCharge.HitFleshRange', { entity: p.id });
    const info = resetDamageInfo((bashInfo ??= createDamageInfo()));
    info.attacker = p.id;
    info.inflictor = p.id;
    info.damage = shieldBashDamage(p, meter);
    info.customKill = TF_DMG_CUSTOM.TF_DMG_CUSTOM_CHARGE_IMPACT;
    info.damageType = 1 << 7; // DMG_CLUB
    info.killIcon = 'demoshield';
    p.worldSpaceCenter(info.position);
    p.world.applyDamage(hit, info);
  } else p.world.emitSound('DemoCharge.HitWorld', { entity: p.id });
}

// ─── CTFPlayer::Event_KilledOther ──────────────────────────────────────────

/** The killer's unlock rules for a kill (the weapon's OnPlayerKill, kill boosts, meters, rage). */
export function unlockOnKill(
  victim: Player,
  info: DamageInfo,
  scorer: Player,
  _assister: Player | null,
): void {
  const world = victim.world;
  const weapon = damageWeapon(world, info);
  if (weapon && weapon.owner === scorer) {
    if (isKillAware(weapon)) weapon.onPlayerKill(victim, info);
    const crit = hookInt(hookWeapon(weapon, scorer, 'add_onkill_critboost_time', 0));
    if (crit) scorer.cond.add(TF_COND.CRITBOOSTED_ON_KILL, crit + 1);
    const mini = hookInt(hookWeapon(weapon, scorer, 'add_onkill_minicritboost_time', 0));
    if (mini) scorer.cond.add(TF_COND.ENERGY_BUFF, mini + 1);
  }
  // CTFDecapitationMeleeWeaponBase::FireGameEvent → CTFSword::OnDecapitation: a sword kill takes the head
  // (and the victim's), +15 health past max, TF_COND_DEMO_BUFF.
  if (
    weapon &&
    weapon.owner === scorer &&
    weapon.weaponId === WID.SWORD &&
    scorer.playerClass === TF_CLASS_DEMOMAN &&
    hookInt(hookWeapon(weapon, scorer, 'decapitate_type', 0)) !== 0
  ) {
    scorer.unlock.decapitations += 1 + victim.unlock.decapitations;
    scorer.maxHealth = scorer.computeMaxHealth();
    if (scorer.health < scorer.maxHealth * 1.5) scorer.takeHealth(15, DMG_IGNORE_MAXHEALTH);
    if (!scorer.cond.has(TF_COND.DEMO_BUFF)) scorer.cond.add(TF_COND.DEMO_BUFF);
  }
  if (scorer.playerClass === TF_CLASS_DEMOMAN && victim.team !== scorer.team) {
    const refill = weapon
      ? hookWeapon(weapon, scorer, 'kill_refills_meter', 0)
      : hookPlayer(scorer, 'kill_refills_meter', 0);
    if (
      refill > 0 &&
      (info.damageType & DMG_MELEE || info.customKill === TF_DMG_CUSTOM.TF_DMG_CUSTOM_CHARGE_IMPACT)
    ) {
      scorer.meters[0] = Math.min(100, scorer.meters[0] + refill * 100);
    }
  }
  if (scorer.playerClass === TF_CLASS_SNIPER) {
    const rage = weapon ? hookWeapon(weapon, scorer, 'rage_on_kill', 0) : 0;
    if (rage !== 0) setRageMeter(scorer, scorer.meters[1] + rage);
  }
}

// ─── CTFWeaponBase::ApplyOnHitAttributes (the unlock half) ─────────────────

/**
 * The rest of ApplyOnHitAttributes for a hit on an enemy player: health from Mad Milk and the
 * Concheror (folded into `health`, which the caller gives), the charge meter, speed boost, rage,
 * the Baby Face's Blaster's boost, Natascha's slow, marks for death, ammo and heads on hit.
 * Returns the extra health to give.
 */
export function unlockOnHit(
  attacker: Player,
  victim: Player,
  weapon: Weapon,
  info: DamageInfo,
): number {
  let health = 0;
  const ammo = hookInt(hookWeapon(weapon, attacker, 'add_onhit_addammo', 0));
  if (ammo > 0) {
    const w = weapon as Weapon & { ammoToAdd?: number };
    w.ammoToAdd = (w.ammoToAdd ?? 0) + Math.trunc((ammo / 100) * info.damage);
  }
  const charge = hookWeapon(weapon, attacker, 'charge_meter_on_hit', 0);
  if (charge > 0) attacker.meters[0] = Math.min(100, attacker.meters[0] + charge * 100);
  const speed = hookInt(hookWeapon(weapon, attacker, 'speed_boost_on_hit', 0));
  if (speed) attacker.cond.add(TF_COND.SPEED_BOOST, speed);
  if (victim.cond.has(TF_COND.MAD_MILK)) {
    const amount = Math.trunc(info.damage * 0.6);
    health += amount;
    const providerEnt = attacker.world.entity(victim.cond.getProvider(TF_COND.MAD_MILK));
    if (providerEnt && providerEnt.isPlayer() && providerEnt !== attacker)
      (providerEnt as Player).stats.healing += amount;
  }
  if (attacker.cond.has(TF_COND.REGENONDAMAGEBUFF))
    health += Math.trunc(info.damage * HEALTH_ON_DAMAGE_RECOVER);
  if (attacker.playerClass === 3 || attacker.playerClass === TF_CLASS_PYRO) {
    const rage = hookInt(hookWeapon(weapon, attacker, 'rage_on_hit', 0));
    if (rage) setRageMeter(attacker, attacker.meters[1] + rage);
  }
  // Baby Face's Blaster: boost_on_damage (tf_scout_hype_pep_*: min 5 damage, capped at 99).
  if (hookInt(hookPlayer(attacker, 'boost_on_damage', 0)) !== 0) {
    setScoutHypeMeter(
      attacker,
      Math.min(99, attacker.move.scoutHype + Math.max(5, info.damage) / 1),
    );
  }
  // Natascha: slow the victim (unless a Medic heals him), 60 % up close falling to 0 at 1536.
  if (!victim.cond.has(TF_COND.HEALTH_BUFF)) {
    const slow = hookWeapon(weapon, attacker, 'mult_onhit_enemyspeed', 0);
    if (slow && attacker.world.random.randomFloat(0, 1) < slow) {
      const dx = victim.origin.x - attacker.origin.x;
      const dy = victim.origin.y - attacker.origin.y;
      const dz = victim.origin.z - attacker.origin.z;
      const amount = remapClamped(dx * dx + dy * dy + dz * dz, 512 * 512, 1536 * 1536, 0.6, 0);
      stunPlayer(victim, 0.2, amount, TF_STUN_MOVEMENT, attacker);
    }
    const major = hookWeapon(weapon, attacker, 'mult_onhit_enemyspeed_major', 0);
    if (major) stunPlayer(victim, major, 0.4, TF_STUN_MOVEMENT, attacker);
  }
  // The Pomson: subtract_victim_medigun_charge_onhit / subtract_victim_cloak_on_hit, full to 512 units, none at 1536
  // (the int attribute times the remap, truncated).
  const drainUber = hookInt(
    hookWeapon(weapon, attacker, 'subtract_victim_medigun_charge_onhit', 0),
  );
  const drainCloak = hookInt(hookWeapon(weapon, attacker, 'subtract_victim_cloak_on_hit', 0));
  if (drainUber > 0 || drainCloak > 0) {
    const dx = victim.origin.x - attacker.origin.x;
    const dy = victim.origin.y - attacker.origin.y;
    const dz = victim.origin.z - attacker.origin.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const scale = (n: number): number =>
      d2 > 512 * 512 ? Math.trunc(n * remapClamped(d2, 512 * 512, 1536 * 1536, 1, 0)) : n;
    let drained = false;
    if (drainUber > 0 && victim.playerClass === 5) {
      const gun = ownsWeaponId(victim, WID.MEDIGUN) as
        (Weapon & { chargeLevel?: number; isReleasingCharge?: () => boolean }) | null;
      if (gun && typeof gun.chargeLevel === 'number' && !gun.isReleasingCharge?.()) {
        gun.chargeLevel = Math.max(0, gun.chargeLevel - scale(drainUber) / 100);
        drained = true;
      }
    }
    if (drainCloak > 0 && victim.playerClass === TF_CLASS_SPY) {
      victim.cloakMeter = Math.max(0, victim.cloakMeter - scale(drainCloak));
      drained = true;
    }
    if (drained && !victim.cond.has(TF_COND.DISGUISED) && !victim.cond.has(TF_COND.STEALTHED)) {
      attacker.world.emitEffect({
        kind: 'particle',
        system: 'drg_pomson_impact_drain',
        pos: { x: victim.origin.x, y: victim.origin.y, z: victim.origin.z + 64 },
        entity: victim.id,
        attachment: 'head',
      });
      attacker.world.emitSound('Weapon_Pomson.DrainedVictim', { entity: victim.id });
    }
  }
  // mark_for_death (the Fan O'War): one target at a time.
  if (hookInt(hookWeapon(weapon, attacker, 'mark_for_death', 0))) {
    const prev = attacker.world.entity(attacker.unlock.markedTarget);
    if (prev && prev.isPlayer()) (prev as Player).cond.remove(TF_COND.MARKEDFORDEATH);
    victim.cond.add(TF_COND.MARKEDFORDEATH, MARKED_FOR_DEATH_LIFETIME, attacker.id);
    attacker.unlock.markedTarget = victim.id;
  }
  return health;
}
