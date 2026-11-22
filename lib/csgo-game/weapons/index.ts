/**
 * The CS:GO weapon factory: one class per behaviour (firearm, knife, grenade pouch, C4), the numbers
 * from the item's data. The Zeus is not simulated (its item is skipped).
 */

import { csWeapon, type CsWeaponInfo } from '../data/weapon-data';
import type { CsWeapon } from './base';
import { CsC4 } from './c4';
import { CsGrenadePouch } from './grenades';
import { CsGun } from './gun';
import { CsKnife } from './knife';

export { CsWeapon } from './base';
export { CsGun } from './gun';
export { CsKnife } from './knife';
export {
  CsGrenadePouch,
  CsGrenadeProjectile,
  CsArea,
  csRadiusDamage,
  flashAmount,
  flashPlayers,
  smokeBlocksLine,
  smokeCovers,
} from './grenades';
export { CsC4, PlantedC4 } from './c4';

/** A new weapon for an item (null for items that are not simulated weapons: the Zeus, gear). */
export function createCsWeaponFromInfo(info: CsWeaponInfo): CsWeapon | null {
  switch (info.category) {
    case 'knife':
      return new CsKnife(info);
    case 'grenade':
      return new CsGrenadePouch(info);
    case 'c4':
      return new CsC4(info);
    case 'taser':
    case 'equipment':
      return null;
    default:
      return new CsGun(info);
  }
}

/** A new weapon by name (`weapon_ak47` or `ak47`), full clip and reserve. */
export function createCsWeapon(name: string): CsWeapon | null {
  const info = csWeapon(name);
  if (!info) return null;
  const w = createCsWeaponFromInfo(info);
  w?.fill();
  return w;
}
