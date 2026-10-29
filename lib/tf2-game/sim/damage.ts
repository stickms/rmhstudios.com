/**
 * Damage: the CTakeDamageInfo record, the damage-type bits, and the TF game
 * rules that turn a weapon's base damage into what a victim takes —
 * CTFGameRules::ApplyOnDamageModifyRules (crits, mini-crits, distance
 * ramp-up/fall-off), CTFRadiusDamageInfo (explosions), DamageForce and
 * CTFPlayer::ApplyPushFromDamage (knockback and blast jumping).
 *
 * Random damage spread is OFF, as in modern TF2 (tf_damage_disablespread 1):
 * the distance curve is applied at its centre value, so damage is a pure
 * function of distance.
 */

import { copy, length, normalize, remapClamped, set, simpleSpline, sub, vec3, type Vec3 } from '../core/vec';
import { emptyTrace, NO_ENTITY } from '../core/types';
import {
  CONTENTS_GRATE,
  CONTENTS_MOVEABLE,
  CONTENTS_SOLID,
  CONTENTS_WINDOW,
  FL_ONGROUND,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_PYRO,
  TF_CLASS_SOLDIER,
  VEC_DUCK_HULL_MAX,
  VEC_DUCK_HULL_MIN,
} from '../core/constants';
import type { Entity } from './entity';
import { TF_COND } from './conditions';
import type { Player } from './player';
import type { GameWorld } from './world';

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

/** The SDK's SimpleSplineRemapValClamped. */
function simpleSplineRemapClamped(val: number, a: number, b: number, c: number, d: number): number {
  if (a === b) return val >= b ? d : c;
  let t = (val - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return c + (d - c) * simpleSpline(t);
}

export interface DistanceModInput {
  /** The damage the weapon dealt (info.GetDamage() before modification — the variance scales with it). */
  damage: number;
  /** Damage after earlier modifiers (attributes); defaults to `damage`. */
  current?: number;
  /** Victim centre to attacker centre (WorldSpaceCenter). */
  distance: number;
  damageType: number;
  weaponId: number;
  critType: CritType;
  /** Rocket Specialist / powerups. */
  ignoreLongRange?: boolean;
  /** 512, or SENTRY_MAX_RANGE for sentries, ×2.5 for sniper rifles. */
  optimalDistance?: number;
  /** Whether the attacker is a player (the per-weapon tweaks apply only then). */
  attackerIsPlayer?: boolean;
}

/**
 * The distance (ramp-up/fall-off) and crit block of
 * CTFGameRules::ApplyOnDamageModifyRules, with spread disabled. Returns the
 * final damage before resistances. Crits ignore distance and triple;
 * mini-crits keep the ramp-up, ignore the fall-off and multiply by 1.35.
 */
export function applyDistanceAndCrit(input: DistanceModInput): { damage: number; bonus: number } {
  const crit = input.critType;
  const bCrit = crit === CRIT_FULL || (input.damageType & DMG_CRITICAL) !== 0;
  let flDamage = input.current ?? input.damage;
  const bitsDamage = input.damageType;
  // tf_weapon_criticals_distance_falloff / minicrits_distance_falloff are 0.
  const bForceCritFalloff = false;
  const bDoShortRangeDistanceIncrease = !bCrit || crit === CRIT_MINI;
  const bDoLongRangeDistanceDecrease =
    !input.ignoreLongRange && (bForceCritFalloff || (!bCrit && crit !== CRIT_MINI));

  let flRandomDamage = input.damage * TF_DAMAGE_RANGE;
  const spread = 0.1;
  let flMin = 0.5 - spread;

  if (bitsDamage & DMG_USEDISTANCEMOD) {
    const optimal = input.optimalDistance ?? TF_DAMAGE_OPTIMAL_DISTANCE;
    const distance = Math.max(1, input.distance);
    let center = remapClamped(distance / optimal, 0, 2, 1, 0);
    if ((center > 0.5 && bDoShortRangeDistanceIncrease) || center <= 0.5) {
      if (bitsDamage & DMG_NOCLOSEDISTANCEMOD && center > 0.5) {
        // RemapVal (unclamped) 0.5…1 → 0.5…0.65
        center = 0.5 + ((center - 0.5) / 0.5) * 0.15;
      }
      flMin = Math.max(0, center - spread);
    }
  }
  // tf_damage_disablespread 1: the centre of the range.
  const randomRangeVal = flMin + spread;

  if (input.attackerIsPlayer !== false) {
    switch (input.weaponId) {
      case TF_WEAPON.ROCKETLAUNCHER:
      case TF_WEAPON.ROCKETLAUNCHER_DIRECTHIT:
      case TF_WEAPON.PARTICLE_CANNON:
        if (randomRangeVal > 0.5) flRandomDamage *= 0.5;
        break;
      case TF_WEAPON.PIPEBOMBLAUNCHER:
      case TF_WEAPON.GRENADELAUNCHER:
      case TF_WEAPON.CANNON:
      case TF_WEAPON.STICKBOMB:
        if (!(bitsDamage & DMG_NOCLOSEDISTANCEMOD)) flRandomDamage *= 0.2;
        break;
      case TF_WEAPON.SCATTERGUN:
      case TF_WEAPON.SODA_POPPER:
      case TF_WEAPON.PEP_BRAWLER_BLASTER:
        if (randomRangeVal > 0.5) flRandomDamage *= 1.5;
        break;
    }
  }

  const variance = simpleSplineRemapClamped(randomRangeVal, 0, 1, -flRandomDamage, flRandomDamage);
  if ((bDoShortRangeDistanceIncrease && variance > 0) || bDoLongRangeDistanceDecrease) flDamage += variance;

  let critDamage = 0;
  if (crit === CRIT_MINI) critDamage = (TF_DAMAGE_MINICRIT_MULTIPLIER - 1) * flDamage;
  else if (bCrit) critDamage = (TF_DAMAGE_CRIT_MULTIPLIER - 1) * flDamage;
  const bonus = bCrit || crit === CRIT_MINI ? critDamage + (bForceCritFalloff ? 0 : Math.abs(variance)) : 0;
  return { damage: flDamage + critDamage, bonus };
}

/** SDK: DamageForce (tf_player.cpp) — knockback speed from damage and hull size, capped at 1000. */
export function damageForce(size: Vec3, damage: number, scale: number): number {
  const force = damage * ((48 * 48 * 82.0) / (size.x * size.y * size.z)) * scale;
  return force > 1000 ? 1000 : force;
}

const scratchA = vec3();
const scratchB = vec3();
const scratchSize = vec3();
const HULL_DUCK_Z = VEC_DUCK_HULL_MAX.z - VEC_DUCK_HULL_MIN.z;

/**
 * SDK: CTFGameRules::ApplyOnDamageModifyRules. Mutates `info.damage` and
 * `info.critType`. Returns false when the damage must not be applied (the
 * victim is invulnerable: it still gets pushed, which the caller handles).
 */
export function applyOnDamageModifyRules(
  world: GameWorld,
  info: DamageInfo,
  victimEnt: Entity,
  allowDamage: boolean,
): boolean {
  if (!info.damageForForce) info.damageForForce = info.damage;
  const victim = victimEnt.isPlayer() ? (victimEnt as Player) : null;
  const attackerEnt = world.entity(info.attacker);
  const tfAttacker = attackerEnt && attackerEnt.isPlayer() ? (attackerEnt as Player) : null;
  let flDamage = info.damage;
  if (!info.baseDamage) info.baseDamage = info.damage;

  if (info.damageType & DMG_CRITICAL) info.critType = CRIT_FULL;

  // Mini-crits (only when the attacker isn't the victim).
  if (attackerEnt !== victimEnt && info.critType === CRIT_NONE) {
    if (
      victim &&
      (victim.cond.has(TF_COND.URINE) ||
        victim.cond.has(TF_COND.MARKEDFORDEATH) ||
        victim.cond.has(TF_COND.MARKEDFORDEATH_SILENT))
    ) {
      info.critType = CRIT_MINI;
    } else if (tfAttacker && (tfAttacker.cond.has(TF_COND.OFFENSEBUFF) || tfAttacker.cond.has(TF_COND.NOHEALINGDAMAGEBUFF))) {
      info.critType = CRIT_MINI;
    } else if (tfAttacker && tfAttacker.cond.has(TF_COND.ENERGY_BUFF)) {
      info.critType = CRIT_MINI;
    } else if (tfAttacker && tfAttacker.cond.has(TF_COND.MINICRITBOOSTED_ON_KILL)) {
      info.critType = CRIT_MINI;
    }
    // Reflected projectiles mini-crit: the projectile says so.
    const inflictor = world.entity(info.inflictor);
    if (info.critType === CRIT_NONE && inflictor && !inflictor.isPlayer() && world.isDeflected(inflictor)) {
      info.critType = CRIT_MINI;
    }
  }

  // Invulnerable: events only (the caller still applies the push).
  if (victim && victim.cond.invulnerable && !allowDamage) return false;

  // Defense buffs (Battalion's Backup), unless backstab or crush.
  if (victim && info.customKill !== TF_DMG_CUSTOM_BACKSTAB && (info.damageType & DMG_CRUSH) === 0) {
    if (victim.cond.has(TF_COND.DEFENSEBUFF)) {
      info.critType = CRIT_NONE;
      info.damageType &= ~DMG_CRITICAL;
    }
    if (victim.cond.has(TF_COND.DEFENSEBUFF_HIGH)) flDamage *= 0.25;
    else if (victim.cond.has(TF_COND.DEFENSEBUFF) || victim.cond.has(TF_COND.DEFENSEBUFF_NO_CRIT_BLOCK)) {
      const inflictor = world.entity(info.inflictor);
      flDamage *= inflictor && inflictor.isBaseObject() ? 0.5 : 0.65;
    }
  }

  // Distance modification and crit multiplication — not for self damage, falling or drowning.
  if (attackerEnt !== victimEnt && !(info.damageType & (DMG_DROWN | DMG_FALL))) {
    let distance = 0;
    let optimal = TF_DAMAGE_OPTIMAL_DISTANCE;
    if (info.damageType & DMG_USEDISTANCEMOD) {
      const inflictor = world.entity(info.inflictor);
      let src: Entity | null = attackerEnt;
      if (inflictor && inflictor.isBaseObject()) {
        src = inflictor;
        optimal = SENTRY_MAX_RANGE;
      } else if (isSniperRifleId(info.weaponId)) optimal *= 2.5;
      if (src) {
        src.worldSpaceCenter(scratchA);
        victimEnt.worldSpaceCenter(scratchB);
        distance = length(sub(scratchA, scratchB, scratchA));
      }
    }
    const res = applyDistanceAndCrit({
      damage: info.damage,
      current: flDamage,
      distance,
      damageType: info.damageType,
      weaponId: info.weaponId,
      critType: info.critType,
      optimalDistance: optimal,
      attackerIsPlayer: !!tfAttacker,
    });
    flDamage = res.damage;
    if (info.critType !== CRIT_NONE || info.damageType & DMG_CRITICAL) {
      info.damageType |= DMG_CRITICAL;
      if (info.critType === CRIT_NONE) info.critType = CRIT_FULL;
      info.damageBonus = res.bonus;
    }
  }

  info.damage = flDamage;
  return true;
}

/**
 * SDK: CTFPlayer::ApplyPushFromDamage. `dir` points from the victim toward
 * the inflictor (normalized); the push goes the other way.
 */
export function applyPushFromDamage(player: Player, info: DamageInfo, dir: Vec3): void {
  if (!player.world.rules.canPlayerMove(player) && !player.world.options.preroundPushFromDamage) return;
  const force = scratchA;
  set(force, 0, 0, 0);
  const size = scratchSize;
  set(size, player.maxs.x - player.mins.x, player.maxs.y - player.mins.y, player.maxs.z - player.mins.z);

  if (info.attacker === player.id) {
    if (size.z === HULL_DUCK_Z) size.z = 55; // ducking raises self blast force (the SDK's "ancient lie" comment)
    const dmgForForce = info.damageForForce || info.damage;
    if (player.playerClass === TF_CLASS_SOLDIER) {
      if (info.damageType & DMG_BLAST) {
        const scale =
          player.move.flags & FL_ONGROUND ? TF_DAMAGEFORCESCALE_SELF_SOLDIER_BADRJ : TF_DAMAGEFORCESCALE_SELF_SOLDIER_RJ;
        const f = -damageForce(size, dmgForForce, scale);
        set(force, dir.x * f, dir.y * f, dir.z * f);
        player.setBlastJumpState(TF_PLAYER_ROCKET_JUMPED);
        player.move.airDucked = 0;
      }
    } else {
      const scale =
        player.playerClass === TF_CLASS_PYRO && info.customKill === TF_DMG_CUSTOM_FLARE_EXPLOSION
          ? TF_DAMAGEFORCESCALE_PYRO_JUMP
          : DAMAGE_FORCE_SCALE_SELF;
      const f = -damageForce(size, dmgForForce, scale);
      set(force, dir.x * f, dir.y * f, dir.z * f);
      player.move.airDucked = 0;
    }
  } else {
    if (player.cond.has(TF_COND.INVULNERABLE_HIDE_UNLESS_DAMAGED)) return;
    const inflictor = player.world.entity(info.inflictor);
    if (info.damageType & DMG_BULLET && inflictor && inflictor.isBaseObject()) {
      // Sentry guns push harder; halved beyond their range.
      let mult = 16;
      const dx = inflictor.origin.x - player.origin.x;
      const dy = inflictor.origin.y - player.origin.y;
      const dz = inflictor.origin.z - player.origin.z;
      if (dx * dx + dy * dy + dz * dz > SENTRY_MAX_RANGE * SENTRY_MAX_RANGE) mult *= 0.5;
      const f = -damageForce(size, info.damage, mult);
      set(force, dir.x * f, dir.y * f, dir.z * f);
    } else {
      const f = -damageForce(size, info.damage, TF_DAMAGEFORCESCALE_OTHER);
      set(force, dir.x * f, dir.y * f, dir.z * f);
      if (info.weaponId === TF_WEAPON.COMPOUND_BOW) force.z = 0;
      if (player.playerClass === TF_CLASS_HEAVYWEAPONS) {
        force.x *= 0.5;
        force.y *= 0.5;
        force.z *= 0.5;
      }
      // Scattergun-style close range knockback removes downward force (CanScatterGunKnockBack).
    }
  }

  player.applyAbsVelocityImpulse(force);
  if (info.attacker !== player.id && info.damageType & DMG_BLAST) player.takenBlastDamageSinceLastMovement = true;
}

/** m_iBlastJumpState bits. */
export const TF_PLAYER_STICKY_JUMPED = 0x01;
export const TF_PLAYER_ROCKET_JUMPED = 0x02;

/** CTFRadiusDamageInfo. */
export interface RadiusDamageInfo {
  info: DamageInfo;
  src: Vec3;
  radius: number;
  /** Entity the blast ignores. */
  ignore: number;
  /** Rocket-jump radius: when set the attacker is damaged last with the base weapon damage at this radius. */
  rjRadius: number;
  /** Multiplier for the damage force. */
  forceScale: number;
  /** Base weapon damage used for the attacker when rjRadius is set (GetTFWpnData primary m_nDamage). */
  rjBaseDamage: number;
}

export function createRadiusDamageInfo(info: DamageInfo, src: Vec3, radius: number): RadiusDamageInfo {
  return { info, src, radius, ignore: NO_ENTITY, rjRadius: 0, forceScale: 1, rjBaseDamage: 0 };
}

/** SDK: CTFRadiusDamageInfo::CalculateFalloff. */
export function radiusFalloff(damage: number, radius: number, damageType: number): number {
  if (damageType & DMG_RADIUS_MAX) return 0;
  if (damageType & DMG_HALF_FALLOFF) return 0.5;
  if (radius) return damage / radius;
  return 1;
}

const rdTrace = emptyTrace();
const rdSpot = vec3();
const rdDir = vec3();
const rdCenter = vec3();
const rdNearest = vec3();
const rdCandidates: Entity[] = [];
const rdInfo = createDamageInfo();

/** SDK: CTFRadiusDamageInfo::ApplyToEntity. Returns damage taken. */
function applyRadiusToEntity(world: GameWorld, r: RadiusDamageInfo, ent: Entity, falloff: number): number {
  const info = r.info;
  if (ent.id === r.ignore || ent.takeDamage === 0) return 0;
  // BodyTarget: a player's eye position, anything else its centre.
  if (ent.isPlayer()) (ent as Player).eyePosition(rdSpot);
  else ent.worldSpaceCenter(rdSpot);

  // Only the world (and brush entities) blocks blasts: ignore players and projectiles.
  world.traceLineWorldOnly(r.src, rdSpot, MASK_RADIUS_DAMAGE, rdTrace);
  if (rdTrace.fraction !== 1 && rdTrace.entity !== ent.id) return 0;

  let dist: number;
  if (info.directHitEntity === ent.id) dist = 0;
  else if (ent.isPlayer()) {
    ent.worldSpaceCenter(rdCenter);
    const toCenter = Math.hypot(r.src.x - rdCenter.x, r.src.y - rdCenter.y, r.src.z - rdCenter.z);
    const toOrigin = Math.hypot(r.src.x - ent.origin.x, r.src.y - ent.origin.y, r.src.z - ent.origin.z);
    dist = Math.min(toCenter, toOrigin);
  } else {
    dist = Math.hypot(r.src.x - rdTrace.endPos.x, r.src.y - rdTrace.endPos.y, r.src.z - rdTrace.endPos.z);
  }

  let adjusted = remapClamped(dist, 0, r.radius, info.damage, info.damage * falloff);
  if (ent.id === info.attacker) {
    switch (info.weaponId) {
      case TF_WEAPON.PIPEBOMBLAUNCHER:
      case TF_WEAPON.GRENADELAUNCHER:
      case TF_WEAPON.CANNON:
      case TF_WEAPON.STICKBOMB:
        adjusted *= TF_SELF_GRENADE_DAMAGE_SCALE;
        break;
    }
  }
  if (adjusted <= 0) return 0;

  const adj = copyDamageInfo(rdInfo, info);
  adj.damage = adjusted;
  sub(rdDir, rdSpot, r.src);
  normalize(rdDir);
  // Damage force for ragdolls: CalculateExplosiveDamageForce without the random fudge.
  const forceMag = Math.min(info.baseDamage || info.damage, 100) * 4 * r.forceScale;
  set(adj.force, rdDir.x * forceMag, rdDir.y * forceMag, rdDir.z * forceMag);
  copy(adj.position, r.src);
  return world.applyDamage(ent, adj);
}

/**
 * SDK: CTFGameRules::RadiusDamage(CTFRadiusDamageInfo&). Damages everything
 * within `radius` of `src` that the blast can see, with linear falloff to
 * `falloff × damage` at the edge. With `rjRadius` the attacker is processed
 * last with the base weapon damage (rocket jumps feel the same whatever the
 * launcher's radius).
 */
export function radiusDamage(world: GameWorld, r: RadiusDamageInfo): void {
  const info = r.info;
  const falloff = radiusFalloff(info.damage, r.radius, info.damageType);
  let enemiesHit = 0;
  if (r.radius > 0) {
    rdCandidates.length = 0;
    world.entitiesInSphere(r.src, r.radius, rdCandidates);
    const attacker = world.entity(info.attacker);
    const radSqr = r.radius * r.radius;
    for (let i = 0; i < rdCandidates.length; i++) {
      const e = rdCandidates[i];
      if (r.rjRadius && e.id === info.attacker) continue;
      e.nearestPoint(r.src, rdNearest);
      const dx = r.src.x - rdNearest.x;
      const dy = r.src.y - rdNearest.y;
      const dz = r.src.z - rdNearest.z;
      if (dx * dx + dy * dy + dz * dz > radSqr) continue;
      const taken = applyRadiusToEntity(world, r, e, falloff);
      if (taken && e.isPlayer() && attacker && !e.inSameTeam(attacker)) enemiesHit++;
    }
  }
  if (r.rjRadius && info.attacker !== NO_ENTITY) {
    const attacker = world.entity(info.attacker);
    if (!attacker) return;
    const saved = { radius: r.radius, damage: info.damage, base: info.baseDamage, others: info.damagedOtherPlayers };
    r.radius = r.rjRadius;
    if (r.rjBaseDamage > 0) {
      info.damage = r.rjBaseDamage;
      info.baseDamage = r.rjBaseDamage;
    }
    info.damagedOtherPlayers = enemiesHit;
    attacker.nearestPoint(r.src, rdNearest);
    const dx = r.src.x - rdNearest.x;
    const dy = r.src.y - rdNearest.y;
    const dz = r.src.z - rdNearest.z;
    if (dx * dx + dy * dy + dz * dz <= r.radius * r.radius) {
      applyRadiusToEntity(world, r, attacker, radiusFalloff(info.damage, r.radius, info.damageType));
    }
    r.radius = saved.radius;
    info.damage = saved.damage;
    info.baseDamage = saved.base;
    info.damagedOtherPlayers = saved.others;
  }
}

/** Hull-size helper for tests: the standing / crouched TF hull dimensions. */
export const STANDING_HULL_SIZE: Readonly<Vec3> = { x: 48, y: 48, z: 82 };
export const CROUCHED_HULL_SIZE: Readonly<Vec3> = { x: 48, y: 48, z: 62 };
