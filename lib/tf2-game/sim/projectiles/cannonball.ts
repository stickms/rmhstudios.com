/**
 * The Loose Cannon's cannonball (CTFGrenadePipebombProjectile in TF_GL_MODE_CANNONBALL,
 * tf_weapon_grenade_pipebomb.cpp): a pipe that does not explode on the enemies it meets before it
 * touches the world — it pushes each of them once instead (PipebombTouch: 50 → 25 impact damage as
 * the distance from the shooter goes 512 → 1024, TF_DMG_CUSTOM_CANNONBALL_PUSH; a 0.5 s stun when on
 * the ground, then a push of 400 away from the shooter + 350 up) and marks them for the launcher's
 * double donk (an explosion within tf_double_donk_window of the push mini-crits them). It explodes
 * on its fuse — what was left of the cannon's 1 s charge — with the pipes' 60 % timer damage.
 *
 * Environment-agnostic.
 */

import { vec3 } from '../../core/vec';
import { TF_DMG_CUSTOM } from '../../data/damage';
import { TF_COND } from '../conditions';
import { createDamageInfo, resetDamageInfo } from '../damage';
import { DAMAGE_NO, type Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { remapClamped, set } from '../../core/vec';
import { stunPlayer, TF_STUN_MOVEMENT } from '../items/effects';
import type { Player } from '../player';
import { PROJECTILE_KIND } from './common';
import { TFGrenadePipebomb } from './pipebomb';

export const CANNONBALL_MODEL = 'models/weapons/w_models/w_cannonball.mdl';
/** TF_WEAPON_CANNON_IMPACT_SOUND. */
const CANNON_IMPACT_SOUND = 'Weapon_LooseCannon.BallImpact';

/** A launcher that keeps the double-donk list (CTFGrenadeLauncher::AddDonkVictim). */
interface DonkLauncher {
  addDonkVictim(victim: Entity): void;
}

const centerA = vec3();
const centerB = vec3();
const push = vec3();
// Lazily created (projectiles sit on the sim/damage import cycle).
let impactInfo: ReturnType<typeof createDamageInfo> | null = null;

export class TFGrenadeCannonball extends TFGrenadePipebomb {
  /** m_penetratedEntities. */
  readonly penetrated: number[] = [];
  /** The fuse FireProjectileInternal set (SetDetonateTimerLength). */
  fuse = -1;

  constructor(classname: string) {
    super(classname);
    this.model = CANNONBALL_MODEL;
    this.projectileKind = PROJECTILE_KIND.CANNONBALL;
  }

  override applyExtra(x: Readonly<Record<string, number | string | boolean>>): void {
    super.applyExtra(x);
    if (typeof x.fuse === 'number') this.fuse = x.fuse;
  }

  override spawn(): void {
    super.spawn();
    if (this.fuse >= 0) this.setTimer(this.world.curtime + this.fuse);
    // Held to the end of the charge: it goes off in the shooter's face (FireProjectileInternal).
    if (this.fuse === 0) this.detonate();
  }

  /** SDK: CTFGrenadePipebombProjectile::PipebombTouch, TF_GL_MODE_CANNONBALL. */
  protected override pipebombTouch(other: Entity): void {
    if (this.touched || this.exploded) return;
    if (
      other.id === this.owner ||
      !other.team ||
      other.team === this.team ||
      other.takeDamage === DAMAGE_NO
    )
      return;
    const w = this.world;
    const attacker = w.entity(this.owner);
    if (!attacker || !(other.isPlayer() || other.isBaseObject())) return;
    if (this.penetrated.includes(other.id)) return;
    const dx = other.origin.x - attacker.origin.x;
    const dy = other.origin.y - attacker.origin.y;
    const dz = other.origin.z - attacker.origin.z;
    const info = resetDamageInfo((impactInfo ??= createDamageInfo()));
    info.attacker = attacker.id;
    info.inflictor = this.id;
    info.weaponId = this.weaponId;
    info.weaponDefIndex = this.launcherDefIndex;
    info.killIcon = this.killIcon;
    info.damage = remapClamped(dx * dx + dy * dy + dz * dz, 512 * 512, 1024 * 1024, 50, 25);
    info.damageType = 1 << 6; // DMG_BLAST (the grenade's)
    info.customKill = TF_DMG_CUSTOM.TF_DMG_CUSTOM_CANNONBALL_PUSH;
    set(info.position, this.origin.x, this.origin.y, this.origin.z);
    w.applyDamage(other, info);
    if (other.isPlayer()) {
      const victim = other as Player;
      if (victim.alive) {
        if (!victim.cond.has(TF_COND.KNOCKED_INTO_AIR))
          stunPlayer(
            victim,
            0.5,
            1,
            TF_STUN_MOVEMENT,
            attacker.isPlayer() ? (attacker as Player) : null,
          );
        victim.worldSpaceCenter(centerA);
        attacker.worldSpaceCenter(centerB);
        set(push, centerA.x - centerB.x, centerA.y - centerB.y, centerA.z - centerB.z);
        const len = Math.hypot(push.x, push.y, push.z) || 1;
        set(push, (push.x / len) * 400, (push.y / len) * 400, (push.z / len) * 400 + 350);
        w.clearGround(victim);
        victim.applyAbsVelocityImpulse(push);
      }
    }
    this.penetrated.push(other.id);
    w.emitSound(CANNON_IMPACT_SOUND, { entity: this.id });
    (this.launcher as unknown as Partial<DonkLauncher> | null)?.addDonkVictim?.(other);
  }
}

registerEntityClass('tf_projectile_cannonball', TFGrenadeCannonball);
