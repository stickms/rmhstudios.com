/**
 * tf_projectile_flare (CTFProjectile_Flare, tf_projectile_flare.cpp): the flare guns' shot.
 *
 * MOVETYPE_FLYGRAVITY at the launcher's speed, gravity 0.3 × mult_projectile_speed, colliding like a
 * rocket (enemies by team contents, the world). Spawned behind a wall (nothing clear from the eye),
 * it fizzles at once. On a player it does its damage (DMG_IGNITE: 7.5 s of afterburn,
 * TF_DMG_CUSTOM_BURNING_FLARE) — a crit on a burning target, except for the Detonator, the Scorch
 * Shot and the Manmelter — and is gone; on the world it sticks and fizzles for 0.1 s. The
 * Detonator's flare bursts where it lands, against its shooter only (flare jumping); set off in the
 * air (+attack2) it bursts for everyone in 110 × mult_explosion_radius. The Scorch Shot's flare
 * knocks a player it hits back (100 up and along its flight, 400 if he was burning; stunned
 * 0.5 s first so the push lifts him), drops almost dead and bursts for everyone where it lands.
 *
 * Environment-agnostic.
 */

import {
  MASK_SHOT_HULL,
  MASK_SOLID_BRUSHONLY,
  MOVETYPE_FLYGRAVITY,
  MOVETYPE_NONE,
  SURF_SKY,
  TF_TEAM_BLUE,
} from '../../core/constants';
import { emptyTrace, NO_ENTITY, type TraceResult } from '../../core/types';
import { set, vec3, vectorAngles, type Vec3 } from '../../core/vec';
import { TF_DMG_CUSTOM } from '../../data/damage';
import { TF_COND } from '../conditions';
import {
  createDamageInfo,
  createRadiusDamageInfo,
  DMG_BLAST,
  DMG_CRITICAL,
  DMG_HALF_FALLOFF,
  DMG_PREVENT_PHYSICS_FORCE,
  resetDamageInfo,
} from '../damage';
import { COLLISION_GROUP_NONE, EF_NODRAW, FSOLID_NOT_SOLID, type Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { hookWeapon } from '../items/attributes';
import { stunPlayer, TF_STUN_MOVEMENT } from '../items/effects';
import { BaseProjectile } from '../physics';
import type { Player } from '../player';
import { launcherScript, PROJECTILE_KIND, type Deflectable } from './common';

export const FLARE_MODEL = 'models/weapons/w_models/w_flaregun_shell.mdl';
/** TF_FLARE_DET_RADIUS / TF_FLARE_RADIUS_FOR_FJS (tf_weaponbase_rocket.h). */
export const TF_FLARE_DET_RADIUS = 110;
export const TF_FLARE_RADIUS_FOR_FJS = 100;
/** ImpactThink: a flare in the world fizzles this long. */
const FLARE_IMPACT_TIME = 0.1;
/** ETFFlareType. */
const DETONATE = 1;
const GRORDBORT = 2;
const SCORCHSHOT = 3;

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const spawnEye = vec3();
const spawnTrace = emptyTrace();
const detStart = vec3();
const detEnd = vec3();
const detTrace = emptyTrace();
const pushImpulse = vec3();
// Lazily created (projectiles sit on the sim/damage import cycle).
let flareInfo: ReturnType<typeof createDamageInfo> | null = null;
let flareRadius: ReturnType<typeof createRadiusDamageInfo> | null = null;

/** A launcher that tracks its flares (CTFFlareGun::DeathNotice). */
interface FlareOwnerWeapon {
  onFlareRemoved(f: Entity): void;
}

export class TFProjectileFlare extends BaseProjectile implements Deflectable {
  /** ETFFlareType of the launcher (set_weapon_mode). */
  flareType = 0;
  /** GetAfterburnRateOnHit of the launcher. */
  afterburn = 0;
  /** m_flImpactTime (stuck in the world, fizzling). */
  impactTime = 0;
  /** The Scorch Shot has hit a player and now only meets the world. */
  scorched = false;
  private exploded = false;

  constructor(classname: string) {
    super(classname);
    this.model = FLARE_MODEL;
    this.setSize(ZERO, ZERO);
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.gravity = 0.3;
    this.projectileKind = PROJECTILE_KIND.FLARE;
  }

  applyExtra(x: Readonly<Record<string, number | string | boolean>>): void {
    if (typeof x.gravity === 'number') this.gravity = x.gravity;
    if (typeof x.flareType === 'number') this.flareType = x.flareType;
    if (typeof x.afterburn === 'number') this.afterburn = x.afterburn;
  }

  /** SDK: CTFProjectile_Flare::Spawn — fizzles at once with no clear line from its owner's eye. */
  override spawn(): void {
    super.spawn();
    this.skin = this.team === TF_TEAM_BLUE ? 1 : 0;
    vectorAngles(this.velocity, this.angles);
    const w = this.world;
    const owner = w.entity(this.owner);
    if (owner && owner.isPlayer()) {
      (owner as Player).eyePosition(spawnEye);
      w.traceLine(
        spawnEye,
        this.origin,
        MASK_SOLID_BRUSHONLY,
        w.entityFilter(this, COLLISION_GROUP_NONE),
        spawnTrace,
      );
      if (spawnTrace.fraction < 1) {
        const hit = w.entity(spawnTrace.entity);
        if (!hit || hit === w.worldEntity || hit.takeDamage === 0) {
          this.detonate(true);
          return;
        }
      }
    }
    this.setThink(this.flyThink, w.curtime);
  }

  private readonly flyThink = (): void => {
    if (this.moveType === MOVETYPE_NONE || this.exploded) return;
    vectorAngles(this.velocity, this.angles);
    this.nextThink = this.world.curtime;
  };

  isDeflectable(): boolean {
    return !this.exploded && this.impactTime === 0;
  }

  /** CTFBaseRocket::Deflected. */
  onDeflected(by: Player, _dir: Vec3): void {
    this.changeTeam(by.team);
    this.owner = by.id;
    if (by.cond.critBoosted) this.critType = 2;
    this.deflectedBy = by.id;
    this.deflected++;
    this.skin = this.team === TF_TEAM_BLUE ? 1 : 0;
  }

  /** The Scorch Shot after a hit meets only the world (COLLISION_GROUP_DEBRIS). */
  override physicsSolidMask(): number {
    return this.scorched ? MASK_SOLID_BRUSHONLY : super.physicsSolidMask();
  }

  private damageType(): number {
    const script = launcherScript(this, 'tf_weapon_shotgun_pyro');
    return script.damageType | (this.critType === 2 ? DMG_CRITICAL : 0);
  }

  private attacker(): Player | null {
    const e = this.world.entity(this.owner);
    return e && e.isPlayer() ? (e as Player) : null;
  }

  /** SDK: CTFProjectile_Flare::Explode. */
  override onImpact(other: Entity, tr: TraceResult): void {
    if (this.exploded || other.isTrigger()) return;
    if (tr.surfaceFlags & SURF_SKY) {
      this.world.remove(this);
      return;
    }
    const w = this.world;
    const attacker = this.attacker();
    const victim = other.isPlayer() ? (other as Player) : null;
    if (this.flareType === SCORCHSHOT && victim && !this.scorched) {
      this.scorchHit(victim, attacker);
      return;
    }
    if (this.impactTime > 0) return;
    if (this.enemy === NO_ENTITY) this.enemy = other === w.worldEntity ? NO_ENTITY : other.id;
    const impact = !victim;
    this.solidFlags |= FSOLID_NOT_SOLID;
    const detonate = this.flareType === DETONATE || this.flareType === SCORCHSHOT;
    const noRandomCrit = this.flareType === GRORDBORT || this.flareType === SCORCHSHOT;
    // Flares that hit a burning player crit (the detonating kinds mini-crit by attribute instead).
    if (victim && victim.cond.has(TF_COND.BURNING) && !detonate && !noRandomCrit) this.critType = 2;
    if (attacker && other !== w.worldEntity && other.takeDamage !== 0) {
      const info = resetDamageInfo((flareInfo ??= createDamageInfo()));
      info.attacker = attacker.id;
      info.inflictor = this.id;
      info.weaponId = this.weaponId;
      info.weaponDefIndex = this.launcherDefIndex;
      info.killIcon = this.killIcon;
      info.damage = this.damage;
      info.damageType = this.damageType();
      info.critType = this.critType === 2 ? 2 : 0;
      info.customKill = TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING_FLARE;
      info.afterburn = this.afterburn;
      set(info.position, this.origin.x, this.origin.y, this.origin.z);
      w.applyDamage(other, info);
    }
    if (impact) {
      // Stuck in the world, fizzling (ImpactThink); the Detonator's bursts there.
      this.moveType = MOVETYPE_NONE;
      set(this.velocity, 0, 0, 0);
      this.impactTime = w.curtime + FLARE_IMPACT_TIME;
      if (detonate) {
        this.detonate(this.flareType !== SCORCHSHOT);
        return;
      }
      this.setThink(this.impactThink, w.curtime);
    } else {
      w.emitSound('TFPlayer.FlareImpact', { entity: other.id });
      this.exploded = true;
      w.remove(this);
    }
  }

  /** The Scorch Shot's hit: damage, the knock-back, and it pops up almost spent. */
  private scorchHit(victim: Player, attacker: Player | null): void {
    const w = this.world;
    const burning = victim.cond.has(TF_COND.BURNING);
    this.scorched = true;
    if (attacker) {
      const info = resetDamageInfo((flareInfo ??= createDamageInfo()));
      info.attacker = attacker.id;
      info.inflictor = this.id;
      info.weaponId = this.weaponId;
      info.weaponDefIndex = this.launcherDefIndex;
      info.killIcon = this.killIcon;
      info.damage = this.damage;
      info.damageType = this.damageType() | DMG_PREVENT_PHYSICS_FORCE;
      info.critType = this.critType === 2 ? 2 : 0;
      info.afterburn = this.afterburn;
      set(info.position, this.origin.x, this.origin.y, this.origin.z);
      w.applyDamage(victim, info);
    }
    const enemy = !!attacker && victim.team !== attacker.team;
    // IsImmuneToPushback: the Quick-Fix's megaheal.
    if (enemy && victim.alive && !victim.cond.has(TF_COND.MEGAHEAL)) {
      const v = this.velocity;
      const len = Math.hypot(v.x, v.y, v.z) || 1;
      if (!victim.cond.has(TF_COND.KNOCKED_INTO_AIR))
        stunPlayer(victim, 0.5, 1, TF_STUN_MOVEMENT, attacker);
      const force = burning ? 400 : 100;
      // ApplyGenericPushbackImpulse( ( normalised velocity, z = 1 ) × force ).
      set(pushImpulse, (v.x / len) * force, (v.y / len) * force, force);
      w.clearGround(victim);
      victim.applyAbsVelocityImpulse(pushImpulse);
    }
    // It loses almost all of its speed and pops into the air.
    const rnd = w.random;
    set(
      this.velocity,
      this.velocity.x * 0.07 + rnd.randomFloat(-2, 2),
      this.velocity.y * 0.07 + rnd.randomFloat(-2, 2),
      100 + rnd.randomFloat(-2, 2),
    );
    w.emitSound('Rubber.BulletImpact', { pos: this.origin });
    if (this.enemy === NO_ENTITY) this.enemy = victim.id;
  }

  private readonly impactThink = (): void => {
    const w = this.world;
    if (w.curtime > this.impactTime) {
      if (this.enemy !== NO_ENTITY) {
        w.emitEffect({
          kind: 'explosion',
          pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
          value: this.weaponId,
          team: this.team,
        });
      }
      this.exploded = true;
      w.remove(this);
      return;
    }
    this.nextThink = w.curtime + FLARE_IMPACT_TIME;
  };

  /** SDK: CTFProjectile_Flare::Detonate → Explode_Air. */
  detonate(selfOnly: boolean): void {
    if (this.exploded) return;
    this.exploded = true;
    const w = this.world;
    set(detStart, this.origin.x, this.origin.y, this.origin.z + 8);
    set(detEnd, detStart.x, detStart.y, detStart.z - 32);
    w.traceLine(
      detStart,
      detEnd,
      MASK_SHOT_HULL,
      w.entityFilter(this, COLLISION_GROUP_NONE),
      detTrace,
    );
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.effects |= EF_NODRAW;
    const script = launcherScript(this, 'tf_weapon_shotgun_pyro');
    const attacker = this.attacker();
    if (attacker) {
      const radius = selfOnly
        ? 0
        : this.launcher
          ? hookWeapon(
              this.launcher,
              this.launcher.owner,
              'mult_explosion_radius',
              TF_FLARE_DET_RADIUS,
            )
          : TF_FLARE_DET_RADIUS;
      const info = resetDamageInfo((flareInfo ??= createDamageInfo()));
      info.attacker = attacker.id;
      info.inflictor = this.id;
      info.weaponId = this.weaponId;
      info.weaponDefIndex = this.launcherDefIndex;
      info.killIcon = this.killIcon;
      info.damage = this.damage;
      info.damageType = this.damageType() | DMG_HALF_FALLOFF | (selfOnly ? DMG_BLAST : 0);
      info.critType = this.critType === 2 ? 2 : 0;
      info.customKill = TF_DMG_CUSTOM.TF_DMG_CUSTOM_FLARE_EXPLOSION;
      info.afterburn = this.afterburn;
      set(info.position, this.origin.x, this.origin.y, this.origin.z);
      const r = (flareRadius ??= createRadiusDamageInfo(info, vec3(), 0));
      r.info = info;
      set(r.src, this.origin.x, this.origin.y, this.origin.z);
      r.radius = radius;
      r.ignore = NO_ENTITY;
      r.forceScale = 1;
      r.rjRadius = TF_FLARE_RADIUS_FOR_FJS;
      r.rjBaseDamage = script.primary.damage;
      w.radiusDamage(r);
    }
    w.emitEffect({
      kind: 'particle',
      system: selfOnly ? 'Explosions_MA_FlyingEmbers' : 'ExplosionCore_MidAir_Flare',
      pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
    });
    const sound = selfOnly ? script.sounds.special3 : script.sounds.special1;
    if (sound) w.emitSound(sound, { pos: this.origin });
    w.remove(this);
  }

  override resolveFlyCollisionCustom(): void {}

  override onRemove(): void {
    const l = this.launcher as unknown as Partial<FlareOwnerWeapon> | null;
    l?.onFlareRemoved?.(this);
  }
}

registerEntityClass('tf_projectile_flare', TFProjectileFlare);
