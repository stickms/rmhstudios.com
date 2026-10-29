/**
 * Loadouts for bots: stock by default; at hard and expert a bot may carry an unlock in each held
 * weapon slot — only items the simulation plays in full (a `weapon` with nothing unsupported) and
 * the brain can use by holding +attack (BOT_UNUSABLE_ITEM_CLASSES), so the bot brain never meets an
 * item it was not written for. Chosen from the match's seeded random
 * stream, so a match stays reproducible.
 *
 * Environment-agnostic.
 */

import { CLASS_NAMES, TF_CLASS_COUNT } from '../../core/constants';
import type { UniformRandomStream } from '../../core/random';
import { slotFor, type LoadoutSlots, type TfClass } from '../../../tf2-loadout/catalog-types';
import { itemCatalog } from './registry';
import { resolveItem } from './resolve';

const HELD: ReadonlyArray<'primary' | 'secondary' | 'melee'> = ['primary', 'secondary', 'melee'];

/**
 * Fully simulated item classes the bot brain cannot use (its fight() holds +attack at whatever it
 * draws): the Huntsman fires on release, the Loose Cannon would misfire in its face, lunch boxes and
 * banners need a taunt or a full meter, the B.A.S.E. Jumper is never drawn, the Wrangler would steer
 * the sentry at random, the Gas Passer needs a full meter.
 */
export const BOT_UNUSABLE_ITEM_CLASSES: ReadonlySet<string> = new Set([
  'tf_weapon_compound_bow',
  'tf_weapon_cannon',
  'tf_weapon_lunchbox',
  'tf_weapon_lunchbox_drink',
  'tf_weapon_buff_item',
  'tf_weapon_parachute',
  'tf_weapon_laser_pointer',
  'tf_weapon_jar_gas',
]);

let cached: { catalog: object; pools: number[][][] } | null = null;

/** Fully simulated weapons per class index and held slot, computed once per catalog. */
function pools(): number[][][] | null {
  const catalog = itemCatalog();
  if (!catalog) return null;
  if (cached?.catalog === catalog) return cached.pools;
  const out: number[][][] = [];
  for (let cls = 1; cls < TF_CLASS_COUNT; cls++) {
    const name = CLASS_NAMES[cls] as TfClass;
    out[cls] = HELD.map((slot) =>
      catalog.items
        .filter((it) => {
          if (it.sk || slotFor(it, name) !== slot) return false;
          if (it.ic && BOT_UNUSABLE_ITEM_CLASSES.has(it.ic)) return false;
          const play = resolveItem(it.id, cls);
          return !!play && play.kind === 'weapon' && play.unsupported.length === 0;
        })
        .map((it) => it.id),
    );
  }
  cached = { catalog, pools: out };
  return out;
}

/** Per class index, a loadout of fully simulated unlocks (or nothing: stock), or null without a catalog. */
export function randomBotLoadouts(
  random: UniformRandomStream,
  unlockChance = 0.5,
): Array<LoadoutSlots | undefined> | null {
  const all = pools();
  if (!all) return null;
  const out: Array<LoadoutSlots | undefined> = [];
  for (let cls = 1; cls < TF_CLASS_COUNT; cls++) {
    const slots: LoadoutSlots = {};
    HELD.forEach((slot, i) => {
      if (random.randomFloat(0, 1) >= unlockChance) return;
      const pool = all[cls][i];
      if (pool.length) slots[slot] = { item: pool[random.randomInt(0, pool.length - 1)] };
    });
    out[cls] = Object.keys(slots).length ? slots : undefined;
  }
  return out;
}
