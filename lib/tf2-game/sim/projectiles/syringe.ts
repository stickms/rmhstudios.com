/**
 * tf_projectile_syringe (CTFProjectile_Syringe over CTFBaseProjectile): a
 * ±1 MOVETYPE_FLYGRAVITY dart at SYRINGE.speed with SYRINGE.gravity of
 * sv_gravity. It hits players of both teams (teammates absorb it harmlessly)
 * and disappears on the world (CTFBaseProjectile::ProjectileTouch). Not
 * airblastable (no FL_GRENADE).
 */

import { SURF_SKY } from '../../core/constants';
import { MOVETYPE_FLYGRAVITY } from '../../core/constants';
import type { TraceResult } from '../../core/types';
import { set, vec3, vectorAngles, type Vec3 } from '../../core/vec';
import { SYRINGE } from '../../data/weapons';
import { COLLISION_GROUP_PROJECTILE, DAMAGE_NO, type Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { createDamageInfo, DMG_CRITICAL, resetDamageInfo } from '../damage';
import { BaseProjectile } from '../physics';
import { DMG_TYPE_SYRINGE, NAIL_HALF_EXTENT } from '../weapons/constants';
import { PROJECTILE_KIND, SYRINGE_MODEL } from './common';

const NAIL_MINS: Vec3 = { x: -NAIL_HALF_EXTENT, y: -NAIL_HALF_EXTENT, z: -NAIL_HALF_EXTENT };
const NAIL_MAXS: Vec3 = { x: NAIL_HALF_EXTENT, y: NAIL_HALF_EXTENT, z: NAIL_HALF_EXTENT };
const nailInfo = createDamageInfo();
const scratchDir = vec3();

export class TFProjectileSyringe extends BaseProjectile {
  constructor(classname: string) {
    super(classname);
    this.model = SYRINGE_MODEL;
    this.projectileKind = PROJECTILE_KIND.SYRINGE;
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.gravity = SYRINGE.gravity;
    this.setSize(NAIL_MINS, NAIL_MAXS);
    this.collisionGroup = COLLISION_GROUP_PROJECTILE;
    this.collideWithTeammates = true;
  }

  override spawn(): void {
    super.spawn();
    vectorAngles(this.velocity, this.angles);
    this.skin = this.team === 3 ? 1 : 0;
    // CTFBaseProjectile::FlyThink keeps the angles on the velocity (every 0.1 s there; every tick here).
    this.setThink(this.flyThink, this.world.curtime);
  }

  private readonly flyThink = (): void => {
    vectorAngles(this.velocity, this.angles);
    this.nextThink = this.world.curtime;
  };

  /** SDK: CTFBaseProjectile::ProjectileTouch. */
  override onImpact(other: Entity, tr: TraceResult): void {
    const w = this.world;
    if (tr.surfaceFlags & SURF_SKY || other === w.worldEntity || other.takeDamage === DAMAGE_NO) {
      w.remove(this);
      return;
    }
    const info = resetDamageInfo(nailInfo);
    info.attacker = this.owner;
    // The SDK's inflictor is the launcher (the weapon); the owner stands in for it.
    info.inflictor = this.owner;
    info.weaponId = this.weaponId;
    info.weaponDefIndex = this.launcherDefIndex;
    info.killIcon = this.killIcon;
    info.damage = this.damage;
    info.damageType = DMG_TYPE_SYRINGE | (this.critType === 2 ? DMG_CRITICAL : 0);
    info.critType = this.critType === 2 ? 2 : 0;
    info.position.x = this.origin.x;
    info.position.y = this.origin.y;
    info.position.z = this.origin.z;
    // GetDamageForce: the flight direction × damage.
    set(scratchDir, this.velocity.x, this.velocity.y, this.velocity.z);
    const len = Math.hypot(scratchDir.x, scratchDir.y, scratchDir.z) || 1;
    set(info.force, (scratchDir.x / len) * this.damage, (scratchDir.y / len) * this.damage, (scratchDir.z / len) * this.damage);
    info.hitGroup = tr.hitGroup;
    w.applyDamage(other, info);
    if (other.isPlayer()) w.emitEffect({ kind: 'blood', pos: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z }, entity: other.id });
    w.remove(this);
  }

  override resolveFlyCollisionCustom(): void {}
}

registerEntityClass('tf_projectile_syringe', TFProjectileSyringe);
