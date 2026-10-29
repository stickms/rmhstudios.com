/**
 * Item attributes and the attribute hooks (the SDK's econ attribute system,
 * game/shared/econ/attribute_manager.cpp, reduced to what the simulation reads).
 *
 * An equipped item carries its schema attributes as `[attribute_class, value, op]`
 * (lib/tf2-loadout/catalog-types.ts `CatalogAttribute`). Game code asks for a value
 * the way the SDK's CALL_ATTRIB_HOOK_* macros do: a base value goes through every
 * attribute of that class on the entity and its providers, each combining by its
 * description format (ApplyAttribute: percentages multiply, additive values add,
 * lookup values replace, flags OR).
 *
 *   - A **weapon** hook (CALL_ATTRIB_HOOK_FLOAT inside CTFWeaponBase) sees the
 *     weapon's own attributes, then its owner's providers — the worn items —
 *     but never another weapon (CAttributeManager::ApplyAttributeFloat: "Don't
 *     allow weapons to provide to other weapons being carried by the same person").
 *   - A **player** hook (CALL_ATTRIB_HOOK_FLOAT_ON_OTHER(player, …)) sees every
 *     provider: the worn items and every weapon, except that a weapon with
 *     `provide_on_active` provides only while it is the active one
 *     (CTFWeaponBase::OnActiveStateChanged → ReapplyProvision).
 *
 * CALL_ATTRIB_HOOK_INT rounds the result to the nearest integer
 * (AttributeConvertFromFloat<int> → RoundFloatToInt): use `hookInt`.
 *
 * Environment-agnostic and allocation-free per hook.
 */

import type { AttributeOp, CatalogAttribute } from '../../../tf2-loadout/catalog-types';

export interface ItemAttribute {
  readonly cls: string;
  readonly value: number;
  readonly op: AttributeOp;
}

/** SDK: attribute_manager.cpp ApplyAttribute. */
export function applyAttributeOp(value: number, op: AttributeOp, mod: number): number {
  switch (op) {
    case 0:
      return value * mod;
    case 1:
      return value + mod;
    case 2:
      return mod;
    case 3:
      return value | mod;
    default:
      return value;
  }
}

/** One item's attributes, indexed by class. Immutable. */
export class AttributeSet {
  static readonly EMPTY = new AttributeSet([]);
  private readonly byClass = new Map<string, ItemAttribute[]>();
  /** Attribute classes whose value is a string (custom_projectile_model …): kept for reporting only. */
  readonly textClasses: readonly string[];
  readonly all: readonly ItemAttribute[];

  constructor(attrs: readonly CatalogAttribute[] | readonly ItemAttribute[]) {
    const list: ItemAttribute[] = [];
    const text: string[] = [];
    for (const a of attrs) {
      const item: ItemAttribute | null = Array.isArray(a)
        ? typeof a[1] === 'number'
          ? { cls: a[0], value: a[1], op: a[2] }
          : (text.push(a[0]), null)
        : (a as ItemAttribute);
      if (!item) continue;
      list.push(item);
      const cur = this.byClass.get(item.cls);
      if (cur) cur.push(item);
      else this.byClass.set(item.cls, [item]);
    }
    this.all = list;
    this.textClasses = text;
  }

  get size(): number {
    return this.all.length;
  }

  has(cls: string): boolean {
    return this.byClass.has(cls);
  }

  /** Applies this set's attributes of `cls` to `value`, in schema order. */
  apply(cls: string, value: number): number {
    const list = this.byClass.get(cls);
    if (!list) return value;
    for (let i = 0; i < list.length; i++)
      value = applyAttributeOp(value, list[i].op, list[i].value);
    return value;
  }

  /** Every attribute class present (numeric and text). */
  classes(): string[] {
    return [...new Set([...this.byClass.keys(), ...this.textClasses])];
  }
}

/** Something that carries attributes: a weapon, or a worn item. */
export interface AttributeCarrier {
  readonly attributes?: AttributeSet;
  /** `provide_on_active`: a weapon that provides to its owner only while it is out. */
  readonly provideOnActive?: boolean;
}

/** What a player provides attributes from (sim/player.ts implements it). */
export interface AttributeOwner {
  /** Worn items: weapon-slot wearables (Gunboats, shields) and cosmetics with attributes. */
  readonly wornAttributes: readonly AttributeSet[];
  readonly weapons: ReadonlyArray<AttributeCarrier | null>;
  readonly activeSlot: number;
}

const carrierOf = (w: unknown): (AttributeCarrier & { attributes: AttributeSet }) | null => {
  const a = (w as AttributeCarrier | null)?.attributes;
  return a instanceof AttributeSet ? (w as AttributeCarrier & { attributes: AttributeSet }) : null;
};

/** CALL_ATTRIB_HOOK_FLOAT_ON_OTHER(player, value, cls). */
export function hookPlayer(owner: AttributeOwner | null, cls: string, value: number): number {
  if (!owner) return value;
  const worn = owner.wornAttributes;
  for (let i = 0; i < worn.length; i++) value = worn[i].apply(cls, value);
  const weapons = owner.weapons;
  for (let i = 0; i < weapons.length; i++) {
    const c = carrierOf(weapons[i]);
    if (!c || c.attributes.size === 0) continue;
    if (c.provideOnActive && i !== owner.activeSlot) continue;
    value = c.attributes.apply(cls, value);
  }
  return value;
}

/**
 * CALL_ATTRIB_HOOK_FLOAT inside a weapon (or _ON_OTHER(weapon, …)): the weapon's own
 * attributes, then what its owner wears.
 */
export function hookWeapon(
  weapon: unknown,
  owner: AttributeOwner | null,
  cls: string,
  value: number,
): number {
  const c = carrierOf(weapon);
  if (c) value = c.attributes.apply(cls, value);
  if (owner) {
    const worn = owner.wornAttributes;
    for (let i = 0; i < worn.length; i++) value = worn[i].apply(cls, value);
  }
  return value;
}

/** CALL_ATTRIB_HOOK_INT: the float result rounded to the nearest integer (RoundFloatToInt). */
export const hookInt = (value: number): number => Math.round(value);
