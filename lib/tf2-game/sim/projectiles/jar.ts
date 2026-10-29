/**
 * The thrown projectiles of tf_weapon_jar.cpp and tf_weapon_jar_gas.cpp: tf_projectile_jar
 * (Jarate), tf_projectile_jar_milk (Mad Milk), tf_projectile_cleaver (the Flying Guillotine) and
 * tf_projectile_jar_gas (the Gas Passer), plus the gas cloud it leaves (tf_gas_manager).
 *
 * A jar breaks on whatever it touches first (CTFProjectile_Jar::PipebombTouch / VPhysicsCollision
 * → Explode → JarExplode): every living player within 200 units with no world in between is
 * splashed — enemies get the condition for 10 s (jarated: mini-crits taken; milked: attackers heal
 * 60 % of their damage), burning teammates are put out (and an extinguish takes
 * extinguish_reduces_cooldown off the recharge). The cleaver hits one enemy for 50 (DMG_CLUB,
 * TF_DMG_CUSTOM_CLEAVER) and makes him bleed 5 s; it drops into the world otherwise. The gas can
 * leaves 20 gas points that sink and spread for 5 s; an enemy touching one is gassed for 10 s
 * (the next hit he takes ignites him).
 *
 * The SDK flies them with VPhysics; here they use the grenades' PhysicsToss stand-in (the
 * scripted gravity scale) and the rockets' team-contents collision against enemy players.
 *
 * Environment-agnostic.
 */

import {
  CONTENTS_HITBOX,
  MASK_SHOT,
  MASK_SOLID_BRUSHONLY,
  MASK_WATER,
  MOVETYPE_FLYGRAVITY,
  MOVETYPE_NONE,
  SURF_SKY,
  TF_TEAM_BLUE,
} from '../../core/constants';
import { emptyTrace, NO_ENTITY, type TraceResult } from '../../core/types';
import { set, vec3, type Vec3 } from '../../core/vec';
import { TF_DMG_CUSTOM } from '../../data/damage';
import { GRENADE_LAUNCHER } from '../../data/weapons';
import { TF_COND } from '../conditions';
import { createDamageInfo, DMG_CRITICAL, resetDamageInfo } from '../damage';
import { COLLISION_GROUP_NONE, EF_NODRAW, FSOLID_NOT_SOLID, type Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { hookInt, hookPlayer, hookWeapon } from '../items/attributes';
import { makeBleed, stunPlayer, TF_STUN_MOVEMENT } from '../items/effects';
import { BaseProjectile } from '../physics';
import type { Player } from '../player';
import { MAX_PLAYERS } from '../world';
import { PROJECTILE_KIND, type Deflectable } from './common';

/** JAR_EXPLODE_RADIUS. */
export const JAR_EXPLODE_RADIUS = 200;
/** JarExplode's flDuration. */
export const JAR_EFFECT_DURATION = 10;
/** CTFProjectile_Cleaver::GetDamage and the bleed MakeBleed gives. */
export const CLEAVER_DAMAGE = 50;
export const CLEAVER_BLEED_TIME = 5;
/** TF_GAS_* (tf_weapon_jar_gas.h) and CTFGasManager::GetMaxPoints. */
export const TF_GAS_LIFETIME = 5;
export const TF_GAS_POINT_RADIUS = 25;
export const TF_GAS_FALLRATE = 5;
export const TF_GAS_MOVE_DISTANCE = 10;
export const TF_GAS_MAX_POINTS = 20;
/** ExplodesOnHit's check at the toss: a wall this close breaks the jar at once. */
const JAR_NEAR_WALL = 32;
/** Seconds a cleaver that missed lies in the world. */
const CLEAVER_REMOVE_DELAY = 2;
/** DMG_CLUB (GetDamageType of the jar projectiles). */
const DMG_CLUB = 1 << 7;

const JAR_MINS: Vec3 = { x: -2, y: -2, z: -2 };
const JAR_MAXS: Vec3 = { x: 2, y: 2, z: 2 };
const HULL8_MIN: Vec3 = { x: -8, y: -8, z: -8 };
const HULL8_MAX: Vec3 = { x: 8, y: 8, z: 8 };

export const JAR_MODELS = {
  jar: 'models/weapons/c_models/urinejar.mdl',
  milk: 'models/workshop/weapons/c_models/c_madmilk/c_madmilk.mdl',
  cleaver: 'models/workshop_partner/weapons/c_models/c_sd_cleaver/c_sd_cleaver.mdl',
  gas: 'models/weapons/c_models/c_gascan/c_gascan.mdl',
} as const;

interface JarKind {
  model: string;
  cond: number;
  impactEffect: (team: number) => string;
  sound: string;
  spin: Vec3;
}

const KINDS: Readonly<Record<string, JarKind>> = {
  tf_projectile_jar: {
    model: JAR_MODELS.jar,
    cond: TF_COND.URINE,
    impactEffect: () => 'peejar_impact',
    sound: 'Jar.Explode',
    spin: { x: 300, y: 0, z: 0 },
  },
  tf_projectile_jar_milk: {
    model: JAR_MODELS.milk,
    cond: TF_COND.MAD_MILK,
    impactEffect: () => 'peejar_impact_milk',
    sound: 'Jar.Explode',
    spin: { x: 300, y: 0, z: 0 },
  },
  tf_projectile_cleaver: {
    model: JAR_MODELS.cleaver,
    cond: TF_COND.BLEEDING,
    impactEffect: () => '',
    sound: 'Cleaver.ImpactWorld',
    spin: { x: 0, y: 500, z: 0 },
  },
  tf_projectile_jar_gas: {
    model: JAR_MODELS.gas,
    cond: TF_COND.GAS,
    impactEffect: (team) => (team === TF_TEAM_BLUE ? 'gas_can_impact_blue' : 'gas_can_impact_red'),
    sound: 'Weapon_GasCan.Explode',
    spin: { x: 300, y: 0, z: 0 },
  },
};

const splashTrace = emptyTrace();
const wallTrace = emptyTrace();
const wallEnd = vec3();
// Lazily created (projectiles sit on the sim/damage import cycle).
let cleaverInfo: ReturnType<typeof createDamageInfo> | null = null;

/** A launcher with an effect bar (CTFWeaponBase's, sim/weapons/tf-weapon.ts). */
interface EffectBarWeapon {
  owner: Player | null;
  hasEffectBarRegeneration(): boolean;
  effectBarProgress(): number;
  effectBarRechargeTime(): number;
  decrementBarRegenTime(time: number): void;
}
const effectBarOf = (w: unknown): EffectBarWeapon | null =>
  w &&
  typeof (w as Partial<EffectBarWeapon>).hasEffectBarRegeneration === 'function' &&
  (w as EffectBarWeapon).hasEffectBarRegeneration()
    ? (w as EffectBarWeapon)
    : null;

/** JarExplode: putting out a teammate takes (1 − extinguish_reduces_cooldown) of the bar off the recharge. */
function jarExtinguishCooldown(launcher: unknown): void {
  const l = effectBarOf(launcher);
  if (!l) return;
  const cooldown = 1 - hookWeapon(launcher, l.owner, 'extinguish_reduces_cooldown', 1);
  if (cooldown > 0 && l.effectBarProgress() < cooldown)
    l.decrementBarRegenTime(l.effectBarRechargeTime() * cooldown);
}

/** CTFProjectile_Cleaver::OnHit: a hit after FLIGHT_TIME_TO_REDUCE_COOLDOWN (0.5 s) of flight takes 1.5 s off. */
function cleaverHitCooldown(launcher: unknown, flightTime: number): void {
  const l = effectBarOf(launcher);
  if (l && flightTime >= 0.5) l.decrementBarRegenTime(1.5);
}

/** The box of `p` comes within `radius` of `c` (UTIL_EntitiesInSphere's test). */
function boxInSphere(p: Player, c: Vec3, radius: number): boolean {
  let d2 = 0;
  const axes: Array<'x' | 'y' | 'z'> = AXES;
  for (let i = 0; i < 3; i++) {
    const a = axes[i];
    const lo = p.origin[a] + p.mins[a];
    const hi = p.origin[a] + p.maxs[a];
    const v = c[a] < lo ? lo - c[a] : c[a] > hi ? c[a] - hi : 0;
    d2 += v * v;
  }
  return d2 <= radius * radius;
}
const AXES: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];

/**
 * SDK: JarExplode — the splash: the condition on every enemy in reach (not through the world),
 * burning teammates put out.
 */
export function jarExplode(
  world: Player['world'],
  attacker: Player | null,
  launcher: unknown,
  at: Vec3,
  team: number,
  radius: number,
  cond: number,
  duration: number,
  impactEffect: string,
  sound: string,
): void {
  if (impactEffect)
    world.emitEffect({
      kind: 'particle',
      system: impactEffect,
      pos: { x: at.x, y: at.y, z: at.z },
    });
  if (sound) world.emitSound(sound, { pos: at });
  for (let i = 1; i <= MAX_PLAYERS; i++) {
    const p = world.player(i);
    if (!p || !p.alive || !boxInSphere(p, at, radius)) continue;
    // "Pee isn't stopped by other entities": the world only.
    // CTraceFilterIgnorePlayers with MASK_SHOT & ~CONTENTS_HITBOX: the map and brush entities.
    world.traceLineWorldOnly(at, p.origin, MASK_SHOT & ~CONTENTS_HITBOX, splashTrace);
    if (splashTrace.fraction < 1) continue;
    if (p.team !== team) {
      if (p.cond.invulnerable || p.cond.has(TF_COND.PHASE)) continue;
      if (hookInt(hookPlayer(p, 'wet_immunity', 0))) continue;
      p.cond.add(cond, duration, attacker ? attacker.id : NO_ENTITY);
      p.unlock.peeAttacker = attacker ? attacker.id : NO_ENTITY;
      if (attacker) {
        const stun = hookPlayer(attacker, 'applies_snare_effect', 1);
        if (stun !== 1) stunPlayer(p, duration, stun, TF_STUN_MOVEMENT, attacker);
      }
    } else if (attacker && p.cond.has(TF_COND.BURNING)) {
      // ExtinguishPlayer.
      world.emitSound('TFPlayer.FlameOut', { entity: p.id });
      p.extinguish();
      if (attacker !== p) {
        attacker.stats.bonusPoints += 10;
        jarExtinguishCooldown(launcher);
      }
    }
  }
}

/** CTFProjectile_Jar and its kin. */
export class TFProjectileJar extends BaseProjectile implements Deflectable {
  /** m_bTouched / exploded: a jar breaks once. */
  exploded = false;
  /** CTFProjectile_Cleaver::m_bHitPlayer. */
  hitPlayer = false;
  /** Spin for the renderer (AngularImpulse, degrees per second). */
  readonly spin = vec3();
  private readonly kind: JarKind;

  constructor(classname: string) {
    super(classname);
    this.kind = KINDS[classname] ?? KINDS.tf_projectile_jar;
    this.model = this.kind.model;
    this.projectileKind =
      classname === 'tf_projectile_cleaver' ? PROJECTILE_KIND.CLEAVER : PROJECTILE_KIND.JAR;
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.gravity = GRENADE_LAUNCHER.gravity;
    this.setSize(JAR_MINS, JAR_MAXS);
    set(this.spin, this.kind.spin.x, this.kind.spin.y, this.kind.spin.z);
  }

  get isCleaver(): boolean {
    return this.classname === 'tf_projectile_cleaver';
  }

  override spawn(): void {
    super.spawn();
    this.skin = this.team === TF_TEAM_BLUE ? 1 : 0;
    this.setThink(this.flyThink, this.world.curtime);
    if (this.isCleaver) return;
    // CTFJar::TossJarThink: a wall right in front breaks the jar at once (ExplodesOnHit).
    const v = this.velocity;
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    set(
      wallEnd,
      this.origin.x + (v.x / len) * JAR_NEAR_WALL,
      this.origin.y + (v.y / len) * JAR_NEAR_WALL,
      this.origin.z + (v.z / len) * JAR_NEAR_WALL,
    );
    const w = this.world;
    w.traceHull(
      this.origin,
      wallEnd,
      HULL8_MIN,
      HULL8_MAX,
      MASK_SOLID_BRUSHONLY,
      w.entityFilter(this, COLLISION_GROUP_NONE),
      wallTrace,
    );
    if (wallTrace.fraction < 1) this.explode(wallTrace);
  }

  private readonly flyThink = (): void => {
    if (this.removed || this.moveType === MOVETYPE_NONE) return;
    const dt = this.world.frametime;
    this.angles.x = (this.angles.x + this.spin.x * dt) % 360;
    this.angles.y = (this.angles.y + this.spin.y * dt) % 360;
    // A jar that lands in water breaks there (VPhysics would float it, but the splash washes off at once).
    if (!this.isCleaver && this.world.pointContents(this.origin) & MASK_WATER) {
      this.explode(null);
      return;
    }
    this.nextThink = this.world.curtime;
  };

  isDeflectable(): boolean {
    return !this.exploded && this.moveType !== MOVETYPE_NONE;
  }

  /** CTFWeaponBaseGrenadeProj::Deflected: the jar changes hands. */
  onDeflected(by: Player, _dir: Vec3): void {
    this.changeTeam(by.team);
    const w = by.activeWeapon();
    if (w) this.launcher = w;
    this.owner = by.id;
    this.skin = this.team === TF_TEAM_BLUE ? 1 : 0;
    this.deflectedBy = by.id;
    this.deflected++;
  }

  /** SDK: CTFProjectile_Jar::PipebombTouch / VPhysicsCollision. */
  override onImpact(other: Entity, tr: TraceResult): void {
    if (this.exploded) return;
    if (other.id === this.owner) return;
    if (tr.surfaceFlags & SURF_SKY) {
      this.world.remove(this);
      return;
    }
    if (this.isCleaver) {
      if (other.isPlayer()) this.cleaverHit(other as Player);
      else this.cleaverMiss();
      return;
    }
    this.enemy = other.isPlayer() ? other.id : NO_ENTITY;
    this.explode(tr);
  }

  /** SDK: CTFProjectile_Jar::Explode (and CTFProjectile_JarGas::Explode's gas). */
  explode(tr: TraceResult | null): void {
    if (this.exploded) return;
    this.exploded = true;
    const w = this.world;
    if (tr && tr.fraction !== 1) {
      this.origin.x = tr.endPos.x + tr.plane.normal.x;
      this.origin.y = tr.endPos.y + tr.plane.normal.y;
      this.origin.z = tr.endPos.z + tr.plane.normal.z;
    }
    const thrower = w.entity(this.owner);
    const attacker = thrower && thrower.isPlayer() ? (thrower as Player) : null;
    const k = this.kind;
    if (this.classname === 'tf_projectile_jar_gas') {
      w.emitEffect({
        kind: 'particle',
        system: k.impactEffect(this.team),
        pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
      });
      w.emitSound(k.sound, { pos: this.origin });
      if (attacker) spawnGasManager(w, attacker, this.origin);
    } else {
      jarExplode(
        w,
        attacker,
        this.launcher,
        this.origin,
        this.team,
        JAR_EXPLODE_RADIUS,
        k.cond,
        JAR_EFFECT_DURATION,
        k.impactEffect(this.team),
        k.sound,
      );
    }
    w.remove(this);
  }

  /** SDK: CTFProjectile_Cleaver::OnHit — 50 and a 5 s bleed on an enemy. */
  private cleaverHit(victim: Player): void {
    const w = this.world;
    const ownerEnt = w.entity(this.owner);
    if (!ownerEnt || !ownerEnt.isPlayer()) return;
    const owner = ownerEnt as Player;
    if (victim.team === owner.team) return;
    if (victim.cond.invulnerable || victim.cond.has(TF_COND.INVULNERABLE_WEARINGOFF)) return;
    this.exploded = true;
    this.hitPlayer = true;
    cleaverHitCooldown(this.launcher, w.curtime - this.spawnTime);
    makeBleed(victim, owner, this.launcher, CLEAVER_BLEED_TIME);
    const info = resetDamageInfo((cleaverInfo ??= createDamageInfo()));
    info.attacker = owner.id;
    info.inflictor = this.id;
    info.weaponId = this.weaponId;
    info.weaponDefIndex = this.launcherDefIndex;
    info.killIcon = this.killIcon || 'guillotine';
    info.damage = CLEAVER_DAMAGE;
    info.customKill = TF_DMG_CUSTOM.TF_DMG_CUSTOM_CLEAVER;
    info.damageType = DMG_CLUB | (this.critType === 2 ? DMG_CRITICAL : 0);
    info.critType = this.critType === 2 ? 2 : 0;
    set(info.position, this.origin.x, this.origin.y, this.origin.z);
    w.applyDamage(victim, info);
    w.emitSound('Cleaver.ImpactFlesh', { pos: this.origin });
    this.removeCleaver();
  }

  /** SDK: CTFProjectile_Cleaver::Explode — it hit the world: the sound, and it lies there 2 s. */
  private cleaverMiss(): void {
    this.exploded = true;
    this.world.emitSound('Cleaver.ImpactWorld', { pos: this.origin });
    set(this.velocity, 0, 0, 0);
    this.moveType = MOVETYPE_NONE;
    this.setThink(this.subRemove, this.world.curtime + CLEAVER_REMOVE_DELAY);
  }

  /** SDK: CTFProjectile_Cleaver::RemoveCleaver. */
  private removeCleaver(): void {
    this.effects |= EF_NODRAW;
    this.solidFlags |= FSOLID_NOT_SOLID;
    set(this.velocity, 0, 0, 0);
    this.moveType = MOVETYPE_NONE;
    this.setThink(this.subRemove, this.world.curtime + CLEAVER_REMOVE_DELAY);
  }
}

/** One gas point (tf_point_t). */
export class GasPoint {
  readonly pos = vec3();
  spawnTime = 0;
}

/**
 * CTFGasManager: the Gas Passer's cloud — up to 20 points of radius 25 that fall (5 × 25 u/s
 * until they rest on the world) and push apart, each living 5 s; the first touch on an enemy
 * gasses him for 10 s (once per cloud).
 */
export class TFGasManager extends BaseProjectile {
  readonly points: GasPoint[] = [];
  /** m_Touched. */
  readonly touched: number[] = [];
  keepMoving = true;
  lastMoveUpdate = -1;

  constructor(classname: string) {
    super(classname);
    this.moveType = MOVETYPE_NONE;
    this.solidFlags = FSOLID_NOT_SOLID;
    this.effects |= EF_NODRAW;
    this.projectileKind = 0;
  }

  /** CTFGasManager::AddGas — fill the cloud (points spread on a ring, as AddPoint's random offsets do on average). */
  addGas(): void {
    const t = this.world.curtime;
    const rnd = this.world.random;
    for (let i = this.points.length; i < TF_GAS_MAX_POINTS; i++) {
      const p = new GasPoint();
      const a = rnd.randomFloat(0, Math.PI * 2);
      const r = rnd.randomFloat(0, TF_GAS_POINT_RADIUS);
      set(
        p.pos,
        this.origin.x + Math.cos(a) * r,
        this.origin.y + Math.sin(a) * r,
        this.origin.z + rnd.randomFloat(-TF_GAS_POINT_RADIUS, TF_GAS_POINT_RADIUS) * 0.5,
      );
      p.spawnTime = t;
      this.points.push(p);
    }
    this.setThink(this.updateThink, t);
  }

  private readonly updateThink = (): void => {
    const w = this.world;
    const t = w.curtime;
    for (let i = this.points.length - 1; i >= 0; i--) {
      const p = this.points[i];
      if (t > p.spawnTime + TF_GAS_LIFETIME || w.pointContents(p.pos) & MASK_WATER)
        this.points.splice(i, 1);
    }
    if (this.points.length === 0) {
      w.remove(this);
      return;
    }
    if (this.lastMoveUpdate <= 1) this.lastMoveUpdate = t;
    const delta = t - this.lastMoveUpdate;
    this.lastMoveUpdate = t;
    let moved = false;
    if (this.keepMoving) {
      for (const p of this.points) {
        // Down until the bottom of the sphere rests on the world.
        set(gasA, p.pos.x, p.pos.y, p.pos.z - TF_GAS_POINT_RADIUS);
        set(gasB, gasA.x, gasA.y, gasA.z - delta * TF_GAS_POINT_RADIUS);
        w.traceLine(
          gasA,
          gasB,
          MASK_SOLID_BRUSHONLY,
          w.entityFilter(this, COLLISION_GROUP_NONE),
          gasTrace,
        );
        if (gasTrace.fraction !== 1) continue;
        p.pos.z -= delta * TF_GAS_POINT_RADIUS * TF_GAS_FALLRATE;
        moved = true;
      }
      const minApart = TF_GAS_POINT_RADIUS * 1.9;
      for (const p1 of this.points) {
        let n = 0;
        let rx = 0;
        let ry = 0;
        let rz = 0;
        for (const p2 of this.points) {
          if (p1 === p2) continue;
          const dx = p2.pos.x - p1.pos.x;
          const dy = p2.pos.y - p1.pos.y;
          const dz = p2.pos.z - p1.pos.z;
          if (Math.hypot(dx, dy, dz) < minApart) {
            rx += dx;
            ry += dy;
            rz += dz;
            n++;
          }
        }
        if (n === 0) continue;
        const len = Math.hypot(rx, ry, rz);
        if (len < 1e-6) continue;
        set(
          gasB,
          p1.pos.x - (rx / len) * TF_GAS_MOVE_DISTANCE,
          p1.pos.y - (ry / len) * TF_GAS_MOVE_DISTANCE,
          p1.pos.z - (rz / len) * TF_GAS_MOVE_DISTANCE,
        );
        w.traceLine(
          p1.pos,
          gasB,
          MASK_SOLID_BRUSHONLY,
          w.entityFilter(this, COLLISION_GROUP_NONE),
          gasTrace,
        );
        if (gasTrace.fraction !== 1) continue;
        set(p1.pos, gasB.x, gasB.y, gasB.z);
        moved = true;
      }
    }
    this.keepMoving = moved;
    // CTFPointManager's collision: the first point an enemy's box touches gasses him.
    const owner = w.entity(this.owner);
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const pl = w.player(i);
      if (!pl || !pl.alive || pl.team === this.team || pl.team <= 1 || this.touched.includes(pl.id))
        continue;
      for (const pt of this.points) {
        if (!boxInSphere(pl, pt.pos, TF_GAS_POINT_RADIUS)) continue;
        if (
          !pl.cond.invulnerable &&
          !pl.cond.has(TF_COND.PHASE) &&
          !hookInt(hookPlayer(pl, 'wet_immunity', 0))
        ) {
          pl.cond.add(TF_COND.GAS, JAR_EFFECT_DURATION, owner ? owner.id : NO_ENTITY);
        }
        this.touched.push(pl.id);
        break;
      }
    }
    this.nextThink = t;
  };
}

const gasA = vec3();
const gasB = vec3();
const gasTrace = emptyTrace();

/** CTFGasManager::Create + AddGas, 1.2 point radii above the break (or at it, under a ceiling). */
export function spawnGasManager(w: Player['world'], thrower: Player, at: Vec3): void {
  set(gasA, at.x, at.y, at.z + TF_GAS_POINT_RADIUS * 1.2);
  w.traceLine(
    at,
    gasA,
    MASK_SOLID_BRUSHONLY,
    w.entityFilter(thrower, COLLISION_GROUP_NONE),
    gasTrace,
  );
  const pos = gasTrace.fraction !== 1 ? at : gasA;
  const mgr = w.spawnEntity('tf_gas_manager', (e) => {
    set(e.origin, pos.x, pos.y, pos.z);
    e.owner = thrower.id;
    e.team = thrower.team;
  }) as TFGasManager | null;
  mgr?.addGas();
}

registerEntityClass('tf_projectile_jar', TFProjectileJar);
registerEntityClass('tf_projectile_jar_milk', TFProjectileJar);
registerEntityClass('tf_projectile_cleaver', TFProjectileJar);
registerEntityClass('tf_projectile_jar_gas', TFProjectileJar);
registerEntityClass('tf_gas_manager', TFGasManager);
