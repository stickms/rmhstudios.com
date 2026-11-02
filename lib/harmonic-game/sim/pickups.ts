/**
 * Weapon and ammo pickups (plan H1.3): `harmonic_weapon_{prybar,pulse,coil}` and
 * `harmonic_ammo_{pulse,coil}`. A pickup scans for the player every `PICKUP_SCAN_INTERVAL`; when
 * the player is within `PICKUP_RADIUS` and the inventory accepts it the entity is removed (a
 * checkpoint restore brings it back, with the inventory it was taken from — see weapons.ts).
 * Keys: `amount` (ammo pickups: rounds, default from the table). Output: `OnPickup` (activator =
 * the player).
 */
import { distanceSqr } from '../../tf2-game/core/vec';
import { registerSp, SpEntity } from '../../sp-game/entities/base';
import { harmonicSim } from './index';
import {
  PICKUP_MODEL_LIFT,
  PICKUP_RADIUS,
  PICKUP_SCAN_INTERVAL,
  WEAPONS,
  weaponByClassname,
  type AmmoType,
} from './weapon-table';

abstract class HarmonicPickup extends SpEntity {
  protected abstract pickupModel(): string;
  protected abstract tryTake(): boolean;

  override spawn(): void {
    super.spawn();
    this.model = this.pickupModel();
    this.origin.z += PICKUP_MODEL_LIFT;
    this.setThink(() => this.scan(), this.world.curtime + PICKUP_SCAN_INTERVAL);
  }

  private scan(): void {
    const p = this.sp.player;
    if (
      !p.dead &&
      distanceSqr(p.origin, this.origin) <= PICKUP_RADIUS * PICKUP_RADIUS &&
      this.tryTake()
    ) {
      this.fireOutput('OnPickup', p);
      this.sp.remove(this);
      return;
    }
    this.setThink(() => this.scan(), this.world.curtime + PICKUP_SCAN_INTERVAL);
  }
}

export class HarmonicWeaponPickup extends HarmonicPickup {
  protected pickupModel(): string {
    return (weaponByClassname(this.classname) ?? WEAPONS.pulse).worldModel;
  }
  protected tryTake(): boolean {
    const def = weaponByClassname(this.classname);
    const sim = harmonicSim(this.sp);
    return !!def && !!sim && sim.weapons.pickupWeapon(def.id);
  }
}

// No ammo-box model yet (H2.4 can add one): ammo shows the weapon it feeds.
const AMMO_MODEL: Record<AmmoType, string> = {
  pulse: WEAPONS.pulse.worldModel,
  coil: WEAPONS.coil.worldModel,
};

export class HarmonicAmmoPickup extends HarmonicPickup {
  private ammoType(): AmmoType {
    return this.classname.endsWith('coil') ? 'coil' : 'pulse';
  }
  protected pickupModel(): string {
    return AMMO_MODEL[this.ammoType()];
  }
  protected tryTake(): boolean {
    const sim = harmonicSim(this.sp);
    const amount = this.kvNumber('amount', 0) || undefined;
    return !!sim && sim.weapons.addAmmo(this.ammoType(), amount);
  }
}

registerSp(
  HarmonicWeaponPickup,
  'harmonic_weapon_prybar',
  'harmonic_weapon_pulse',
  'harmonic_weapon_coil',
);
registerSp(HarmonicAmmoPickup, 'harmonic_ammo_pulse', 'harmonic_ammo_coil');
