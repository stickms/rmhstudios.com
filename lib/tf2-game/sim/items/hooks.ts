/**
 * Attribute hooks that need the world: which weapon dealt a hit, the on-hit and
 * on-kill attributes, and the shared conditions they test. Each function names
 * the SDK routine it follows.
 *
 * Environment-agnostic.
 */

import { FL_ONGROUND, TF_CLASS_MEDIC } from '../../core/constants';
import type { DamageInfo } from '../damage';
import type { Entity } from '../entity';
import type { Player } from '../player';
import type { Weapon } from '../weapon-api';
import type { GameWorld } from '../world';
import { TF_COND } from '../conditions';
import { hookInt, hookPlayer, hookWeapon } from './attributes';
import { isDotDamage, unlockOnHit } from './damage-rules';
import {
  FEIGN_DEATH_ACTIVATE_DAMAGE_SCALE,
  FEIGN_DEATH_DAMAGE_SCALE,
  setScoutHypeMeter,
  STEALTH_DAMAGE_REDUCTION,
} from './effects';
import { remapClamped } from '../../core/vec';

/** DMG_BURN (sim/damage.ts), repeated here to keep this module free of the damage module's imports. */
const DMG_BURN = 1 << 3;

/** info.GetWeapon(): the projectile's launcher, else the attacker's weapon with the hit's defindex. */
export function damageWeapon(world: GameWorld, info: DamageInfo): Weapon | null {
  const inflictor = world.entity(info.inflictor) as (Entity & { launcher?: Weapon | null }) | null;
  if (inflictor?.launcher) return inflictor.launcher;
  const attacker = world.entity(info.attacker);
  if (!attacker || !attacker.isPlayer() || info.weaponDefIndex < 0) return null;
  const p = attacker as Player;
  const active = p.activeWeapon();
  if (active && active.defindex === info.weaponDefIndex) return active;
  for (const w of p.weapons) if (w && w.defindex === info.weaponDefIndex) return w;
  return null;
}

/** The player who owns `weapon` (or null). */
export const weaponOwner = (weapon: Weapon | null): Player | null => weapon?.owner ?? null;

/** SDK: CTFPlayer::InAirDueToExplosion (tf_player.h). */
export function inAirDueToExplosion(p: Player): boolean {
  return (p.move.flags & FL_ONGROUND) === 0 && p.move.waterLevel === 0 && p.blastJumpState !== 0;
}

/**
 * SDK: CTFWeaponBase::ApplyOnHitAttributes — for a hit on an enemy player: health on hit
 * (add_onhit_addhealth, scaled by the share of the base damage dealt, at least 3) and
 * ÜberCharge on hit for a Medic (add_onhit_ubercharge). Not from burn damage, not on a
 * disguised enemy Spy.
 */
export function applyOnHitAttributes(attacker: Player, victim: Player, info: DamageInfo): void {
  if (attacker === victim || !attacker.alive) return;
  if (info.damageType & DMG_BURN) return;
  const weapon = damageWeapon(attacker.world, info);
  if (!weapon || weapon.owner !== attacker) return;
  if (
    victim.disguiseTeam &&
    victim.disguiseTeam !== victim.team &&
    victim.cond.has(TF_COND.DISGUISED)
  )
    return;
  let health = hookInt(hookWeapon(weapon, attacker, 'add_onhit_addhealth', 0));
  if (health) {
    const base = info.baseDamage || info.damage;
    const scale = Math.min(1, Math.max(0, base > 0 ? info.damage / base : 1));
    health = Math.max(3, Math.trunc(health * scale));
  }
  // Mad Milk, the Concheror, meters, Natascha's slow, marks … (sim/items/damage-rules.ts).
  health += unlockOnHit(attacker, victim, weapon, info);
  if (health > 0) attacker.takeHealth(health);
  else if (health < 0) {
    // A negative add_onhit_addhealth hurts the wielder (CTakeDamageInfo( attacker, weapon, -n )).
    attacker.health = Math.max(1, attacker.health + health);
  }
  if (attacker.playerClass === TF_CLASS_MEDIC) {
    const uber = hookWeapon(weapon, attacker, 'add_onhit_ubercharge', 0);
    if (uber) {
      for (const w of attacker.weapons) {
        const mg = w as (Weapon & { chargeLevel?: number; chargeRelease?: boolean }) | null;
        if (mg && typeof mg.chargeLevel === 'number' && !mg.chargeRelease) {
          mg.chargeLevel = Math.min(1, mg.chargeLevel + uber);
          break;
        }
      }
    }
  }
}

/**
 * SDK: CTFPlayer::Event_KilledOther — health restored to a share of max health on a kill
 * (restore_health_on_kill, up to 150 %), then a flat heal (heal_on_kill, up to the max buffed health).
 */
export function applyOnKillAttributes(killer: Player, info: DamageInfo): void {
  if (!killer.alive) return;
  const weapon = damageWeapon(killer.world, info);
  if (!weapon || weapon.owner !== killer) return;
  const restore = hookInt(hookWeapon(weapon, killer, 'restore_health_on_kill', 0));
  if (restore > 0) {
    const target = Math.trunc((restore / 100) * killer.maxHealth) + 1;
    const cap = Math.trunc(killer.maxHealth * 1.5);
    const next = Math.min(killer.health + target, cap);
    const delta = Math.max(next - killer.health, 0);
    killer.takeHealth(delta, DMG_IGNORE_MAXHEALTH);
  }
  const heal = hookInt(hookWeapon(weapon, killer, 'heal_on_kill', 0));
  if (heal !== 0) {
    const add = Math.min(heal, killer.maxBuffedHealth() - killer.health);
    if (add > 0) killer.takeHealth(add);
  }
}

/**
 * SDK: CTFGameRules::RadiusDamage — a blast weapon that heals by the damage it did to enemy
 * players (add_health_on_radius_damage, scaled by the share of the launcher's base damage).
 */
export function applyRadiusHeal(
  attacker: Player,
  weapon: Weapon | null,
  dealt: number,
  baseDamage: number,
): void {
  if (!weapon || dealt <= 0 || baseDamage <= 0) return;
  const heal = hookInt(hookWeapon(weapon, attacker, 'add_health_on_radius_damage', 0));
  if (!heal) return;
  const scale = Math.min(1, Math.max(0, dealt / baseDamage));
  const amount = Math.trunc(heal * scale);
  if (amount > 0) attacker.takeHealth(amount);
}

/**
 * SDK: CTFGameRules::ApplyOnDamageAliveModifyRules — the victim's resistances and
 * vulnerabilities. `base` is the damage without the crit bonus (resists scale only it),
 * `bonus` the crit bonus. Returns the damage to take.
 */
export function aliveDamageModifiers(
  victim: Player,
  attacker: Entity | null,
  info: DamageInfo,
  base: number,
  bonus: number,
): number {
  // (base and bonus are reassigned below: resists scale only the base, crit resists the bonus)
  const type = info.damageType;
  const world = victim.world;
  const hitWeapon = damageWeapon(world, info);
  // set_dmgtype_ignite (the Sharpened Volcano Fragment), never from a damage-over-time tick.
  if (hitWeapon && !isDotDamage(info.customKill) && hookInt(hookWeapon(hitWeapon, hitWeapon.owner, 'set_dmgtype_ignite', 0)))
    info.damageType |= DMG_IGNITE;
  if (info.damageType & DMG_IGNITE && victim.move.waterLevel < 2 && victim.cond.has(TF_COND.FIRE_IMMUNE)) return 0;
  const pierce = hitWeapon ? hookInt(hookWeapon(hitWeapon, hitWeapon.owner, 'mod_pierce_resists_absorbs', 0)) !== 0 : false;
  const rawBase = base;
  // CheckForDamageTypeImmunity.
  if (
    (type & (DMG_BURN | DMG_IGNITE) && victim.cond.has(TF_COND.FIRE_IMMUNE)) ||
    (!(type & (DMG_BURN | DMG_IGNITE)) && type & (DMG_BULLET | DMG_BUCKSHOT) && victim.cond.has(TF_COND.BULLET_IMMUNE)) ||
    (!(type & (DMG_BURN | DMG_IGNITE | DMG_BULLET | DMG_BUCKSHOT)) && type & DMG_BLAST && victim.cond.has(TF_COND.BLAST_IMMUNE))
  ) {
    base = 0;
    bonus = 0;
  }
  if (!pierce) {
    const crit = (type & DMG_CRITICAL) !== 0;
    if (crit) bonus = hookPlayer(victim, 'mult_dmgtaken_from_crit', bonus);
    if (type & (DMG_BURN | DMG_IGNITE)) {
      base = hookPlayer(victim, 'mult_dmgtaken_from_fire', base);
      const active = victim.activeWeapon();
      if (active) base = hookWeapon(active, null, 'mult_dmgtaken_from_fire_active', base);
      [base, bonus] = checkMedicResist(TF_COND.MEDIGUN_SMALL_FIRE_RESIST, TF_COND.MEDIGUN_UBER_FIRE_RESIST, 'fire', victim, base, crit, bonus);
    }
    if (attacker && attacker.isPlayer() && victim.cond.has(TF_COND.BURNING)) {
      const aw = (attacker as Player).activeWeapon();
      if (aw) base = hookWeapon(aw, attacker as Player, 'mult_dmg_vs_burning', base);
    }
    if (type & DMG_BLAST && attacker !== victim) {
      base = hookPlayer(victim, 'mult_dmgtaken_from_explosions', base);
      [base, bonus] = checkMedicResist(TF_COND.MEDIGUN_SMALL_BLAST_RESIST, TF_COND.MEDIGUN_UBER_BLAST_RESIST, 'blast', victim, base, crit, bonus);
    }
    if (type & (DMG_BULLET | DMG_BUCKSHOT)) {
      base = hookPlayer(victim, 'mult_dmgtaken_from_bullets', base);
      [base, bonus] = checkMedicResist(TF_COND.MEDIGUN_SMALL_BULLET_RESIST, TF_COND.MEDIGUN_UBER_BULLET_RESIST, 'bullet', victim, base, crit, bonus);
    }
    if (type & DMG_MELEE) base = hookPlayer(victim, 'mult_dmgtaken_from_melee', base);
  }
  if (base !== rawBase && victim.world.isServer) {
    // PlayDamageResistSound: the light / medium / heavy resist sound by how much was kept off.
    const ratio = rawBase > 0 ? base / rawBase : 1;
    if (ratio < 1) {
      const name = ratio <= 0.25 ? 'Player.ResistanceHeavy' : ratio <= 0.75 ? 'Player.ResistanceMedium' : 'Player.ResistanceLight';
      world.emitSound(name, { entity: victim.id });
    }
  }
  // A spun-up Heavy below half health (spunup_damage_resistance: Natascha, the Brass Beast).
  if (victim.playerClass === TF_CLASS_HEAVY && victim.cond.has(TF_COND.AIMING)) {
    const real = base + bonus;
    if ((victim.health - real) / victim.maxHealth <= 0.5)
      base = hookPlayer(victim, 'spunup_damage_resistance', base);
  }
  let real = base + bonus;
  real = hookPlayer(victim, 'mult_dmgtaken', real);
  const active = victim.activeWeapon();
  if (active) real = hookWeapon(active, null, 'mult_dmgtaken_active', real);
  const inflictorEnt = world.entity(info.inflictor);
  if (inflictorEnt && inflictorEnt.isBaseObject()) real = hookPlayer(victim, 'dmg_from_sentry_reduced', real);
  if (active && !pierce) {
    if (type & DMG_CLUB) real = hookWeapon(active, null, 'dmg_from_melee', real);
    else if (type & (DMG_BLAST | DMG_BULLET | DMG_BUCKSHOT | DMG_IGNITE | DMG_SONIC))
      real = hookWeapon(active, null, 'dmg_from_ranged', real);
  }
  // The Dead Ringer and the cloak: less damage while feigning (60 % → 20 % kept as the cloak runs
  // down), a quarter on the hit that triggers it, 80 % while cloaked.
  if (victim.playerClass === TF_CLASS_SPY && info.customKill !== TF_DMG_CUSTOM_TELEFRAG && !victim.cond.has(TF_COND.TAUNTING) && !pierce) {
    if (victim.cond.has(TF_COND.FEIGN_DEATH) || victim.unlock.feignDeathReady) {
      let scale = remapClamped(victim.cloakMeter, 50, 0, FEIGN_DEATH_DAMAGE_SCALE, STEALTH_DAMAGE_REDUCTION);
      if (victim.unlock.feignDeathReady) scale = FEIGN_DEATH_ACTIVATE_DAMAGE_SCALE;
      real *= scale;
    } else if (victim.cond.has(TF_COND.STEALTHED)) real *= STEALTH_DAMAGE_REDUCTION;
  }
  if (attacker === victim) {
    // Self blast damage: rocket_jump_dmg_reduction when the blast hurt no other player, then the
    // weapon's own self-damage rules (no_self_blast_dmg 2 ignores all, blast_dmg_to_self scales).
    if (type & DMG_BLAST && info.damagedOtherPlayers === 0)
      real = hookPlayer(victim, 'rocket_jump_dmg_reduction', real);
    const weapon = damageWeapon(victim.world, info);
    if (weapon) {
      if (hookInt(hookWeapon(weapon, victim, 'no_self_blast_dmg', 0)) === 2) real = 0;
      real = hookWeapon(weapon, victim, 'blast_dmg_to_self', real);
    }
  }
  // hype_on_damage (the Soda Popper): 1 → 50 hype for 1 → 200 damage.
  if (attacker && attacker !== victim && attacker.isPlayer() && real > 0) {
    const a = attacker as Player;
    if (hookInt(hookPlayer(a, 'hype_on_damage', 0))) {
      const hype = remapClamped(real, 1, 200, 1, 50);
      setScoutHypeMeter(a, Math.min(100, hype + a.move.scoutHype));
    }
  }
  return real;
}

/**
 * SDK: CheckMedicResist (tf_gamerules.cpp) — the Vaccinator's passive and über resistances,
 * read from the providing Medic (medigun_<type>_resist_passive / _deployed); an über resist
 * also cancels the crit bonus. Returns [base, bonus].
 */
function checkMedicResist(
  passive: number,
  deployed: number,
  type: 'bullet' | 'blast' | 'fire',
  victim: Player,
  base: number,
  crit: boolean,
  bonus: number,
): [number, number] {
  const cond = victim.cond.has(deployed) ? deployed : victim.cond.has(passive) ? passive : -1;
  if (cond < 0) return [base, bonus];
  const providerEnt = victim.world.entity(victim.cond.getProvider(cond));
  if (!providerEnt || !providerEnt.isPlayer()) return [base, bonus];
  const provider = providerEnt as Player;
  const uber = cond === deployed;
  let scale = hookPlayer(provider, `medigun_${type}_resist_${uber ? 'deployed' : 'passive'}`, 0);
  if (uber && victim.cond.has(TF_COND.HEALING_DEBUFF)) scale *= 1 - PYRO_AFTERBURN_HEALING_REDUCTION;
  scale = Math.max(0, 1 - scale);
  if (crit && uber) bonus = victim.cond.has(TF_COND.HEALING_DEBUFF) ? bonus * PYRO_AFTERBURN_HEALING_REDUCTION : 0;
  return [base * scale, bonus];
}

// Damage bits (sim/damage.ts), repeated to avoid importing the damage module here.
const DMG_BULLET = 1 << 1;
const DMG_CRITICAL = 1 << 20;
/** PYRO_AFTERBURN_HEALING_REDUCTION (tf_shareddefs.h). */
const PYRO_AFTERBURN_HEALING_REDUCTION = 0.2;
/** TF_DMG_CUSTOM_TELEFRAG. */
const TF_DMG_CUSTOM_TELEFRAG = 16;
const TF_CLASS_SPY = 8;
/** DMG_IGNORE_MAXHEALTH (= DMG_BULLET, as the SDK reuses it for TakeHealth). */
const DMG_IGNORE_MAXHEALTH = DMG_BULLET;
const DMG_BLAST = 1 << 6;
const DMG_CLUB = 1 << 7;
const DMG_SONIC = 1 << 9;
const DMG_IGNITE = 1 << 24;
const DMG_MELEE = 1 << 27;
const DMG_BUCKSHOT = 1 << 29;
const TF_CLASS_HEAVY = 6;
