/**
 * RMHbox — Ranking File set loader
 *
 * Loads and validates the content pack from a static JSON file and draws the
 * rounds of one match: distinct sets, five items each, shown in an order that
 * is never the official one.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { RankingSetSchema, RF_ITEMS_PER_ROUND, type RankingItem, type RankingSet } from './schemas';
import { logger } from '../../../server/rmhbox/logger';

let cachedSets: RankingSet[] | null = null;

/**
 * Load and validate every set in sets.json. A set that fails validation (two
 * equal values, fewer than six items, no source…) is refused and logged; the
 * rest are kept. Cached after the first call.
 */
export function loadSets(): RankingSet[] {
  if (cachedSets) return cachedSets;

  const filePath = join(process.cwd(), 'data', 'rmhbox', 'ranking-file', 'sets.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown[];

  const valid: RankingSet[] = [];
  const ids = new Set<string>();
  for (const entry of raw) {
    const result = RankingSetSchema.safeParse(entry);
    if (!result.success) {
      logger.warn({
        event: 'rf_set_validation_failed',
        error: result.error.message,
        entry: JSON.stringify(entry).slice(0, 200),
      });
      continue;
    }
    if (ids.has(result.data.id)) {
      logger.warn({ event: 'rf_set_duplicate_id', id: result.data.id });
      continue;
    }
    ids.add(result.data.id);
    valid.push(result.data);
  }

  cachedSets = valid;
  logger.info({ event: 'rf_sets_loaded', totalLoaded: valid.length, totalRaw: raw.length });
  return cachedSets;
}

/** Reset the cached pack (for tests). */
export function resetSetCache(): void {
  cachedSets = null;
}

export type Rng = () => number;

/** Fisher-Yates shuffle into a new array. */
export function shuffled<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One round, as the server holds it. `official` is the true order, largest first. */
export interface RankingRound {
  setId: string;
  category: RankingSet['category'];
  prompt: string;
  unit: string;
  source: string;
  /** The five drawn items, official order (largest value first). */
  official: RankingItem[];
  /** The same labels as first shown to every player; never equal to `official`. */
  display: string[];
}

/** Draw five items from a set and fix the display order. */
export function buildRound(set: RankingSet, rng: Rng = Math.random): RankingRound {
  const drawn = shuffled(set.items, rng).slice(0, RF_ITEMS_PER_ROUND);
  const official = [...drawn].sort((a, b) => b.value - a.value);
  const officialLabels = official.map((item) => item.label);
  let display = shuffled(officialLabels, rng);
  // A shuffle that lands on the answer would hand out a perfect round for free.
  for (let attempts = 0; attempts < 20 && display.every((label, i) => label === officialLabels[i]); attempts++) {
    display = shuffled(officialLabels, rng);
  }
  if (display.every((label, i) => label === officialLabels[i])) display = [...officialLabels].reverse();
  return {
    setId: set.id,
    category: set.category,
    prompt: set.prompt,
    unit: set.unit,
    source: set.source,
    official,
    display,
  };
}

/**
 * Pick `count` distinct sets for a match. `category` 'all' draws from the whole
 * pack; a category draws from it first and makes up a shortfall from the rest.
 * Sets in `usedIds` (played earlier in the lobby) come last, so a lobby sees
 * every set once before any repeats.
 */
export function selectRoundsForGame(
  pool: readonly RankingSet[],
  usedIds: ReadonlySet<string>,
  count: number,
  category: string = 'all',
  rng: Rng = Math.random,
): RankingRound[] {
  const target = Math.max(0, Math.floor(count));
  const inCategory = (s: RankingSet) => category === 'all' || s.category === category;
  const tiers = [
    pool.filter((s) => inCategory(s) && !usedIds.has(s.id)),
    pool.filter((s) => !inCategory(s) && !usedIds.has(s.id)),
    pool.filter((s) => inCategory(s) && usedIds.has(s.id)),
    pool.filter((s) => !inCategory(s) && usedIds.has(s.id)),
  ];
  const chosen: RankingSet[] = [];
  for (const tier of tiers) {
    if (chosen.length >= target) break;
    chosen.push(...shuffled(tier, rng).slice(0, target - chosen.length));
  }

  // Avoid two neighbouring rounds of one category when the draw allows it.
  const rest = shuffled(chosen, rng);
  const ordered: RankingSet[] = rest.length ? [rest.shift() as RankingSet] : [];
  while (rest.length) {
    const last = ordered[ordered.length - 1].category;
    const at = rest.findIndex((s) => s.category !== last);
    ordered.push(...rest.splice(at >= 0 ? at : 0, 1));
  }
  return ordered.map((set) => buildRound(set, rng));
}
