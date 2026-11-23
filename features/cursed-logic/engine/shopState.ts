/**
 * The milestone shop: what is on the shelf after a sector and what buying does. Fragments are earned inside a run
 * (`run.ts` pays them per duel won) and spent here; nothing carries to the next run.
 *
 * The old game kept a persistent fragment wallet in localStorage under `cursed-logic-shop` and sold one-run
 * modifiers and Protocol "unlocks" from it. That economy is retired: the modifiers became the Pacts chosen at the
 * start of a run (free, raising the score multiplier) and every Protocol is on the ladder. `retireLegacyShop`
 * removes the old key once.
 */
import { PLAYER, RUN_UPGRADES, SHOP_NUMBERS, SHOP_PRICES, SHOP_SHELF } from './data';
import { removeKey } from '@/lib/core/persist';
import { shuffled, type Rng } from './rng';
import type { RunState } from './run';
import type { RunUpgradeId, ShopItemId } from './types';

const LEGACY_KEY = 'cursed-logic-shop';

/** Drop the retired persistent shop (fragments and unlocks from before the ladder). Safe without storage. */
export function retireLegacyShop(): void {
  removeKey(LEGACY_KEY);
}

export function stockShelf(run: Pick<RunState, 'upgrades' | 'maxIntegrity'>, rng: Rng): ShopItemId[] {
  const isUpgrade = (id: ShopItemId): id is RunUpgradeId => (RUN_UPGRADES as readonly string[]).includes(id);
  const candidates = (Object.keys(SHOP_PRICES) as ShopItemId[]).filter((id) => {
    if (id === 'patch') return false;
    if (isUpgrade(id)) return !run.upgrades.includes(id);
    if (id === 'hull') return run.maxIntegrity < PLAYER.integrityCeiling;
    return true;
  });
  return ['patch', ...shuffled(rng, candidates).slice(0, SHOP_SHELF)];
}

export function canBuy(run: RunState, item: ShopItemId): boolean {
  if (run.stage !== 'shop' || !run.shelf.includes(item)) return false;
  if (run.fragments < SHOP_PRICES[item]) return false;
  if (item === 'patch') return run.integrity < run.maxIntegrity;
  if (item === 'hull') return run.maxIntegrity < PLAYER.integrityCeiling;
  return true;
}

export function buyItem(run: RunState, item: ShopItemId): RunState {
  if (!canBuy(run, item)) return run;
  const paid: RunState = { ...run, fragments: run.fragments - SHOP_PRICES[item] };
  // Everything but the Patch is a one-off: it leaves the shelf once bought.
  const shelf = item === 'patch' ? run.shelf : run.shelf.filter((s) => s !== item);
  switch (item) {
    case 'patch':
      return { ...paid, shelf, integrity: Math.min(run.maxIntegrity, run.integrity + SHOP_NUMBERS.patchHeal) };
    case 'hull': {
      const max = Math.min(PLAYER.integrityCeiling, run.maxIntegrity + SHOP_NUMBERS.hullMax);
      return { ...paid, shelf, maxIntegrity: max, integrity: Math.min(max, run.integrity + SHOP_NUMBERS.hullMax) };
    }
    case 'capacitor':
      return { ...paid, shelf, capacitors: run.capacitors + 1 };
    case 'decoder':
      return { ...paid, shelf, decoders: run.decoders + 1 };
    default:
      return { ...paid, shelf, upgrades: run.upgrades.includes(item) ? run.upgrades : [...run.upgrades, item] };
  }
}

