/**
 * The game's item tiers and the colours its HUD gives them. The colours are the `ItemRarity*` entries of
 * the HUD's `clientscheme.res` (a test keeps this table equal to the copy the HUD editor ships), so a tier
 * looks the same here as in the game's own item panels.
 */

import type { Rarity } from './catalog-types';

export interface RarityStyle {
  /** What items call it. */
  name: string;
  /** What weapons call it (the game's "grade"). */
  weaponName: string;
  /** `r g b` from `ItemRarity<Name>`. */
  rgb: readonly [number, number, number];
  /** `ItemRarity<Name>_GreyedOut`: the tier on a dimmed tile. */
  dim: readonly [number, number, number];
}

export const RARITY_STYLE: Record<Rarity, RarityStyle> = {
  common: { name: 'Common', weaponName: 'Civilian', rgb: [176, 195, 217], dim: [59, 65, 72] },
  uncommon: { name: 'Uncommon', weaponName: 'Freelance', rgb: [94, 152, 217], dim: [31, 50, 72] },
  rare: { name: 'Rare', weaponName: 'Mercenary', rgb: [75, 105, 255], dim: [25, 35, 85] },
  mythical: { name: 'Mythical', weaponName: 'Commando', rgb: [136, 71, 255], dim: [45, 24, 85] },
  legendary: { name: 'Legendary', weaponName: 'Assassin', rgb: [211, 44, 230], dim: [70, 15, 77] },
  ancient: { name: 'Ancient', weaponName: 'Elite', rgb: [235, 75, 75], dim: [78, 25, 25] },
};

const css = (c: readonly [number, number, number], alpha = 1): string =>
  alpha === 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha})`;

/** The tier's HUD colour. */
export const rarityColor = (r: Rarity, alpha = 1): string => css(RARITY_STYLE[r].rgb, alpha);

/** The tile background for a tiered item: the tier's dimmed HUD colour, the same one the game's panels use behind an item. */
export const rarityBackground = (r: Rarity): string => css(RARITY_STYLE[r].dim);

/** What the game calls an item's tier: weapons use the grade names (Civilian … Elite). */
export function tierName(item: { rt?: Rarity; s?: string }): string {
  if (!item.rt) return '';
  const style = RARITY_STYLE[item.rt];
  return item.s === 'primary' || item.s === 'secondary' || item.s === 'melee'
    ? style.weaponName
    : style.name;
}
