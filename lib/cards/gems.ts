/**
 * Gems and booster packs as pure rules: what a card is worth as gems, what a pack costs
 * and yields, and drawing a pack from an injected random source. Client-safe. See
 * docs/superpowers/specs/2026-10-30-gems-boosters-design.md.
 */

import { FOIL_ONE_IN, SET_SIZE } from '@/lib/cards/cards';

export const GEMS_PER_CARD = 10;
export const FOIL_GEMS = 40;
export const PACK_COST = 100;
export const PACK_SIZE = 3;
/** Gems are bought in units of this many, at one coin per gem. */
export const BUY_UNIT_GEMS = 100;
export const MAX_BUY_UNITS = 10;

export const gemValue = (foil: boolean) => (foil ? FOIL_GEMS : GEMS_PER_CARD);

/** Coins for `units` units of gems. */
export const coinCostFor = (units: number) => units * BUY_UNIT_GEMS;

export function validateBuyUnits(units: number): boolean {
  return Number.isInteger(units) && units >= 1 && units <= MAX_BUY_UNITS;
}

/** A random integer in [0, max). Production passes `crypto.randomInt`; tests pass a fixed source. */
export type Rng = (max: number) => number;

export type DrawnCard = { cardIndex: number; foil: boolean };

/** Three cards, each a random card of the set (duplicates possible) and foil one time in twenty. */
export function drawPack(rng: Rng): DrawnCard[] {
  return Array.from({ length: PACK_SIZE }, () => {
    const cardIndex = rng(SET_SIZE);
    const foil = rng(FOIL_ONE_IN) === 0;
    return { cardIndex, foil };
  });
}
