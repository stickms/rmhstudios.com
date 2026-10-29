/**
 * From an item to what the simulation does with it (CTFPlayer::GiveDefaultItems →
 * ItemGenerationCriteria → GiveNamedItem): the entity its `item_class` creates for the
 * wearer's class (TranslateWeaponEntForClass), the weapon numbers its attributes change
 * (folded into the weapon's stats the way the SDK's hooks scale the script values), and
 * what it does that is not simulated.
 *
 *   - **weapon**: a held weapon on a stock implementation — the stock item_class itself
 *     (a Black Box is a tf_weapon_rocketlauncher), or an unlock script that refines one
 *     (data/unlock-scripts.ts: the Direct Hit, the Shortstop, swords …);
 *   - **wearable**: a weapon-slot item that is worn, not held (Gunboats, a shield): no
 *     weapon in that slot, its attributes go to the wearer;
 *   - **fallback**: an item class with no implementation here (the Huntsman, jars, lunch
 *     boxes, banners …). The wearer gets the class's stock weapon for that slot and the
 *     item is reported as not simulated;
 *   - **cosmetic**: hats, misc, action and taunt items — rendering only.
 *
 * Environment-agnostic.
 */

import { CLASS_NAMES, TF_CLASS_COUNT, type ClassName } from '../../core/constants';
import { CLASS_DATA, type LoadoutSlot } from '../../data/classes';
import { STOCK_WEAPONS } from '../../data/weapons';
import {
  slotFor,
  type CatalogAttribute,
  type CatalogItem,
  type ItemSlot,
} from '../../../tf2-loadout/catalog-types';
import type { WeaponSpec } from '../weapon-api';
import { AttributeSet } from './attributes';
import { catalogItem } from './registry';
import { implementingScript, isUnlockScript, weaponScript } from './scripts';
import { ITEM_CLASS_MECHANICS, PARTIAL_ATTRIBUTES, SUPPORTED_ATTRIBUTES } from './support';

/** SDK: tf_shareddefs.cpp pszWpnEntTranslationList (TranslateWeaponEntForClass). */
const TRANSLATIONS: Readonly<Record<string, Partial<Record<ClassName, string>>>> = {
  tf_weapon_shotgun: {
    soldier: 'tf_weapon_shotgun_soldier',
    heavy: 'tf_weapon_shotgun_hwg',
    pyro: 'tf_weapon_shotgun_pyro',
    engineer: 'tf_weapon_shotgun_primary',
  },
  tf_weapon_pistol: { scout: 'tf_weapon_pistol_scout', engineer: 'tf_weapon_pistol' },
  tf_weapon_shovel: { soldier: 'tf_weapon_shovel', demoman: 'tf_weapon_bottle' },
  tf_weapon_bottle: { soldier: 'tf_weapon_shovel', demoman: 'tf_weapon_bottle' },
  saxxy: {
    scout: 'tf_weapon_bat',
    sniper: 'tf_weapon_club',
    soldier: 'tf_weapon_shovel',
    demoman: 'tf_weapon_bottle',
    medic: 'tf_weapon_bonesaw',
    heavy: 'tf_weapon_fireaxe',
    pyro: 'tf_weapon_fireaxe',
    spy: 'tf_weapon_knife',
    engineer: 'tf_weapon_wrench',
  },
  // The Engineer's revolver entity (tf_weapon_revolver_secondary) is a CTFRevolver.
  tf_weapon_revolver: { spy: 'tf_weapon_revolver', engineer: 'tf_weapon_revolver' },
};

/** Item classes the buildings module implements without a weapon script here. */
const BUILDING_ITEM_CLASSES = new Set(['tf_weapon_builder', 'tf_weapon_sapper']);

/** The entity class an item creates for a class (TranslateWeaponEntForClass). */
export function translateItemClass(itemClass: string, cls: ClassName): string {
  return TRANSLATIONS[itemClass]?.[cls] ?? itemClass;
}

/** A worn weapon-slot item (tf_wearable, tf_wearable_demoshield, tf_wearable_razorback …). */
export const isWearableClass = (itemClass: string | undefined): boolean =>
  !!itemClass && itemClass.startsWith('tf_wearable');

export type ItemPlayKind = 'weapon' | 'wearable' | 'fallback' | 'cosmetic';

export interface ItemPlay {
  kind: ItemPlayKind;
  defindex: number;
  /** The wearer's loadout slot for it. */
  slot: ItemSlot;
  /** weapon: the script (entity class) that runs it. */
  scriptName?: string;
  /** fallback: the stock item the wearer gets instead. */
  stockDefindex?: number;
  attributes: readonly CatalogAttribute[];
  /**
   * What is not simulated: `item-class` (the whole item: fallback), `mechanic:<key>` (its item
   * class's own mechanic), or attribute classes. Empty when the item is fully simulated.
   */
  unsupported: string[];
}

const WEAPON_SLOTS: ReadonlySet<ItemSlot> = new Set([
  'primary',
  'secondary',
  'melee',
  'building',
  'pda',
  'pda2',
]);

/** Attribute classes on an item the simulation does not apply. */
export function unsupportedAttributes(attrs: readonly CatalogAttribute[]): string[] {
  const out: string[] = [];
  for (const [cls, value] of attrs) {
    if (SUPPORTED_ATTRIBUTES.has(cls)) continue;
    const partial = PARTIAL_ATTRIBUTES[cls];
    if (partial && typeof value === 'number' && partial(value)) continue;
    if (!out.includes(cls)) out.push(cls);
  }
  return out;
}

/** The class's stock item for a weapon slot (CTFInventoryManager::GetBaseItemForClass). */
export function stockItemFor(classIndex: number, slot: ItemSlot): number | undefined {
  const loadout = CLASS_DATA[classIndex]?.defaultLoadout as
    Partial<Record<LoadoutSlot, number>> | undefined;
  return loadout?.[slot as LoadoutSlot];
}

/** What `defindex` is for a class, or null when the class cannot use it (or it is unknown). */
export function resolveItem(defindex: number, classIndex: number): ItemPlay | null {
  if (classIndex <= 0 || classIndex >= TF_CLASS_COUNT) return null;
  const cls = CLASS_NAMES[classIndex] as ClassName;
  const item: CatalogItem | null = catalogItem(defindex);
  if (!item) return null;
  const slot = slotFor(item, cls);
  if (!slot) return null;
  const attributes = item.at ?? [];
  if (!WEAPON_SLOTS.has(slot)) {
    return { kind: 'cosmetic', defindex, slot, attributes: [], unsupported: [] };
  }
  const itemClass = item.ic ?? STOCK_WEAPONS[defindex]?.itemClass ?? '';
  if (isWearableClass(itemClass)) {
    const unsupported = unsupportedAttributes(attributes);
    const mech = ITEM_CLASS_MECHANICS[itemClass];
    if (mech) unsupported.unshift(`mechanic:${mech}`);
    return { kind: 'wearable', defindex, slot, attributes, unsupported };
  }
  const scriptName = translateItemClass(itemClass, cls);
  const implemented =
    BUILDING_ITEM_CLASSES.has(scriptName) ||
    (implementingScript(scriptName) !== undefined && !!weaponScript(scriptName));
  if (!implemented) {
    return {
      kind: 'fallback',
      defindex,
      slot,
      stockDefindex: stockItemFor(classIndex, slot),
      attributes,
      unsupported: ['item-class'],
    };
  }
  const unsupported = unsupportedAttributes(attributes);
  const mech = ITEM_CLASS_MECHANICS[itemClass] ?? ITEM_CLASS_MECHANICS[scriptName];
  if (mech) unsupported.unshift(`mechanic:${mech}`);
  return { kind: 'weapon', defindex, slot, scriptName, attributes, unsupported };
}

/**
 * The weapon spec for an item held by a class: the script's numbers with the item's own
 * attributes folded in where the SDK scales them (GetMaxClip1, ApplyFireDelay,
 * SetReloadTimer, GetProjectileDamage, FX_FireBullets, GetWeaponSpread, Deploy), plus the
 * attributes for every other hook. Null when the item is not a held weapon for the class.
 */
export function weaponSpecForItem(defindex: number, classIndex: number): WeaponSpec | null {
  const play = resolveItem(defindex, classIndex);
  if (!play || play.kind !== 'weapon' || !play.scriptName) return null;
  const attrs = new AttributeSet(play.attributes);
  const script = weaponScript(play.scriptName);
  if (!script) {
    // A building-module weapon (builder, sapper): its own class supplies the numbers.
    return {
      defindex,
      classname: play.scriptName,
      slot: slotIndexOf(play.slot),
      attributes: play.attributes,
    };
  }
  const mode = script.primary;
  // SDK: CBaseCombatWeapon::GetMaxClip1 (mod_max_primary_clip_override) → CTFWeaponBase::GetMaxClip1 (mult_clipsize, CALL_ATTRIB_HOOK_INT).
  let maxClip = script.clipSize;
  const override = Math.round(attrs.apply('mod_max_primary_clip_override', 0));
  if (override !== 0) maxClip = override;
  if (maxClip >= 0) maxClip = Math.round(attrs.apply('mult_clipsize', maxClip));
  // SDK: CTFWeaponBase::SetReloadTimer — every reload time (start and per shell) is scaled.
  const reloadMult = attrs.apply('mult_reload_time_hidden', attrs.apply('mult_reload_time', 1));
  // SDK: FX_FireBullets — nBulletsPerShot is an int, so the hooked float is truncated.
  const bullets =
    mode.bulletsPerShot >= 1
      ? Math.max(1, Math.trunc(attrs.apply('mult_bullets_per_shot', mode.bulletsPerShot)))
      : mode.bulletsPerShot;
  // SDK: CTFWeaponBase::Deploy — this weapon's own deploy multiplier, and swords' 75 % slower draw.
  const sword = attrs.apply('is_a_sword', 0) !== 0;
  const deployTimeMult = attrs.apply('mult_single_wep_deploy_time', 1) * (sword ? 1.75 : 1);
  // SDK: CTFScatterGun::Reload — set_scattergun_no_reload_single turns the shell-by-shell reload off.
  const noSingle = attrs.apply('set_scattergun_no_reload_single', 0) === 1;
  const isUnlock = isUnlockScript(play.scriptName);
  return {
    defindex,
    classname: play.scriptName,
    slot: script.bucket,
    attributes: play.attributes,
    stats: {
      maxClip,
      damage: attrs.apply('mult_dmg', mode.damage),
      bulletsPerShot: bullets,
      spread: attrs.apply('mult_spread_scale', mode.spread),
      fireDelay: mode.timeFireDelay * attrs.apply('mult_postfiredelay', 1),
      reloadTime: mode.timeReload * reloadMult,
      reloadStartTime: mode.timeReloadStart * reloadMult,
      reloadsSingly: script.reloadsSingly && !noSingle,
      deployTimeMult,
      // An unlock's own world model is drawn from the loadout models by defindex (render/entities).
      ...(isUnlock
        ? { worldModel: script.scriptPlayerModel ?? '', viewModel: script.scriptViewModel ?? '' }
        : {}),
    },
  };
}

/** SLOT_* for a loadout slot (the weapon bucket order). */
export function slotIndexOf(slot: ItemSlot): number {
  switch (slot) {
    case 'primary':
      return 0;
    case 'secondary':
      return 1;
    case 'melee':
      return 2;
    case 'pda':
      return 3;
    case 'pda2':
      return 4;
    case 'building':
      return 5;
    default:
      return -1;
  }
}
