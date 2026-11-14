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

import {
  copy,
  length,
  normalize,
  remapClamped,
  set,
  simpleSpline,
  sub,
  vec3,
  type Vec3,
} from '../core/vec';
import {
  emptyTrace,
  NO_ENTITY,
} from '../core/types';
import type { Entity } from './entity';
import { TF_COND } from './conditions';
import type { Player } from './player';
import type { GameWorld } from './world';
import {
  hookInt,
  hookWeapon,
} from './items/attributes';
import {
  damageWeapon,
  inAirDueToExplosion,
} from './items/damage-query';
import { applyRadiusHeal } from './items/hooks';
import {
  unlockDamageVsPlayers,
  unlockEnergyBuffDamageTaken,
  unlockForcedCrits,
  unlockMiniCrits,
  unlockPostModify,
  unlockPreDistance,
  unlockPromoteMiniCrit,
} from './items/damage-rules';

// The damage record + constants and the knockback live in leaf modules (so the item rules can use
// them without importing this pipeline); callers outside that cycle keep importing them from here.
import {
  CRIT_FULL,
  CRIT_MINI,
  CRIT_NONE,
  DMG_CRITICAL,
  DMG_CRUSH,
  DMG_DROWN,
  DMG_FALL,
  DMG_HALF_FALLOFF,
  DMG_NOCLOSEDISTANCEMOD,
  DMG_RADIUS_MAX,
  DMG_USEDISTANCEMOD,
  MASK_RADIUS_DAMAGE,
  SENTRY_MAX_RANGE,
  TF_DAMAGE_CRIT_MULTIPLIER,
  TF_DAMAGE_MINICRIT_MULTIPLIER,
  TF_DAMAGE_OPTIMAL_DISTANCE,
  TF_DAMAGE_RANGE,
  TF_DMG_CUSTOM_BACKSTAB,
  TF_SELF_GRENADE_DAMAGE_SCALE,
  TF_WEAPON,
  copyDamageInfo,
  createDamageInfo,
  isSniperRifleId,
  type CritType,
  type DamageInfo,
} from './damage-info';
export * from './damage-info';
export * from './damage-push';

/** The SDK's SimpleSplineRemapValClamped. */
function simpleSplineRemapClamped(
  val: number,
  a: number,
  b: number,
  c: number,
  d: number,
): number {
  if (
    a ===
    b
  )
    return val >=
      b
      ? d
      : c;
  let t =
    (val -
      a) /
    (b -
      a);
  t =
    t <
    0
      ? 0
      : t >
          1
        ? 1
        : t;
  return (
    c +
    (d -
      c) *
      simpleSpline(
        t,
      )
  );
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
  /** crit_dmg_falloff (the Ambassador): a crit keeps the distance falloff. */
  forceCritFalloff?: boolean;
}

/**
 * The distance (ramp-up/fall-off) and crit block of
 * CTFGameRules::ApplyOnDamageModifyRules, with spread disabled. Returns the
 * final damage before resistances. Crits ignore distance and triple;
 * mini-crits keep the ramp-up, ignore the fall-off and multiply by 1.35.
 */
export function applyDistanceAndCrit(
  input: DistanceModInput,
): {
  damage: number;
  bonus: number;
} {
  const crit =
    input.critType;
  const bCrit =
    crit ===
      CRIT_FULL ||
    (input.damageType &
      DMG_CRITICAL) !==
      0;
  let flDamage =
    input.current ??
    input.damage;
  const bitsDamage =
    input.damageType;
  // tf_weapon_criticals_distance_falloff / minicrits_distance_falloff are 0; crit_dmg_falloff forces it.
  const bForceCritFalloff =
    !!input.forceCritFalloff &&
    (bitsDamage &
      DMG_USEDISTANCEMOD) !==
      0;
  const bDoShortRangeDistanceIncrease =
    !bCrit ||
    crit ===
      CRIT_MINI;
  const bDoLongRangeDistanceDecrease =
    !input.ignoreLongRange &&
    (bForceCritFalloff ||
      (!bCrit &&
        crit !==
          CRIT_MINI));

  let flRandomDamage =
    input.damage *
    TF_DAMAGE_RANGE;
  const spread = 0.1;
  let flMin =
    0.5 -
    spread;

  if (
    bitsDamage &
    DMG_USEDISTANCEMOD
  ) {
    const optimal =
      input.optimalDistance ??
      TF_DAMAGE_OPTIMAL_DISTANCE;
    const distance =
      Math.max(
        1,
        input.distance,
      );
    let center =
      remapClamped(
        distance /
          optimal,
        0,
        2,
        1,
        0,
      );
    if (
      (center >
        0.5 &&
        bDoShortRangeDistanceIncrease) ||
      center <=
        0.5
    ) {
      if (
        bitsDamage &
          DMG_NOCLOSEDISTANCEMOD &&
        center >
          0.5
      ) {
        // RemapVal (unclamped) 0.5…1 → 0.5…0.65
        center =
          0.5 +
          ((center -
            0.5) /
            0.5) *
            0.15;
      }
      flMin =
        Math.max(
          0,
          center -
            spread,
        );
    }
  }
  // tf_damage_disablespread 1: the centre of the range.
  const randomRangeVal =
    flMin +
    spread;

  if (
    input.attackerIsPlayer !==
    false
  ) {
    switch (
      input.weaponId
    ) {
      case TF_WEAPON.ROCKETLAUNCHER:
      case TF_WEAPON.ROCKETLAUNCHER_DIRECTHIT:
      case TF_WEAPON.PARTICLE_CANNON:
        if (
          randomRangeVal >
          0.5
        )
          flRandomDamage *= 0.5;
        break;
      case TF_WEAPON.PIPEBOMBLAUNCHER:
      case TF_WEAPON.GRENADELAUNCHER:
      case TF_WEAPON.CANNON:
      case TF_WEAPON.STICKBOMB:
        if (
          !(
            bitsDamage &
            DMG_NOCLOSEDISTANCEMOD
          )
        )
          flRandomDamage *= 0.2;
        break;
      case TF_WEAPON.SCATTERGUN:
      case TF_WEAPON.SODA_POPPER:
      case TF_WEAPON.PEP_BRAWLER_BLASTER:
        if (
          randomRangeVal >
          0.5
        )
          flRandomDamage *= 1.5;
        break;
    }
  }

  const variance =
    simpleSplineRemapClamped(
      randomRangeVal,
      0,
      1,
      -flRandomDamage,
      flRandomDamage,
    );
  if (
    (bDoShortRangeDistanceIncrease &&
      variance >
        0) ||
    bDoLongRangeDistanceDecrease
  )
    flDamage +=
      variance;

  let critDamage = 0;
  if (
    crit ===
    CRIT_MINI
  )
    critDamage =
      (TF_DAMAGE_MINICRIT_MULTIPLIER -
        1) *
      flDamage;
  else if (
    bCrit
  )
    critDamage =
      (TF_DAMAGE_CRIT_MULTIPLIER -
        1) *
      flDamage;
  const bonus =
    bCrit ||
    crit ===
      CRIT_MINI
      ? critDamage +
        (bForceCritFalloff
          ? 0
          : Math.abs(
              variance,
            ))
      : 0;
  return {
    damage:
      flDamage +
      critDamage,
    bonus,
  };
}

const scratchA =
  vec3();
const scratchB =
  vec3();

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
  if (
    !info.damageForForce
  )
    info.damageForForce =
      info.damage;
  const victim =
    victimEnt.isPlayer()
      ? (victimEnt as Player)
      : null;
  const attackerEnt =
    world.entity(
      info.attacker,
    );
  const tfAttacker =
    attackerEnt &&
    attackerEnt.isPlayer()
      ? (attackerEnt as Player)
      : null;
  let flDamage =
    info.damage;
  if (
    !info.baseDamage
  )
    info.baseDamage =
      info.damage;

  if (
    info.damageType &
    DMG_CRITICAL
  )
    info.critType =
      CRIT_FULL;

  // Item-forced crits (or_crit_vs_playercond, crit_vs_wet_players, the Axtinguisher, the Market Gardener).
  unlockForcedCrits(
    world,
    info,
    victim,
    tfAttacker,
  );

  // Mini-crits (only when the attacker isn't the victim).
  if (
    attackerEnt !==
    victimEnt
  )
    flDamage =
      unlockMiniCrits(
        world,
        info,
        victim,
        tfAttacker,
        flDamage,
      );
  if (
    attackerEnt !==
      victimEnt &&
    info.critType ===
      CRIT_NONE
  ) {
    if (
      victim &&
      (victim.cond.has(
        TF_COND.URINE,
      ) ||
        victim.cond.has(
          TF_COND.MARKEDFORDEATH,
        ) ||
        victim.cond.has(
          TF_COND.MARKEDFORDEATH_SILENT,
        ))
    ) {
      info.critType =
        CRIT_MINI;
    } else if (
      tfAttacker &&
      (tfAttacker.cond.has(
        TF_COND.OFFENSEBUFF,
      ) ||
        tfAttacker.cond.has(
          TF_COND.NOHEALINGDAMAGEBUFF,
        ))
    ) {
      info.critType =
        CRIT_MINI;
    } else if (
      tfAttacker &&
      tfAttacker.cond.has(
        TF_COND.ENERGY_BUFF,
      )
    ) {
      info.critType =
        CRIT_MINI;
    } else if (
      tfAttacker &&
      tfAttacker.cond.has(
        TF_COND.MINICRITBOOSTED_ON_KILL,
      )
    ) {
      info.critType =
        CRIT_MINI;
    }
    // Reflected projectiles mini-crit: the projectile says so.
    const inflictor =
      world.entity(
        info.inflictor,
      );
    if (
      info.critType ===
        CRIT_NONE &&
      inflictor &&
      !inflictor.isPlayer() &&
      world.isDeflected(
        inflictor,
      )
    ) {
      info.critType =
        CRIT_MINI;
    }
    // Weapons that mini-crit targets an enemy explosion put in the air (mini_crit_airborne: the Direct Hit).
    if (
      info.critType ===
        CRIT_NONE &&
      victim &&
      inAirDueToExplosion(
        victim,
      )
    ) {
      const weapon =
        damageWeapon(
          world,
          info,
        );
      if (
        weapon &&
        hookInt(
          hookWeapon(
            weapon,
            weapon.owner,
            'mini_crit_airborne',
            0,
          ),
        ) ===
          1
      )
        info.critType =
          CRIT_MINI;
    }
  }
  unlockPromoteMiniCrit(
    world,
    info,
  );

  // Invulnerable: events only (the caller still applies the push).
  if (
    victim &&
    victim
      .cond
      .invulnerable &&
    !allowDamage
  )
    return false;

  // Attributes that change damage against players (mult_dmg_vs_players).
  if (
    victim
  ) {
    const weapon =
      damageWeapon(
        world,
        info,
      );
    if (
      weapon
    )
      flDamage =
        hookWeapon(
          weapon,
          weapon.owner,
          'mult_dmg_vs_players',
          flDamage,
        );
    flDamage =
      unlockDamageVsPlayers(
        world,
        info,
        victim,
        tfAttacker,
        flDamage,
      );
  }

  // Defense buffs (Battalion's Backup), unless backstab or crush.
  if (
    victim &&
    info.customKill !==
      TF_DMG_CUSTOM_BACKSTAB &&
    (info.damageType &
      DMG_CRUSH) ===
      0
  ) {
    if (
      victim.cond.has(
        TF_COND.DEFENSEBUFF,
      )
    ) {
      info.critType =
        CRIT_NONE;
      info.damageType &=
        ~DMG_CRITICAL;
    }
    if (
      victim.cond.has(
        TF_COND.DEFENSEBUFF_HIGH,
      )
    )
      flDamage *= 0.25;
    else if (
      victim.cond.has(
        TF_COND.DEFENSEBUFF,
      ) ||
      victim.cond.has(
        TF_COND.DEFENSEBUFF_NO_CRIT_BLOCK,
      )
    ) {
      const inflictor =
        world.entity(
          info.inflictor,
        );
      flDamage *=
        inflictor &&
        inflictor.isBaseObject()
          ? 0.5
          : 0.65;
    }
  }

  // Distance modification and crit multiplication — not for self damage, falling or drowning.
  if (
    attackerEnt !==
      victimEnt &&
    !(
      info.damageType &
      (DMG_DROWN |
        DMG_FALL)
    )
  ) {
    let distance = 0;
    let optimal =
      TF_DAMAGE_OPTIMAL_DISTANCE;
    if (
      info.damageType &
      DMG_USEDISTANCEMOD
    ) {
      const inflictor =
        world.entity(
          info.inflictor,
        );
      let src: Entity | null =
        attackerEnt;
      if (
        inflictor &&
        inflictor.isBaseObject()
      ) {
        src =
          inflictor;
        optimal =
          SENTRY_MAX_RANGE;
      } else if (
        isSniperRifleId(
          info.weaponId,
        )
      )
        optimal *= 2.5;
      if (
        src
      ) {
        src.worldSpaceCenter(
          scratchA,
        );
        victimEnt.worldSpaceCenter(
          scratchB,
        );
        distance =
          length(
            sub(
              scratchA,
              scratchB,
              scratchA,
            ),
          );
      }
    }
    const forceCritFalloff =
      unlockPreDistance(
        world,
        info,
      );
    const res =
      applyDistanceAndCrit(
        {
          damage:
            info.damage,
          current:
            flDamage,
          distance,
          damageType:
            info.damageType,
          weaponId:
            info.weaponId,
          critType:
            info.critType,
          optimalDistance:
            optimal,
          attackerIsPlayer:
            !!tfAttacker,
          forceCritFalloff,
        },
      );
    flDamage =
      res.damage;
    if (
      info.critType ===
        CRIT_NONE &&
      !(
        info.damageType &
        DMG_CRITICAL
      )
    )
      flDamage =
        unlockEnergyBuffDamageTaken(
          victim,
          info,
          flDamage,
        );
    if (
      info.critType !==
        CRIT_NONE ||
      info.damageType &
        DMG_CRITICAL
    ) {
      info.damageType |=
        DMG_CRITICAL;
      if (
        info.critType ===
        CRIT_NONE
      )
        info.critType =
          CRIT_FULL;
      info.damageBonus =
        res.bonus;
    }
  }

  flDamage =
    unlockPostModify(
      world,
      info,
      victim,
      tfAttacker,
      flDamage,
    );
  info.damage =
    flDamage;
  return true;
}

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

export function createRadiusDamageInfo(
  info: DamageInfo,
  src: Vec3,
  radius: number,
): RadiusDamageInfo {
  return {
    info,
    src,
    radius,
    ignore:
      NO_ENTITY,
    rjRadius: 0,
    forceScale: 1,
    rjBaseDamage: 0,
  };
}

/** SDK: CTFRadiusDamageInfo::CalculateFalloff. */
export function radiusFalloff(
  damage: number,
  radius: number,
  damageType: number,
): number {
  if (
    damageType &
    DMG_RADIUS_MAX
  )
    return 0;
  if (
    damageType &
    DMG_HALF_FALLOFF
  )
    return 0.5;
  if (
    radius
  )
    return (
      damage /
      radius
    );
  return 1;
}

const rdTrace =
  emptyTrace();
const rdSpot =
  vec3();
const rdDir =
  vec3();
const rdCenter =
  vec3();
const rdNearest =
  vec3();
const rdCandidates: Entity[] =
  [];
const rdInfo =
  createDamageInfo();

/** SDK: CTFRadiusDamageInfo::ApplyToEntity. Returns damage taken. */
function applyRadiusToEntity(
  world: GameWorld,
  r: RadiusDamageInfo,
  ent: Entity,
  falloff: number,
): number {
  const info =
    r.info;
  if (
    ent.id ===
      r.ignore ||
    ent.takeDamage ===
      0
  )
    return 0;
  // BodyTarget: a player's eye position, anything else its centre.
  if (
    ent.isPlayer()
  )
    (
      ent as Player
    ).eyePosition(
      rdSpot,
    );
  else
    ent.worldSpaceCenter(
      rdSpot,
    );

  // Only the world (and brush entities) blocks blasts: ignore players and projectiles.
  world.traceLineWorldOnly(
    r.src,
    rdSpot,
    MASK_RADIUS_DAMAGE,
    rdTrace,
  );
  if (
    rdTrace.fraction !==
      1 &&
    rdTrace.entity !==
      ent.id
  )
    return 0;

  let dist: number;
  if (
    info.directHitEntity ===
    ent.id
  )
    dist = 0;
  else if (
    ent.isPlayer()
  ) {
    ent.worldSpaceCenter(
      rdCenter,
    );
    const toCenter =
      Math.hypot(
        r
          .src
          .x -
          rdCenter.x,
        r
          .src
          .y -
          rdCenter.y,
        r
          .src
          .z -
          rdCenter.z,
      );
    const toOrigin =
      Math.hypot(
        r
          .src
          .x -
          ent
            .origin
            .x,
        r
          .src
          .y -
          ent
            .origin
            .y,
        r
          .src
          .z -
          ent
            .origin
            .z,
      );
    dist =
      Math.min(
        toCenter,
        toOrigin,
      );
  } else {
    dist =
      Math.hypot(
        r
          .src
          .x -
          rdTrace
            .endPos
            .x,
        r
          .src
          .y -
          rdTrace
            .endPos
            .y,
        r
          .src
          .z -
          rdTrace
            .endPos
            .z,
      );
  }

  let adjusted =
    remapClamped(
      dist,
      0,
      r.radius,
      info.damage,
      info.damage *
        falloff,
    );
  if (
    ent.id ===
    info.attacker
  ) {
    switch (
      info.weaponId
    ) {
      case TF_WEAPON.PIPEBOMBLAUNCHER:
      case TF_WEAPON.GRENADELAUNCHER:
      case TF_WEAPON.CANNON:
      case TF_WEAPON.STICKBOMB:
        adjusted *=
          TF_SELF_GRENADE_DAMAGE_SCALE;
        break;
    }
  }
  if (
    adjusted <=
    0
  )
    return 0;

  const adj =
    copyDamageInfo(
      rdInfo,
      info,
    );
  adj.damage =
    adjusted;
  sub(
    rdDir,
    rdSpot,
    r.src,
  );
  normalize(
    rdDir,
  );
  // Damage force for ragdolls: CalculateExplosiveDamageForce without the random fudge.
  const forceMag =
    Math.min(
      info.baseDamage ||
        info.damage,
      100,
    ) *
    4 *
    r.forceScale;
  set(
    adj.force,
    rdDir.x *
      forceMag,
    rdDir.y *
      forceMag,
    rdDir.z *
      forceMag,
  );
  copy(
    adj.position,
    r.src,
  );
  return world.applyDamage(
    ent,
    adj,
  );
}

/**
 * SDK: CTFGameRules::RadiusDamage(CTFRadiusDamageInfo&). Damages everything
 * within `radius` of `src` that the blast can see, with linear falloff to
 * `falloff × damage` at the edge. With `rjRadius` the attacker is processed
 * last with the base weapon damage (rocket jumps feel the same whatever the
 * launcher's radius).
 */
export function radiusDamage(
  world: GameWorld,
  r: RadiusDamageInfo,
): void {
  const info =
    r.info;
  const falloff =
    radiusFalloff(
      info.damage,
      r.radius,
      info.damageType,
    );
  let enemiesHit = 0;
  let dealt = 0;
  if (
    r.radius >
    0
  ) {
    rdCandidates.length = 0;
    world.entitiesInSphere(
      r.src,
      r.radius,
      rdCandidates,
    );
    const attacker =
      world.entity(
        info.attacker,
      );
    const radSqr =
      r.radius *
      r.radius;
    for (
      let i = 0;
      i <
      rdCandidates.length;
      i++
    ) {
      const e =
        rdCandidates[
          i
        ];
      if (
        r.rjRadius &&
        e.id ===
          info.attacker
      )
        continue;
      e.nearestPoint(
        r.src,
        rdNearest,
      );
      const dx =
        r
          .src
          .x -
        rdNearest.x;
      const dy =
        r
          .src
          .y -
        rdNearest.y;
      const dz =
        r
          .src
          .z -
        rdNearest.z;
      if (
        dx *
          dx +
          dy *
            dy +
          dz *
            dz >
        radSqr
      )
        continue;
      const taken =
        applyRadiusToEntity(
          world,
          r,
          e,
          falloff,
        );
      if (
        taken &&
        e.isPlayer() &&
        attacker &&
        !e.inSameTeam(
          attacker,
        )
      ) {
        enemiesHit++;
        dealt +=
          Math.trunc(
            taken,
          );
      }
    }
  }
  if (
    r.rjRadius &&
    info.attacker !==
      NO_ENTITY
  ) {
    const attacker =
      world.entity(
        info.attacker,
      );
    if (
      !attacker
    )
      return;
    const saved =
      {
        radius:
          r.radius,
        damage:
          info.damage,
        base: info.baseDamage,
        others:
          info.damagedOtherPlayers,
      };
    r.radius =
      r.rjRadius;
    if (
      r.rjBaseDamage >
      0
    ) {
      info.damage =
        r.rjBaseDamage;
      info.baseDamage =
        r.rjBaseDamage;
    }
    info.damagedOtherPlayers =
      enemiesHit;
    // Health from the damage the blast did to enemies (add_health_on_radius_damage: the Black Box).
    if (
      dealt >
        0 &&
      attacker.isPlayer()
    )
      applyRadiusHeal(
        attacker as Player,
        damageWeapon(
          world,
          info,
        ),
        dealt,
        info.damage,
      );
    attacker.nearestPoint(
      r.src,
      rdNearest,
    );
    const dx =
      r
        .src
        .x -
      rdNearest.x;
    const dy =
      r
        .src
        .y -
      rdNearest.y;
    const dz =
      r
        .src
        .z -
      rdNearest.z;
    if (
      dx *
        dx +
        dy *
          dy +
        dz *
          dz <=
      r.radius *
        r.radius
    ) {
      applyRadiusToEntity(
        world,
        r,
        attacker,
        radiusFalloff(
          info.damage,
          r.radius,
          info.damageType,
        ),
      );
    }
    r.radius =
      saved.radius;
    info.damage =
      saved.damage;
    info.baseDamage =
      saved.base;
    info.damagedOtherPlayers =
      saved.others;
  }
}

/** Hull-size helper for tests: the standing / crouched TF hull dimensions. */
export const STANDING_HULL_SIZE: Readonly<Vec3> =
  {
    x: 48,
    y: 48,
    z: 82,
  };
export const CROUCHED_HULL_SIZE: Readonly<Vec3> =
  {
    x: 48,
    y: 48,
    z: 62,
  };
