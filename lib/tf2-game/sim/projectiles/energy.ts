/**
 * The energy projectiles: tf_projectile_energy_ring (CTFProjectile_EnergyRing — the Righteous Bison
 * and the Pomson 6000) and tf_projectile_energy_ball (CTFProjectile_EnergyBall — the Cow Mangler).
 *
 * A ring flies straight at 1200 u/s. It meets the world and is gone; it hits combat entities (players,
 * buildings) for 60 (the Pomson) or 20 (the Bison: energy_weapon_penetration — it passes through
 * enemies, hurting each again after tf_bison_tick_time, and ignores its own team),
 * TF_DMG_CUSTOM_PLASMA (buildings take 20 %). The ring's player hits are a swept test each tick, since
 * the Bison's must not stop on the first.
 *
 * The ball is a rocket (146 radius × mult_explosion_radius, the rocket-jump radius 121, × 1.33 when
 * charged) with DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD (+ DMG_IGNITE charged),
 * TF_DMG_CUSTOM_PLASMA / _PLASMA_CHARGED (the charged shot mini-crits and disables buildings).
 *
 * Environment-agnostic.
 */

import { MASK_SOLID_BRUSHONLY, SURF_SKY, TF_TEAM_RED } from '../../core/constants';
import { NO_ENTITY, type TraceResult } from '../../core/types';
import { set, vec3, vectorAngles, type Vec3 } from '../../core/vec';
import { RADIUS_DAMAGE, TF_DMG_CUSTOM } from '../../data/damage';
import {
  createDamageInfo,
  DMG_BLAST,
  DMG_CRITICAL,
  DMG_HALF_FALLOFF,
  DMG_IGNITE,
  DMG_USEDISTANCEMOD,
  resetDamageInfo,
} from '../damage';
import { DAMAGE_NO, type Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { hookInt, hookPlayer, hookWeapon } from '../items/attributes';
import { BaseProjectile } from '../physics';
import type { Player } from '../player';
import { explodeProjectile, launcherScript, PROJECTILE_KIND, type Deflectable } from './common';

export const ENERGY_RING_MODEL = 'models/weapons/w_models/w_drg_ball.mdl';
export const ENERGY_BALL_MODEL = 'models/weapons/w_models/w_drg_ball.mdl';
/** CTFProjectile_EnergyRing::GetDamage. */
export const ENERGY_RING_DAMAGE = 60;
export const BISON_RING_DAMAGE = 20;
/** tf_bison_tick_time. */
export const TF_BISON_TICK_TIME = 0.025;
/** The rocket radii the ball uses (TF_ROCKET_RADIUS_FOR_RJS × 1.33 charged). */
const CHARGED_SELF_RADIUS_SCALE = 1.33;
/** CTFProjectile_EnergyRing's flight time limit (CTFBaseProjectile's lifetime). */
const RING_LIFETIME = 5;
/** The ring is a point; players are swept with this half-width (the ring's visual). */
const RING_HALF = 2;

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const lastPos = vec3();
// Lazily created (projectiles sit on the sim/damage import cycle).
let ringInfo: ReturnType<typeof createDamageInfo> | null = null;

/** Segment a + t·d (t ∈ [0, 1]) against an entity's box grown by `half`; the entry t or −1. */
function sweptHit(a: Vec3, d: Vec3, e: Entity, half: number): number {
  let t0 = 0;
  let t1 = 1;
  const axes: ReadonlyArray<'x' | 'y' | 'z'> = AXES;
  for (let i = 0; i < 3; i++) {
    const k = axes[i];
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
const AXES: ReadonlyArray<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
const sweepDelta = vec3();

/** CTFProjectile_EnergyRing. */
export class TFProjectileEnergyRing extends BaseProjectile {
  /** m_flLastHitTime. */
  lastHitTime = -1;
  /** The Bison's: energy_weapon_penetration on its owner. */
  penetrate = false;
  private readonly last = vec3();

  constructor(classname: string) {
    super(classname);
    this.model = ENERGY_RING_MODEL;
    this.setSize(ZERO, ZERO);
    this.gravity = 0;
    this.projectileKind = PROJECTILE_KIND.ENERGY_RING;
    this.lifetime = RING_LIFETIME;
  }

  override spawn(): void {
    super.spawn();
    const owner = this.world.entity(this.owner);
    this.penetrate =
      !!owner &&
      owner.isPlayer() &&
      hookInt(hookPlayer(owner as Player, 'energy_weapon_penetration', 0)) !== 0;
    this.damage = this.penetrate ? BISON_RING_DAMAGE : ENERGY_RING_DAMAGE;
    this.skin = this.team === TF_TEAM_RED ? 0 : 1;
    vectorAngles(this.velocity, this.angles);
    set(this.last, this.origin.x, this.origin.y, this.origin.z);
    this.setThink(this.sweepThink, this.world.curtime);
  }

  /** Only the world stops a ring; combat entities are the swept test's. */
  override physicsSolidMask(): number {
    return MASK_SOLID_BRUSHONLY;
  }

  /** ProjectileTouch against players and buildings over the last move. */
  private readonly sweepThink = (): void => {
    const w = this.world;
    set(
      sweepDelta,
      this.origin.x - this.last.x,
      this.origin.y - this.last.y,
      this.origin.z - this.last.z,
    );
    set(lastPos, this.last.x, this.last.y, this.last.z);
    set(this.last, this.origin.x, this.origin.y, this.origin.z);
    let best: Entity | null = null;
    let bestT = 2;
    w.forEachEntity((e) => {
      if (e.id === this.owner || e.removed || e.takeDamage === DAMAGE_NO) return;
      const combat = e.isPlayer() ? (e as Player).alive : e.isBaseObject();
      if (!combat || e.team <= 1) return;
      if (e.team === this.team && !this.penetrate) return;
      const t = sweptHit(lastPos, sweepDelta, e, RING_HALF);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = e;
      }
    });
    if (best) {
      this.hit(best);
      if (this.removed) return;
    }
    this.nextThink = w.curtime;
  };

  /** SDK: CTFProjectile_EnergyRing::ProjectileTouch (a combat entity). */
  private hit(other: Entity): void {
    const w = this.world;
    if (
      this.penetrate &&
      (other.team === this.team || w.curtime - this.lastHitTime < TF_BISON_TICK_TIME)
    )
      return;
    this.lastHitTime = w.curtime;
    const owner = w.entity(this.owner);
    if (owner) {
      const script = launcherScript(this, 'tf_weapon_shotgun_primary');
      const info = resetDamageInfo((ringInfo ??= createDamageInfo()));
      info.attacker = owner.id;
      info.inflictor = this.id;
      info.weaponId = this.weaponId;
      info.weaponDefIndex = this.launcherDefIndex;
      info.killIcon = this.killIcon;
      info.damage = this.damage;
      info.damageType = script.damageType | (this.critType === 2 ? DMG_CRITICAL : 0);
      info.critType = this.critType === 2 ? 2 : 0;
      info.customKill = TF_DMG_CUSTOM.TF_DMG_CUSTOM_PLASMA;
      set(info.reportedPosition, owner.origin.x, owner.origin.y, owner.origin.z);
      set(info.position, this.origin.x, this.origin.y, this.origin.z);
      const v = this.velocity;
      const len = Math.hypot(v.x, v.y, v.z) || 1;
      set(info.force, v.x / len, v.y / len, v.z / len);
      w.applyDamage(other, info);
    }
    this.playImpactEffects(other.isPlayer());
    if (!this.penetrate) w.remove(this);
  }

  /** SDK: CTFProjectile_EnergyRing::PlayImpactEffects. */
  private playImpactEffects(flesh: boolean): void {
    const w = this.world;
    w.emitEffect({
      kind: 'particle',
      system: 'drg_pomson_impact',
      pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
    });
    // (The SDK's names are swapped: the "flesh" sound is the world one and vice versa.)
    const sound = this.penetrate
      ? flesh
        ? 'Weapon_Bison.ProjectileImpactWorld'
        : 'Weapon_Bison.ProjectileImpactFlesh'
      : flesh
        ? 'Weapon_Pomson.ProjectileImpactWorld'
        : 'Weapon_Pomson.ProjectileImpactFlesh';
    w.emitSound(sound, { pos: this.origin });
  }

  /** The world: the impact, and the ring is gone. */
  override onImpact(other: Entity, tr: TraceResult): void {
    if (tr.surfaceFlags & SURF_SKY) {
      this.world.remove(this);
      return;
    }
    if (other.isPlayer() || other.isBaseObject()) {
      this.hit(other);
      return;
    }
    this.playImpactEffects(false);
    this.world.remove(this);
  }

  override resolveFlyCollisionCustom(): void {
    this.playImpactEffects(false);
    this.world.remove(this);
  }
}

/** CTFProjectile_EnergyBall. */
export class TFProjectileEnergyBall extends BaseProjectile implements Deflectable {
  /** m_bChargedShot. */
  charged = false;
  afterburn = 0;
  private exploded = false;

  constructor(classname: string) {
    super(classname);
    this.model = ENERGY_BALL_MODEL;
    this.setSize(ZERO, ZERO);
    this.gravity = 0;
    this.projectileKind = PROJECTILE_KIND.ENERGY_BALL;
  }

  applyExtra(x: Readonly<Record<string, number | string | boolean>>): void {
    if (x.charged === true) this.charged = true;
    if (typeof x.afterburn === 'number') this.afterburn = x.afterburn;
  }

  override spawn(): void {
    super.spawn();
    vectorAngles(this.velocity, this.angles);
    this.skin = this.team === TF_TEAM_RED ? 0 : 1;
  }

  isDeflectable(): boolean {
    return !this.exploded;
  }

  /** SDK: CTFProjectile_EnergyBall::Deflected. */
  onDeflected(by: Player, _dir: Vec3): void {
    this.changeTeam(by.team);
    const w = by.activeWeapon();
    if (w) this.launcher = w;
    this.owner = by.id;
    if (by.cond.critBoosted) this.critType = 2;
    this.deflectedBy = by.id;
    this.deflected++;
    this.skin = this.team === TF_TEAM_RED ? 0 : 1;
  }

  /** SDK: CTFProjectile_EnergyBall::GetDamageType. */
  damageTypeNow(): number {
    if (this.charged) return DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD | DMG_IGNITE;
    return (
      DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD | (this.critType === 2 ? DMG_CRITICAL : 0)
    );
  }

  /** SDK: CTFProjectile_EnergyBall::Explode. */
  override onImpact(other: Entity, tr: TraceResult): void {
    if (this.exploded || other.isTrigger()) return;
    if (tr.surfaceFlags & SURF_SKY) {
      this.world.remove(this);
      return;
    }
    this.exploded = true;
    const w = this.world;
    this.enemy = other === w.worldEntity ? NO_ENTITY : other.id;
    const red = this.team === TF_TEAM_RED;
    const system = this.charged
      ? red
        ? 'drg_cow_explosioncore_charged'
        : 'drg_cow_explosioncore_charged_blue'
      : red
        ? 'drg_cow_explosioncore_normal'
        : 'drg_cow_explosioncore_normal_blue';
    const base = launcherScript(this, 'tf_weapon_rocketlauncher');
    // The charged shot's critType stays 0: CRIT_MINI comes from TF_DMG_CUSTOM_PLASMA_CHARGED (damage-rules).
    if (this.charged) this.critType = 0;
    explodeProjectile(this, tr, other, {
      attacker: this.owner,
      damage: this.damage,
      damageType: this.damageTypeNow(),
      customKill: this.charged
        ? TF_DMG_CUSTOM.TF_DMG_CUSTOM_PLASMA_CHARGED
        : TF_DMG_CUSTOM.TF_DMG_CUSTOM_PLASMA,
      radius: this.launcher
        ? hookWeapon(
            this.launcher,
            this.launcher.owner,
            'mult_explosion_radius',
            RADIUS_DAMAGE.rocketRadius,
          )
        : RADIUS_DAMAGE.rocketRadius,
      selfRadius: RADIUS_DAMAGE.rocketSelfRadius * (this.charged ? CHARGED_SELF_RADIUS_SCALE : 1),
      selfBaseDamage: base.primary.damage,
      script: {
        ...base,
        explosionEffect: system,
        explosionPlayerEffect: system,
        explosionWaterEffect: system,
        explosionSound: 'Weapon_CowMangler.Explode',
      },
    });
    w.remove(this);
  }

  override resolveFlyCollisionCustom(): void {}
}

registerEntityClass('tf_projectile_energy_ring', TFProjectileEnergyRing);
registerEntityClass('tf_projectile_energy_ball', TFProjectileEnergyBall);
