/**
 * Harmonic's first entities (H1.1): `harmonic_target`, a damageable box for shooting ranges and
 * tests. Later packages add weapons, heaters, enemies in sibling files and register them here
 * the same way (`registerSp`, architecture §5).
 */
import { CONTENTS_MONSTER } from '../../tf2-game/core/constants';
import { DAMAGE_YES, SOLID_BBOX } from '../../tf2-game/sim/entity';
import type { DamageInfo } from '../../tf2-game/sim/damage';
import { registerSp, SpEntity } from '../../sp-game/entities/base';
import { TARGET_DEFAULT_HEALTH, TARGET_HULL_HALF_WIDTH, TARGET_HULL_HEIGHT } from './constants';

/**
 * A solid, damageable box. Keys: `health` (default `TARGET_DEFAULT_HEALTH`).
 * Outputs: `OnHurt` (every damaging hit, activator = attacker) and `OnDeath` (once, at 0).
 * Inputs: the base set plus `Hurt <n>` / `Kill` via the generic entity inputs.
 */
export class HarmonicTarget extends SpEntity {
  /** CONTENTS_* reported on a hit (BoxSolid). */
  contents = CONTENTS_MONSTER;
  dead = false;

  override spawn(): void {
    super.spawn();
    this.solid = SOLID_BBOX;
    this.mins.x = this.mins.y = -TARGET_HULL_HALF_WIDTH;
    this.maxs.x = this.maxs.y = TARGET_HULL_HALF_WIDTH;
    this.mins.z = 0;
    this.maxs.z = TARGET_HULL_HEIGHT;
    this.health = this.kvNumber('health', 0) || TARGET_DEFAULT_HEALTH;
    this.maxHealth = this.health;
    this.takeDamage = DAMAGE_YES;
    this.sp.collision.addBox(this);
  }

  override isSolid(): boolean {
    return !this.dead && !this.removed;
  }

  override onTakeDamage(info: DamageInfo): number {
    if (this.dead || this.takeDamage !== DAMAGE_YES) return 0;
    const dealt = Math.min(info.damage, Math.max(this.health, 0));
    this.health -= info.damage;
    const attacker = this.sp.entity(info.attacker);
    this.fireOutput('OnHurt', attacker);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.fireOutput('OnDeath', attacker);
    }
    return dealt;
  }
}

registerSp(HarmonicTarget, 'harmonic_target');
