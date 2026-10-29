/**
 * tf_projectile_rocket (CTFProjectile_Rocket over CTFBaseRocket): a
 * zero-size MOVETYPE_FLY projectile at ROCKET.speed that explodes on the
 * first thing it touches — enemies (by team contents) or the world — with
 * TF_ROCKET_RADIUS against everyone and TF_ROCKET_RADIUS_FOR_RJS against
 * its shooter, using the launcher's base damage for the shooter (rocket
 * jumps feel the same whatever hit). Airblast: changes team and owner,
 * flies at the Pyro's crosshair, and mini-crits (GetDeflected).
 */

import { SURF_SKY } from '../../core/constants';
import { NO_ENTITY, type TraceResult } from '../../core/types';
import { vec3, vectorAngles, type Vec3 } from '../../core/vec';
import { RADIUS_DAMAGE } from '../../data/damage';
import { ROCKET, type WeaponScript } from '../../data/weapons';
import { registerEntityClass } from '../entity-registry';
import type { Entity } from '../entity';
import { BaseProjectile } from '../physics';
import type { Player } from '../player';
import { explodeProjectile, launcherScript, PROJECTILE_KIND, ROCKET_MODEL, type Deflectable } from './common';

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export class TFProjectileRocket extends BaseProjectile implements Deflectable {
  /** m_flDestroyableTime. */
  destroyableTime = 0;
  /** Exploded already (Explode removes; guards a second touch in the same move). */
  private exploded = false;
  /** The original launcher's script (GetOriginalLauncher: damage type, effects, base damage). */
  private script: WeaponScript | null = null;

  constructor(classname: string) {
    super(classname);
    this.model = ROCKET_MODEL;
    this.setSize(ZERO, ZERO);
    this.gravity = ROCKET.gravity;
    this.projectileKind = PROJECTILE_KIND.ROCKET;
  }

  /** SDK: CTFBaseRocket::Spawn / Create — angles follow the velocity. */
  override spawn(): void {
    super.spawn();
    this.destroyableTime = this.world.curtime + ROCKET.destroyableAfter;
    this.script = launcherScript(this, 'tf_weapon_rocketlauncher');
    vectorAngles(this.velocity, this.angles);
    this.skin = this.team === 3 ? 1 : 0;
  }

  isDeflectable(): boolean {
    return !this.exploded;
  }

  isDestroyable(): boolean {
    return this.world.curtime > this.destroyableTime;
  }

  /** SDK: CTFProjectile_Rocket::Deflected. */
  onDeflected(by: Player, _dir: Vec3): void {
    this.changeTeam(by.team);
    const w = by.activeWeapon();
    if (w) this.launcher = w;
    this.owner = by.id;
    if (by.cond.critBoosted) this.critType = 2;
    this.deflectedBy = by.id;
    this.deflected++;
    this.skin = this.team === 3 ? 1 : 0;
  }

  /** SDK: CTFBaseRocket::RocketTouch → Explode. */
  override onImpact(other: Entity, tr: TraceResult): void {
    if (this.exploded) return;
    if (other.isTrigger()) return;
    if (tr.surfaceFlags & SURF_SKY) {
      this.world.remove(this);
      return;
    }
    this.exploded = true;
    this.enemy = other === this.world.worldEntity ? NO_ENTITY : other.id;
    const script = this.script ?? launcherScript(this, 'tf_weapon_rocketlauncher');
    const attackerEnt = this.world.entity(this.owner);
    // A sentry's rocket credits its builder (IScorer / GetOwnerEntity()->GetOwnerEntity()).
    const attacker = attackerEnt && !attackerEnt.isPlayer() && attackerEnt.owner !== NO_ENTITY ? attackerEnt.owner : this.owner;
    explodeProjectile(this, tr, other, {
      attacker,
      damage: this.damage,
      damageType: script.damageType,
      customKill: 0,
      radius: RADIUS_DAMAGE.rocketRadius,
      selfRadius: RADIUS_DAMAGE.rocketSelfRadius,
      selfBaseDamage: script.primary.damage,
      script,
    });
    this.world.remove(this);
  }

  /** Rockets never bounce. */
  override resolveFlyCollisionCustom(): void {}
}

registerEntityClass('tf_projectile_rocket', TFProjectileRocket);

/** Rocket speed helper for tests and bots. */
export const rocketVelocity = (forward: Vec3, out: Vec3 = vec3()): Vec3 => {
  out.x = forward.x * ROCKET.speed;
  out.y = forward.y * ROCKET.speed;
  out.z = forward.z * ROCKET.speed;
  return out;
};
