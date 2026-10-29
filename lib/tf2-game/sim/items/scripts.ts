/**
 * Weapon scripts by name, stock and unlock alike: the stock arsenal's
 * (data/weapons.ts WEAPON_SCRIPTS) and the unlock scripts the game runs on a
 * stock implementation (data/unlock-scripts.ts). An unlock script plays its
 * base's sounds — the sound channel publishes the stock arsenal's — and keeps
 * its own names in `ownSounds`.
 *
 * Environment-agnostic.
 */

import { WEAPON_SCRIPTS, type StockWeaponScriptName, type WeaponScript } from '../../data/weapons';
import { UNLOCK_WEAPON_SCRIPTS } from '../../data/unlock-scripts';

const merged = new Map<string, WeaponScript>();
for (const [name, s] of Object.entries(WEAPON_SCRIPTS)) merged.set(name, s);
for (const [name, u] of Object.entries(UNLOCK_WEAPON_SCRIPTS)) {
  const base = WEAPON_SCRIPTS[u.base];
  // The unlock's numbers, the base's sounds; `scriptName` stays the unlock's own.
  merged.set(name, { ...u, sounds: base.sounds } as unknown as WeaponScript);
}

/** A weapon script by name (stock or unlock); undefined when the game has no implementation for it. */
export function weaponScript(name: string): WeaponScript | undefined {
  return merged.get(name);
}

/** The stock script whose weapon class runs `name` (itself for a stock script). */
export function implementingScript(name: string): StockWeaponScriptName | undefined {
  if (name in WEAPON_SCRIPTS) return name as StockWeaponScriptName;
  return UNLOCK_WEAPON_SCRIPTS[name]?.base;
}

export const isUnlockScript = (name: string): boolean => name in UNLOCK_WEAPON_SCRIPTS;
