/**
 * Class loadouts and per-class numbers for the simulation, read from the
 * data tables (data/classes.ts, data/weapons.ts). Turns a class's stock
 * loadout into weapon specs for `createWeapon` (CTFPlayer::GiveDefaultItems:
 * the item, translated to the class's weapon script — shotguns and pistols
 * differ per class — in the script's bucket).
 */

import { CLASS_NAMES, TF_CLASS_COUNT, type ClassName } from '../core/constants';
import { CLASS_DATA, type AmmoType, type LoadoutSlot } from '../data/classes';
import { STOCK_WEAPONS, WEAPON_SCRIPTS, type WeaponScript } from '../data/weapons';
import { TF_AMMO_COUNT, TF_AMMO_DUMMY, defaultWeaponStats, type WeaponSpec } from './weapon-api';
import { weaponSpecForItem } from './items/resolve';

const AMMO_INDEX: Readonly<Record<AmmoType, number>> = {
  primary: 1,
  secondary: 2,
  metal: 3,
  grenades1: 4,
  grenades2: 5,
  grenades3: 6,
};

/** Reserve ammo caps by TF_AMMO_* for a class (CTFPlayer::GetMaxAmmo). */
export function classMaxAmmo(classIndex: number, out: Int32Array = new Int32Array(TF_AMMO_COUNT)): Int32Array {
  out.fill(0);
  const c = CLASS_DATA[classIndex];
  if (!c) return out;
  for (const k of Object.keys(AMMO_INDEX) as AmmoType[]) out[AMMO_INDEX[k]] = c.maxAmmo[k] ?? 0;
  return out;
}

/** Max health for a class (the playerclass script's health_max). */
export function classHealth(classIndex: number): number {
  return CLASS_DATA[classIndex]?.maxHealth ?? 100;
}

export function className(classIndex: number): ClassName | null {
  return classIndex > 0 && classIndex < TF_CLASS_COUNT ? (CLASS_NAMES[classIndex] as ClassName) : null;
}

/**
 * The weapon spec a class gets for an item, or null when the class can't use it (or it is not a
 * held weapon). Stock items use the extracted stock tables; any other item goes through the item
 * schema (sim/items: its item_class, unlock script and attributes).
 */
export function weaponSpecFor(defindex: number, classIndex: number): WeaponSpec | null {
  return stockWeaponSpecFor(defindex, classIndex) ?? weaponSpecForItem(defindex, classIndex);
}

/** The stock path of {@link weaponSpecFor}: null for anything but a stock weapon the class has. */
export function stockWeaponSpecFor(defindex: number, classIndex: number): WeaponSpec | null {
  const name = className(classIndex);
  const item = STOCK_WEAPONS[defindex];
  if (!name || !item) return null;
  const entry = item.perClass[name];
  if (!entry) return null;
  const script: WeaponScript | undefined = WEAPON_SCRIPTS[entry.scriptName];
  if (!script) return null;
  const mode = script.primary;
  return {
    defindex,
    classname: script.scriptName,
    slot: script.bucket,
    stats: defaultWeaponStats({
      classname: script.scriptName,
      defindex,
      slot: script.bucket,
      weaponId: script.weaponId,
      ammoType: script.primaryAmmo ? AMMO_INDEX[script.primaryAmmo] : TF_AMMO_DUMMY,
      maxClip: script.clipSize,
      ammoPerShot: mode.ammoPerShot,
      damage: mode.damage,
      bulletsPerShot: mode.bulletsPerShot,
      spread: mode.spread,
      range: mode.range || 8192,
      fireDelay: mode.timeFireDelay,
      timeIdle: mode.timeIdle,
      reloadTime: mode.timeReload,
      reloadStartTime: mode.timeReloadStart,
      reloadsSingly: script.reloadsSingly,
      damageType: script.damageType,
      killIcon: script.scriptName.replace(/^tf_weapon_/, ''),
      worldModel: item.worldModel ?? '',
      viewModel: item.viewModel ?? '',
    }),
  };
}

/** Loadout slots in the order CTFPlayer::GiveDefaultItems equips them. */
const LOADOUT_ORDER: readonly LoadoutSlot[] = ['primary', 'secondary', 'melee', 'pda', 'pda2', 'building', 'utility'];

/** The stock loadout of a class as weapon specs, by bucket. */
export function stockLoadout(classIndex: number): WeaponSpec[] {
  const c = CLASS_DATA[classIndex];
  if (!c) return [];
  const out: WeaponSpec[] = [];
  for (const slot of LOADOUT_ORDER) {
    const def = c.defaultLoadout[slot];
    if (def === undefined) continue;
    const spec = weaponSpecFor(def, classIndex);
    if (spec) out.push(spec);
  }
  return out;
}
