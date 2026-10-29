/**
 * tf_projectile_balloffire (CTFProjectile_BallOfFire, tf_projectile_dragons_fury.cpp): the Dragon's
 * Fury's fireball. It flies at tf_fireball_speed (3000) for at most tf_fireball_distance (500) or
 * tf_fireball_max_lifetime (0.5 s), stops in water and on the world, and burns each player or
 * building whose box comes within tf_fireball_radius (22.5) of its path once: tf_fireball_damage
 * (25 × mult_dmg) with DMG_IGNITE | DMG_USEDISTANCEMOD | DMG_NOCLOSEDISTANCEMOD and 2 s of afterburn
 * (a Pyro burns half as long), ×3 (tf_fireball_burning_bonus) against a burning player its centre
 * is about to strike, and always against buildings. A hit refunds the launcher's pressure faster
 * (RefundAmmo). It lights a teammate Sniper's drawn arrow.
 *
 * Environment-agnostic.
 */

import {
  MASK_SOLID_BRUSHONLY,
  MASK_WATER,
  MOVETYPE_FLY,
  MOVETYPE_NONE,
  SURF_SKY,
  TF_CLASS_PYRO,
  TF_CLASS_SNIPER,
} from '../../core/constants';
import { emptyTrace, type TraceResult } from '../../core/types';
import { set, vec3, vectorAngles, type Vec3 } from '../../core/vec';
import { TF_DMG_CUSTOM } from '../../data/damage';
import { TF_COND } from '../conditions';
import {
  createDamageInfo,
  DMG_CRITICAL,
  DMG_IGNITE,
  DMG_NOCLOSEDISTANCEMOD,
  DMG_USEDISTANCEMOD,
  resetDamageInfo,
} from '../damage';
import { DAMAGE_NO, type Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { hookWeapon } from '../items/attributes';
import { BaseProjectile } from '../physics';
import type { Player } from '../player';
import { PROJECTILE_KIND } from './common';

/** tf_fireball_* (tf_projectile_dragons_fury.cpp). */
export const TF_FIREBALL_DISTANCE = 500;
export const TF_FIREBALL_SPEED = 3000;
export const TF_FIREBALL_DAMAGE = 25;
export const TF_FIREBALL_BURN_DURATION = 2;
export const TF_FIREBALL_RADIUS = 22.5;
export const TF_FIREBALL_BURNING_BONUS = 3;
export const TF_FIREBALL_MAX_LIFETIME = 0.5;

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const segA = vec3();
const segD = vec3();
// Lazily created (projectiles sit on the sim/damage import cycle).
let burnInfo: ReturnType<typeof createDamageInfo> | null = null;
let losTrace: TraceResult | null = null;

/** Segment a + t·d (t ∈ [0, 1]) against an entity's box grown by `half`; the entry t or −1. */
function sweptHit(a: Vec3, d: Vec3, e: Entity, half: number): number {
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const k = i === 0 ? 'x' : i === 1 ? 'y' : 'z';
    const lo = e.origin[k] + e.mins[k] - half;
    const hi = e.origin[k] + e.maxs[k] + half;
    if (Math.abs(d[k]) < 1e-9) {
      if (a[k] < lo || a[k] > hi) return -1;
      continue;
    }
    let ta = (lo - a[k]) / d[k];
    let tb = (hi - a[k]) / d[k];
    if (ta > tb) {
      const tmp = ta;
      ta = tb;
      tb = tmp;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}

/** A launcher that repressurises faster on a hit (CTFWeaponFlameBall::RefundAmmo). */
interface RefundingLauncher {
  refundAmmo(): void;
}

export class TFProjectileBallOfFire extends BaseProjectile {
  /** m_vecSpawnOrigin. */
  readonly spawnOrigin = vec3();
  /** m_vecHitPlayers (players and buildings burned, Snipers lit). */
  readonly hitEntities: number[] = [];
  fizzling = false;
  refunded = false;
  impactSoundPlayed = false;
  private readonly last = vec3();

  constructor(classname: string) {
    super(classname);
    this.model = '';
    this.setSize(ZERO, ZERO);
    this.moveType = MOVETYPE_FLY;
    this.gravity = 0;
    this.projectileKind = PROJECTILE_KIND.FIREBALL;
  }

  /** SDK: CTFProjectile_BallOfFire::Spawn. */
  override spawn(): void {
    super.spawn();
    const v = this.velocity;
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    set(
      v,
      (v.x / len) * TF_FIREBALL_SPEED,
      (v.y / len) * TF_FIREBALL_SPEED,
      (v.z / len) * TF_FIREBALL_SPEED,
    );
    vectorAngles(v, this.angles);
    this.damage = this.launcher
      ? hookWeapon(this.launcher, this.launcher.owner, 'mult_dmg', TF_FIREBALL_DAMAGE)
      : TF_FIREBALL_DAMAGE;
    set(this.spawnOrigin, this.origin.x, this.origin.y, this.origin.z);
    set(this.last, this.origin.x, this.origin.y, this.origin.z);
    this.setThink(this.distanceLimitThink, this.world.curtime);
  }

  /** The world only: players and buildings are the swept burn test's. */
  override physicsSolidMask(): number {
    return MASK_SOLID_BRUSHONLY;
  }

  /** SDK: DistanceLimitThink (clip the velocity at the range) + ExpireDelayThink + the burn sweep. */
  private readonly distanceLimitThink = (): void => {
    const w = this.world;
    this.sweep();
    if (this.removed) return;
    if (w.curtime - this.spawnTime >= TF_FIREBALL_MAX_LIFETIME) {
      w.remove(this);
      return;
    }
    if (this.fizzling) {
      this.nextThink = w.curtime;
      return;
    }
    if (w.pointContents(this.origin) & MASK_WATER) {
      this.stopAndFizzle();
      this.nextThink = w.curtime;
      return;
    }
    const dist = Math.hypot(
      this.origin.x - this.spawnOrigin.x,
      this.origin.y - this.spawnOrigin.y,
      this.origin.z - this.spawnOrigin.z,
    );
    const dt = w.frametime;
    const v = this.velocity;
    const nx = this.origin.x + v.x * dt - this.spawnOrigin.x;
    const ny = this.origin.y + v.y * dt - this.spawnOrigin.y;
    const nz = this.origin.z + v.z * dt - this.spawnOrigin.z;
    if (nx * nx + ny * ny + nz * nz > TF_FIREBALL_DISTANCE * TF_FIREBALL_DISTANCE) {
      const toGo = TF_FIREBALL_DISTANCE - dist;
      if (Math.abs(toGo) <= 1) {
        this.fizzling = true;
        set(v, 0, 0, 0);
      } else {
        const len = Math.hypot(v.x, v.y, v.z) || 1;
        const s = toGo / dt / len;
        set(v, v.x * s, v.y * s, v.z * s);
      }
    }
    this.nextThink = w.curtime;
  };

  /** SDK: StopAndFizzle. */
  stopAndFizzle(): void {
    if (this.fizzling) return;
    set(this.velocity, 0, 0, 0);
    this.moveType = MOVETYPE_NONE;
    this.fizzling = true;
    this.setThink(this.subRemove, this.world.curtime + 0.1);
  }

  /** RocketTouch against combat entities over the last move (the 22.5 trigger bounds). */
  private sweep(): void {
    const w = this.world;
    set(segA, this.last.x, this.last.y, this.last.z);
    set(
      segD,
      this.origin.x - this.last.x,
      this.origin.y - this.last.y,
      this.origin.z - this.last.z,
    );
    set(this.last, this.origin.x, this.origin.y, this.origin.z);
    w.forEachEntity((e) => {
      if (this.removed || e.id === this.owner || e.removed || e.takeDamage === DAMAGE_NO) return;
      if (!(e.isPlayer() ? (e as Player).alive : e.isBaseObject())) return;
      if (this.hitEntities.includes(e.id)) return;
      if (sweptHit(segA, segD, e, TF_FIREBALL_RADIUS) < 0) return;
      this.burn(e);
    });
  }

  /** SDK: CTFProjectile_BallOfFire::Burn. */
  burn(target: Entity): void {
    const w = this.world;
    const ownerEnt = w.entity(this.owner);
    if (!ownerEnt) return;
    const victim = target.isPlayer() ? (target as Player) : null;
    if (target.team === ownerEnt.team) {
      // OnCollideWithTeammate: a Sniper's drawn arrow catches fire.
      if (victim && victim.playerClass === TF_CLASS_SNIPER) {
        this.hitEntities.push(victim.id);
        const bow = victim.activeWeapon() as { setArrowAlight?: (b: boolean) => void } | null;
        bow?.setArrowAlight?.(true);
      }
      return;
    }
    this.hitEntities.push(target.id);
    // IsEntityVisible / no world between (CTraceFilterIgnoreTeammates, MASK_SHOT without hitboxes).
    w.traceLineWorldOnly(
      this.origin,
      target.origin,
      MASK_SOLID_BRUSHONLY,
      (losTrace ??= emptyTrace()),
    );
    if (losTrace.fraction < 1) return;
    const info = resetDamageInfo((burnInfo ??= createDamageInfo()));
    info.attacker = ownerEnt.id;
    info.inflictor = this.id;
    info.weaponId = this.weaponId;
    info.weaponDefIndex = this.launcherDefIndex;
    info.killIcon = this.killIcon;
    info.damageType =
      DMG_IGNITE |
      DMG_USEDISTANCEMOD |
      DMG_NOCLOSEDISTANCEMOD |
      (this.critType === 2 ? DMG_CRITICAL : 0);
    info.critType = this.critType === 2 ? 2 : 0;
    info.afterburn = TF_FIREBALL_BURN_DURATION;
    set(info.position, this.origin.x, this.origin.y, this.origin.z);
    let bonus: boolean;
    if (victim) {
      if (victim.cond.has(TF_COND.PHASE) || victim.cond.invulnerable) return;
      // Would the centre strike his box within the next 1.5 frames?
      const dt = w.frametime * 1.5;
      set(segD, this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);
      const hitBox = sweptHit(this.origin, segD, victim, 0) >= 0;
      bonus = victim.cond.has(TF_COND.BURNING) && hitBox;
      info.damage = this.damage * (bonus ? TF_FIREBALL_BURNING_BONUS : 1);
      info.customKill = bonus
        ? TF_DMG_CUSTOM.TF_DMG_CUSTOM_DRAGONS_FURY_BONUS_BURNING
        : TF_DMG_CUSTOM.TF_DMG_CUSTOM_DRAGONS_FURY_IGNITE;
      if (victim.playerClass === TF_CLASS_PYRO)
        victim.cond.add(TF_COND.BURNING_PYRO, TF_FIREBALL_BURN_DURATION * 0.5, ownerEnt.id);
    } else {
      bonus = true;
      info.damage = this.damage * TF_FIREBALL_BURNING_BONUS;
      info.customKill = TF_DMG_CUSTOM.TF_DMG_CUSTOM_DRAGONS_FURY_BONUS_BURNING;
    }
    if (!this.refunded) {
      this.refunded = true;
      (this.launcher as unknown as Partial<RefundingLauncher> | null)?.refundAmmo?.();
    }
    w.applyDamage(target, info);
    // The bonus damage's sounds: one for everyone at the target, one in each of their ears.
    if (bonus && !this.impactSoundPlayed) {
      this.impactSoundPlayed = true;
      w.emitSound('Weapon_DragonsFury.BonusDamage', { entity: target.id });
      if (victim)
        w.emitSound('Weapon_DragonsFury.BonusDamagePain', { entity: victim.id, to: victim.id });
      w.emitSound('Weapon_DragonsFury.BonusDamageHit', { entity: ownerEnt.id, to: ownerEnt.id });
    }
  }

  /** The world (or anything that is not a combat entity) stops it. */
  override onImpact(other: Entity, tr: TraceResult): void {
    if (tr.surfaceFlags & SURF_SKY) {
      this.world.remove(this);
      return;
    }
    if (other.isPlayer() || other.isBaseObject()) return;
    this.stopAndFizzle();
  }

  override resolveFlyCollisionCustom(): void {
    this.stopAndFizzle();
  }
}

registerEntityClass('tf_projectile_balloffire', TFProjectileBallOfFire);
