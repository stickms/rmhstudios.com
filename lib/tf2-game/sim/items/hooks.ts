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
    if (health > 0) attacker.takeHealth(health);
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
  const type = info.damageType;
  if (type & (DMG_BURN | DMG_IGNITE)) base = hookPlayer(victim, 'mult_dmgtaken_from_fire', base);
  if (type & DMG_BLAST && attacker !== victim)
    base = hookPlayer(victim, 'mult_dmgtaken_from_explosions', base);
  if (type & (DMG_BULLET | DMG_BUCKSHOT))
    base = hookPlayer(victim, 'mult_dmgtaken_from_bullets', base);
  if (type & DMG_MELEE) base = hookPlayer(victim, 'mult_dmgtaken_from_melee', base);
  // A spun-up Heavy below half health (spunup_damage_resistance: Natascha, the Brass Beast).
  if (victim.playerClass === TF_CLASS_HEAVY && victim.cond.has(TF_COND.AIMING)) {
    const real = base + bonus;
    if ((victim.health - real) / victim.maxHealth <= 0.5)
      base = hookPlayer(victim, 'spunup_damage_resistance', base);
  }
  let real = base + bonus;
  real = hookPlayer(victim, 'mult_dmgtaken', real);
  const active = victim.activeWeapon();
  if (active) {
    if (type & DMG_CLUB) real = hookWeapon(active, null, 'dmg_from_melee', real);
    else if (type & (DMG_BLAST | DMG_BULLET | DMG_BUCKSHOT | DMG_IGNITE | DMG_SONIC))
      real = hookWeapon(active, null, 'dmg_from_ranged', real);
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
  return real;
}

// Damage bits (sim/damage.ts), repeated to avoid importing the damage module here.
const DMG_BULLET = 1 << 1;
/** DMG_IGNORE_MAXHEALTH (= DMG_BULLET, as the SDK reuses it for TakeHealth). */
const DMG_IGNORE_MAXHEALTH = DMG_BULLET;
const DMG_BLAST = 1 << 6;
const DMG_CLUB = 1 << 7;
const DMG_SONIC = 1 << 9;
const DMG_IGNITE = 1 << 24;
const DMG_MELEE = 1 << 27;
const DMG_BUCKSHOT = 1 << 29;
const TF_CLASS_HEAVY = 6;
