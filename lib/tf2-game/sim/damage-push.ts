/**
 * DamageForce and CTFPlayer::ApplyPushFromDamage — the knockback a hit gives a
 * player (and blast jumping). Split from sim/damage.ts so the item damage rules
 * can push a player without importing the damage pipeline that imports them.
 */

import { set, vec3, type Vec3 } from '../core/vec';
import {
  FL_ONGROUND,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_PYRO,
  TF_CLASS_SOLDIER,
  VEC_DUCK_HULL_MAX,
  VEC_DUCK_HULL_MIN,
} from '../core/constants';
import { TF_COND } from './conditions';
import type { Player } from './player';
import { hookPlayer } from './items/attributes';
import {
  DAMAGE_FORCE_SCALE_SELF,
  DMG_BLAST,
  DMG_BULLET,
  SENTRY_MAX_RANGE,
  TF_DAMAGEFORCESCALE_OTHER,
  TF_DAMAGEFORCESCALE_PYRO_JUMP,
  TF_DAMAGEFORCESCALE_SELF_SOLDIER_BADRJ,
  TF_DAMAGEFORCESCALE_SELF_SOLDIER_RJ,
  TF_DMG_CUSTOM_FLARE_EXPLOSION,
  TF_WEAPON,
  type DamageInfo,
} from './damage-info';

const scratchSize = vec3();
const HULL_DUCK_Z = VEC_DUCK_HULL_MAX.z - VEC_DUCK_HULL_MIN.z;
const scratchForce = vec3();

/** SDK: DamageForce (tf_player.cpp) — knockback speed from damage and hull size, capped at 1000. */
export function damageForce(size: Vec3, damage: number, scale: number): number {
  const force = damage * ((48 * 48 * 82.0) / (size.x * size.y * size.z)) * scale;
  return force > 1000 ? 1000 : force;
}

/**
 * SDK: CTFPlayer::ApplyPushFromDamage. `dir` points from the victim toward
 * the inflictor (normalized); the push goes the other way.
 */
export function applyPushFromDamage(player: Player, info: DamageInfo, dir: Vec3): void {
  if (!player.world.rules.canPlayerMove(player) && !player.world.options.preroundPushFromDamage) return;
  const force = scratchForce;
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

  // damage_force_reduction on the victim (the Shortstop, the Mantreads) — not for self damage.
  if (info.attacker !== player.id) {
    const reduce = hookPlayer(player, 'damage_force_reduction', 1);
    if (reduce !== 1) set(force, force.x * reduce, force.y * reduce, force.z * reduce);
  }
  player.applyAbsVelocityImpulse(force);
  if (info.attacker !== player.id && info.damageType & DMG_BLAST) player.takenBlastDamageSinceLastMovement = true;
}

/** m_iBlastJumpState bits. */
export const TF_PLAYER_STICKY_JUMPED = 0x01;
export const TF_PLAYER_ROCKET_JUMPED = 0x02;
/** Knocked into the air by an enemy's blast (CTFGameMovement::CategorizePosition). */
export const TF_PLAYER_ENEMY_BLASTED_ME = 0x04;
