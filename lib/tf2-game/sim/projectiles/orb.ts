/**
 * tf_projectile_mechanicalarmorb (CTFProjectile_MechanicalArmOrb, tf_weapon_mechanical_arm.cpp):
 * the Short Circuit's orb. It drifts at 700 u/s for tf_mecharm_orb_lifetime (1.2 s), every 0.1 s
 * destroying the enemy projectiles within tf_mecharm_orb_size (100) it can see (2 bonus points
 * each; another orb annihilates both) and every 0.15 s zapping up to 2 enemy players within 100 for
 * 15 (DMG_SHOCK, TF_DMG_CUSTOM_PLASMA) — and its owner too when he stands within 80. Hitting the
 * world it bursts, zapping up to 16.
 *
 * Environment-agnostic.
 */

import {
  MASK_SOLID,
  MASK_SOLID_BRUSHONLY,
  MOVETYPE_FLY,
  SURF_SKY,
  TF_TEAM_BLUE,
} from '../../core/constants';
import { emptyTrace, type TraceResult } from '../../core/types';
import { set, type Vec3 } from '../../core/vec';
import { TF_DMG_CUSTOM } from '../../data/damage';
import { TF_COND } from '../conditions';
import { createDamageInfo, DMG_SHOCK, resetDamageInfo } from '../damage';
import { type Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { BaseProjectile } from '../physics';
import type { Player } from '../player';
import { MAX_PLAYERS } from '../world';
import { isDeflectable, PROJECTILE_KIND } from './common';

/** tf_mecharm_orb_*. */
export const MECHARM_ORB_SIZE = 100;
export const MECHARM_ORB_LIFETIME = 1.2;
export const MECHARM_ORB_ZAP_TARGETS = 2;
export const MECHARM_ORB_ZAP_DAMAGE = 15;
/** OrbThink / CheckForPlayers refire. */
const ORB_THINK = 0.1;
const ORB_ZAP_INTERVAL = 0.15;
/** CheckForPlayers: an owner this close is zapped too. */
const ORB_OWNER_ZAP_RANGE = 80;

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const zapTrace = emptyTrace();
const losTrace = emptyTrace();
const candidates: Player[] = [];
// Lazily created (projectiles sit on the sim/damage import cycle).
let zapInfo: ReturnType<typeof createDamageInfo> | null = null;

/** A projectile the orb can destroy (CBaseProjectile::IsDestroyable). */
interface Destroyable extends Entity {
  isDestroyable?(): boolean;
}

export class TFProjectileMechanicalArmOrb extends BaseProjectile {
  nextZapTime = -1;
  private nextThinkTime = 0;
  private exploded = false;

  constructor(classname: string) {
    super(classname);
    this.model = '';
    this.setSize(ZERO, ZERO);
    this.moveType = MOVETYPE_FLY;
    this.gravity = 0;
    this.projectileKind = PROJECTILE_KIND.ENERGY_BALL;
  }

  override spawn(): void {
    super.spawn();
    this.skin = this.team === TF_TEAM_BLUE ? 1 : 0;
    this.nextThinkTime = this.world.curtime;
    this.setThink(this.orbThink, this.world.curtime);
  }

  /** Players pass through it (RocketTouch ignores them); the world ends it. */
  override physicsSolidMask(): number {
    return MASK_SOLID_BRUSHONLY;
  }

  private readonly orbThink = (): void => {
    const w = this.world;
    const t = w.curtime;
    if (t - this.spawnTime >= MECHARM_ORB_LIFETIME) {
      this.explodeAndRemove();
      return;
    }
    if (t >= this.nextThinkTime) {
      this.nextThinkTime = t + ORB_THINK;
      if (t >= this.nextZapTime) this.checkForPlayers(MECHARM_ORB_ZAP_TARGETS);
      this.checkForProjectiles();
      if (this.removed) return;
    }
    this.nextThink = t;
  };

  /** SDK: CTFProjectile_MechanicalArmOrb::CheckForPlayers. */
  checkForPlayers(count: number): void {
    const w = this.world;
    const ownerEnt = w.entity(this.owner);
    if (!ownerEnt || !ownerEnt.isPlayer()) return;
    const owner = ownerEnt as Player;
    candidates.length = 0;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const p = w.player(i);
      if (!p || !p.alive || p.team === owner.team || p.team <= 1) continue;
      const dx = p.origin.x - this.origin.x;
      const dy = p.origin.y - this.origin.y;
      const dz = p.origin.z + p.maxs.z * 0.5 - this.origin.z;
      if (dx * dx + dy * dy + dz * dz > MECHARM_ORB_SIZE * MECHARM_ORB_SIZE) continue;
      candidates.push(p);
    }
    // Shuffle the list (the SDK's RandomInt swaps).
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = w.random.randomInt(0, i);
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }
    let hits = 0;
    for (let i = 0; i < candidates.length && hits < count; i++) {
      const p = candidates[i];
      if (p.cond.has(TF_COND.PHASE) || p.cond.invulnerable) continue;
      w.traceLineWorldOnly(this.origin, p.origin, MASK_SOLID, zapTrace);
      if (zapTrace.fraction < 1) continue;
      this.zap(owner, p);
      hits++;
    }
    if (hits > 0) {
      w.emitSound('TFPlayer.MedicChargedDeath', { entity: this.id });
      // Shoot the floor at your feet and it bites you too.
      const dx = owner.origin.x - this.origin.x;
      const dy = owner.origin.y - this.origin.y;
      const dz = owner.origin.z - this.origin.z;
      if (dx * dx + dy * dy + dz * dz < ORB_OWNER_ZAP_RANGE * ORB_OWNER_ZAP_RANGE)
        this.zap(owner, owner);
    }
    this.nextZapTime = w.curtime + ORB_ZAP_INTERVAL;
  }

  /** SDK: ZapPlayer. */
  private zap(owner: Player, victim: Player): void {
    const w = this.world;
    const info = resetDamageInfo((zapInfo ??= createDamageInfo()));
    info.attacker = owner.id;
    info.inflictor = this.id;
    info.weaponId = this.weaponId;
    info.weaponDefIndex = this.launcherDefIndex;
    info.killIcon = this.killIcon;
    info.damage = MECHARM_ORB_ZAP_DAMAGE;
    info.damageType = DMG_SHOCK;
    info.customKill = TF_DMG_CUSTOM.TF_DMG_CUSTOM_PLASMA;
    set(info.position, this.origin.x, this.origin.y, this.origin.z);
    w.emitEffect({
      kind: 'particle',
      system:
        this.team === TF_TEAM_BLUE ? 'dxhr_lightningball_hit_blue' : 'dxhr_lightningball_hit_red',
      pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
      entity: victim.id,
    });
    w.applyDamage(victim, info);
  }

  /** SDK: CheckForProjectiles — enemy projectiles near it are destroyed. */
  checkForProjectiles(): void {
    const w = this.world;
    let annihilate = false;
    const owner = w.entity(this.owner);
    w.forEachEntity((e) => {
      if (e === this || e.removed || !(e instanceof BaseProjectile) || e.team === this.team) return;
      const dx = e.origin.x - this.origin.x;
      const dy = e.origin.y - this.origin.y;
      const dz = e.origin.z - this.origin.z;
      if (dx * dx + dy * dy + dz * dz > MECHARM_ORB_SIZE * MECHARM_ORB_SIZE) return;
      w.traceLineWorldOnly(this.origin, e.origin, MASK_SOLID, losTrace);
      if (losTrace.fraction < 1) return;
      const d = e as Destroyable;
      const destroyable =
        typeof d.isDestroyable === 'function' ? d.isDestroyable() : isDeflectable(e);
      if (!destroyable) return;
      w.emitEffect({
        kind: 'particle',
        system:
          this.team === TF_TEAM_BLUE ? 'dxhr_lightningball_hit_blue' : 'dxhr_lightningball_hit_red',
        pos: { x: e.origin.x, y: e.origin.y, z: e.origin.z },
      });
      w.emitSound('Weapon_Upgrade.ExplosiveHeadshot', { entity: this.id });
      if (e instanceof TFProjectileMechanicalArmOrb) {
        e.explodeAndRemove();
        annihilate = true;
      } else {
        // CBaseProjectile::Destroy( true, false ): gone without a blast.
        w.emitEffect({
          kind: 'particle',
          system: 'mvm_soldier_shockwave',
          pos: { x: e.origin.x, y: e.origin.y, z: e.origin.z },
        });
        w.remove(e);
      }
      if (owner && owner.isPlayer()) (owner as Player).stats.bonusPoints += 2;
    });
    if (annihilate) this.explodeAndRemove();
  }

  /** SDK: ExplodeAndRemove. */
  explodeAndRemove(): void {
    if (this.exploded) return;
    this.exploded = true;
    const w = this.world;
    w.emitEffect({
      kind: 'particle',
      system:
        this.team === TF_TEAM_BLUE
          ? 'drg_cow_explosioncore_normal_blue'
          : 'drg_cow_explosioncore_normal',
      pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
    });
    w.emitSound('Halloween.spell_lightning_impact', { pos: this.origin });
    this.checkForPlayers(16);
    w.remove(this);
  }

  /** SDK: RocketTouch — the world ends it. */
  override onImpact(other: Entity, tr: TraceResult): void {
    if (other.isPlayer()) return;
    if (tr.surfaceFlags & SURF_SKY) {
      this.world.remove(this);
      return;
    }
    this.explodeAndRemove();
  }

  override resolveFlyCollisionCustom(): void {
    this.explodeAndRemove();
  }
}

registerEntityClass('tf_projectile_mechanicalarmorb', TFProjectileMechanicalArmOrb);
