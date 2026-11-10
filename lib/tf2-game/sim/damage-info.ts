/**
 * The CTakeDamageInfo record and the constants it is written in — the DMG_*
 * bits, ETFDmgCustom, the TF_WEAPON ids the damage rules switch on, the crit
 * levels and the damage tuning numbers. A leaf module: it imports nothing from
 * the simulation, so the entity, the item hooks and the damage rules can all
 * name a damage record without importing each other (sim/damage.ts re-exports
 * everything here for the callers outside that cycle).
 */

import { copy, set, vec3, type Vec3 } from '../core/vec';
import { NO_ENTITY } from '../core/types';
import { CONTENTS_GRATE, CONTENTS_MOVEABLE, CONTENTS_SOLID, CONTENTS_WINDOW } from '../core/constants';


// ─── DMG_* (shareddefs.h) ───────────────────────────────────────────────────
export const DMG_GENERIC = 0;
export const DMG_CRUSH = 1 << 0;
export const DMG_BULLET = 1 << 1;
export const DMG_SLASH = 1 << 2;
export const DMG_BURN = 1 << 3;
export const DMG_VEHICLE = 1 << 4;
export const DMG_FALL = 1 << 5;
export const DMG_BLAST = 1 << 6;
export const DMG_CLUB = 1 << 7;
export const DMG_SHOCK = 1 << 8;
export const DMG_SONIC = 1 << 9;
export const DMG_ENERGYBEAM = 1 << 10;
export const DMG_PREVENT_PHYSICS_FORCE = 1 << 11;
export const DMG_NEVERGIB = 1 << 12;
export const DMG_ALWAYSGIB = 1 << 13;
export const DMG_DROWN = 1 << 14;
export const DMG_PARALYZE = 1 << 15;
export const DMG_NERVEGAS = 1 << 16;
export const DMG_POISON = 1 << 17;
export const DMG_RADIATION = 1 << 18;
export const DMG_DROWNRECOVER = 1 << 19;
export const DMG_ACID = 1 << 20;
export const DMG_SLOWBURN = 1 << 21;
export const DMG_REMOVENORAGDOLL = 1 << 22;
export const DMG_PHYSGUN = 1 << 23;
export const DMG_PLASMA = 1 << 24;
export const DMG_AIRBOAT = 1 << 25;
export const DMG_DISSOLVE = 1 << 26;
export const DMG_BLAST_SURFACE = 1 << 27;
export const DMG_DIRECT = 1 << 28;
export const DMG_BUCKSHOT = 1 << 29;

// TF re-uses (tf_shareddefs.h).
export const DMG_USE_HITLOCATIONS = DMG_AIRBOAT;
export const DMG_HALF_FALLOFF = DMG_RADIATION;
export const DMG_CRITICAL = DMG_ACID;
export const DMG_RADIUS_MAX = DMG_ENERGYBEAM;
export const DMG_IGNITE = DMG_PLASMA;
export const DMG_USEDISTANCEMOD = DMG_SLOWBURN;
export const DMG_NOCLOSEDISTANCEMOD = DMG_POISON;
export const DMG_MELEE = DMG_BLAST_SURFACE;
export const DMG_DONT_COUNT_DAMAGE_TOWARDS_CRIT_RATE = DMG_DISSOLVE;
/** Only meaningful on TakeHealth (re-uses DMG_BULLET). */
export const DMG_IGNORE_MAXHEALTH = DMG_BULLET;

/** MASK_RADIUS_DAMAGE (tf_gamerules.h): what blocks explosions. */
export const MASK_RADIUS_DAMAGE = CONTENTS_SOLID | CONTENTS_MOVEABLE | CONTENTS_WINDOW | CONTENTS_GRATE;

// ─── ETFDmgCustom (subset, SDK numbering) ──────────────────────────────────
export const TF_DMG_CUSTOM_NONE = 0;
export const TF_DMG_CUSTOM_HEADSHOT = 1;
export const TF_DMG_CUSTOM_BACKSTAB = 2;
export const TF_DMG_CUSTOM_BURNING = 3;
export const TF_DMG_WRENCH_FIX = 4;
export const TF_DMG_CUSTOM_MINIGUN = 5;
export const TF_DMG_CUSTOM_SUICIDE = 6;
export const TF_DMG_CUSTOM_BURNING_FLARE = 8;
export const TF_DMG_CUSTOM_TELEFRAG = 16;
export const TF_DMG_CUSTOM_BURNING_ARROW = 17;
export const TF_DMG_CUSTOM_DECAPITATION = 20;
export const TF_DMG_CUSTOM_TAUNTATK_GRENADE = 21;
export const TF_DMG_CUSTOM_BASEBALL = 22;
export const TF_DMG_CUSTOM_CHARGE_IMPACT = 23;
export const TF_DMG_CUSTOM_ROCKET_DIRECTHIT = 28;
export const TF_DMG_CUSTOM_PLAYER_SENTRY = 30;
export const TF_DMG_CUSTOM_STANDARD_STICKY = 31;
export const TF_DMG_CUSTOM_CARRIED_BUILDING = 36;
export const TF_DMG_CUSTOM_TRIGGER_HURT = 40;
export const TF_DMG_CUSTOM_FLARE_EXPLOSION = 44;
export const TF_DMG_CUSTOM_HEADSHOT_DECAPITATION = 51;

export const isHeadshot = (custom: number): boolean =>
  custom === TF_DMG_CUSTOM_HEADSHOT || custom === TF_DMG_CUSTOM_HEADSHOT_DECAPITATION;

// ─── ETFWeaponType ids the damage rules switch on (tf_shareddefs.h numbering) ─
export const TF_WEAPON = {
  NONE: 0,
  BAT: 1,
  BOTTLE: 3,
  FIREAXE: 4,
  CLUB: 5,
  KNIFE: 7,
  FISTS: 8,
  SHOVEL: 9,
  WRENCH: 10,
  BONESAW: 11,
  SHOTGUN_PRIMARY: 12,
  SHOTGUN_SOLDIER: 13,
  SHOTGUN_HWG: 14,
  SHOTGUN_PYRO: 15,
  SCATTERGUN: 16,
  SNIPERRIFLE: 17,
  MINIGUN: 18,
  SMG: 19,
  SYRINGEGUN_MEDIC: 20,
  ROCKETLAUNCHER: 22,
  GRENADELAUNCHER: 23,
  PIPEBOMBLAUNCHER: 24,
  FLAMETHROWER: 25,
  PISTOL: 41,
  PISTOL_SCOUT: 42,
  REVOLVER: 43,
  PDA_ENGINEER_BUILD: 46,
  PDA_ENGINEER_DESTROY: 47,
  PDA_SPY: 48,
  BUILDER: 49,
  MEDIGUN: 50,
  SENTRY_BULLET: 54,
  SENTRY_ROCKET: 55,
  DISPENSER: 56,
  INVIS: 57,
  FLAREGUN: 58,
  COMPOUND_BOW: 61,
  SWORD: 64,
  ROCKETLAUNCHER_DIRECTHIT: 65,
  STICKBOMB: 74,
  SODA_POPPER: 76,
  SNIPERRIFLE_DECAP: 77,
  PARTICLE_CANNON: 79,
  PEP_BRAWLER_BLASTER: 85,
  CANNON: 91,
  SNIPERRIFLE_CLASSIC: 99,
} as const;

export const isSniperRifleId = (id: number): boolean =>
  id === TF_WEAPON.SNIPERRIFLE || id === TF_WEAPON.SNIPERRIFLE_DECAP || id === TF_WEAPON.SNIPERRIFLE_CLASSIC;

/** CTakeDamageInfo crit types. */
export const CRIT_NONE = 0;
export const CRIT_MINI = 1;
export const CRIT_FULL = 2;
export type CritType = 0 | 1 | 2;

/** TF_DAMAGE_CRIT_MULTIPLIER / TF_DAMAGE_MINICRIT_MULTIPLIER. */
export const TF_DAMAGE_CRIT_MULTIPLIER = 3;
export const TF_DAMAGE_MINICRIT_MULTIPLIER = 1.35;
/** tf_damage_range: the ± fraction of the distance curve. */
export const TF_DAMAGE_RANGE = 0.5;
/** The optimal distance of the ramp-up/fall-off curve. */
export const TF_DAMAGE_OPTIMAL_DISTANCE = 512;
/** SENTRY_MAX_RANGE (tf_obj_sentrygun.h). */
export const SENTRY_MAX_RANGE = 1100;

// Knockback (tf_player.cpp).
/** DAMAGE_FORCE_SCALE_SELF — stickies and other self blast jumps. */
export const DAMAGE_FORCE_SCALE_SELF = 9;
/** tf_damageforcescale_other. */
export const TF_DAMAGEFORCESCALE_OTHER = 6;
/** tf_damageforcescale_self_soldier_rj — rocket jump while airborne. */
export const TF_DAMAGEFORCESCALE_SELF_SOLDIER_RJ = 10;
/** tf_damageforcescale_self_soldier_badrj — rocket jump from the ground. */
export const TF_DAMAGEFORCESCALE_SELF_SOLDIER_BADRJ = 5;
/** tf_damageforcescale_pyro_jump (Detonator). */
export const TF_DAMAGEFORCESCALE_PYRO_JUMP = 8.5;
/** tf_damagescale_self_soldier — self damage taken while rocket jumping. */
export const TF_DAMAGESCALE_SELF_SOLDIER = 0.6;
/** Self damage from grenades/stickies (CTFRadiusDamageInfo::ApplyToEntity). */
export const TF_SELF_GRENADE_DAMAGE_SCALE = 0.75;

/** CTakeDamageInfo. Reuse with `resetDamageInfo` in hot paths. */
export interface DamageInfo {
  /** Entity responsible (player id, or a world entity id); NO_ENTITY for none. */
  attacker: number;
  /** What did it (the projectile, the sentry, the player for hitscan). */
  inflictor: number;
  /** The weapon's TF_WEAPON_* id (0 for none). */
  weaponId: number;
  /** The weapon's item definition index (-1 for none). */
  weaponDefIndex: number;
  /** Kill-feed icon. */
  killIcon: string;
  damage: number;
  /** Damage before modification (CopyDamageToBaseDamage); 0 = not captured yet. */
  baseDamage: number;
  /** GetDamageForForceCalc; 0 = use `damage`. */
  damageForForce: number;
  /** Highest damage this hit could have done (double donk etc.). */
  maxDamage: number;
  damageType: number;
  customKill: number;
  critType: CritType;
  /** Where the damage was dealt (impact point / explosion centre). */
  position: Vec3;
  /** Physics force for ragdolls. */
  force: Vec3;
  /** Where the attacker was when firing (falloff for projectiles uses the attacker's current position). */
  reportedPosition: Vec3;
  /** Enemy players a blast hit (rocket-jump damage reduction checks it). */
  damagedOtherPlayers: number;
  /** Bonus damage from crits, for assist accounting. */
  damageBonus: number;
  /** Entity the projectile hit directly (pInflictor->GetEnemy()): full damage, no falloff. */
  directHitEntity: number;
  /** Hit group from a hitbox trace (HITGROUP_*). */
  hitGroup: number;
  /**
   * Seconds of afterburn a DMG_IGNITE hit adds (the weapon's
   * GetAfterburnRateOnHit); 0 = TF_BURNING_FLAME_LIFE.
   */
  afterburn: number;
}

export function createDamageInfo(): DamageInfo {
  return {
    attacker: NO_ENTITY,
    inflictor: NO_ENTITY,
    weaponId: 0,
    weaponDefIndex: -1,
    killIcon: '',
    damage: 0,
    baseDamage: 0,
    damageForForce: 0,
    maxDamage: 0,
    damageType: 0,
    customKill: 0,
    critType: CRIT_NONE,
    position: vec3(),
    force: vec3(),
    reportedPosition: vec3(),
    damagedOtherPlayers: 0,
    damageBonus: 0,
    directHitEntity: NO_ENTITY,
    hitGroup: 0,
    afterburn: 0,
  };
}

export function copyDamageInfo(out: DamageInfo, src: DamageInfo): DamageInfo {
  out.attacker = src.attacker;
  out.inflictor = src.inflictor;
  out.weaponId = src.weaponId;
  out.weaponDefIndex = src.weaponDefIndex;
  out.killIcon = src.killIcon;
  out.damage = src.damage;
  out.baseDamage = src.baseDamage;
  out.damageForForce = src.damageForForce;
  out.maxDamage = src.maxDamage;
  out.damageType = src.damageType;
  out.customKill = src.customKill;
  out.critType = src.critType;
  copy(out.position, src.position);
  copy(out.force, src.force);
  copy(out.reportedPosition, src.reportedPosition);
  out.damagedOtherPlayers = src.damagedOtherPlayers;
  out.damageBonus = src.damageBonus;
  out.directHitEntity = src.directHitEntity;
  out.hitGroup = src.hitGroup;
  out.afterburn = src.afterburn;
  return out;
}

export function resetDamageInfo(info: DamageInfo): DamageInfo {
  info.attacker = NO_ENTITY;
  info.inflictor = NO_ENTITY;
  info.weaponId = 0;
  info.weaponDefIndex = -1;
  info.killIcon = '';
  info.damage = 0;
  info.baseDamage = 0;
  info.damageForForce = 0;
  info.maxDamage = 0;
  info.damageType = 0;
  info.customKill = 0;
  info.critType = CRIT_NONE;
  set(info.position, 0, 0, 0);
  set(info.force, 0, 0, 0);
  set(info.reportedPosition, 0, 0, 0);
  info.damagedOtherPlayers = 0;
  info.damageBonus = 0;
  info.directHitEntity = NO_ENTITY;
  info.hitGroup = 0;
  info.afterburn = 0;
  return info;
}
