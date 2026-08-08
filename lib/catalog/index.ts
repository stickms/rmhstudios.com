/**
 * The catalog barrel: one file per game/app, aggregated and validated here.
 *
 * ## Why this exists
 *
 * `lib/games.ts` was 408 lines of 22 inline object literals and `lib/apps.ts`
 * 238 lines of 12. Every feature that touched a game edited the same file, so
 * they were the repo's most reliable merge-conflict source — and every new
 * cross-cutting field (capabilities, per-game SEO data, registry entries)
 * widened the monolith further. One file per entry means two branches adding
 * two games no longer collide, and a game's data sits next to nothing but
 * itself.
 *
 * ## Why static imports and not `import.meta.glob`
 *
 * The obvious barrel is `import.meta.glob('./games/*.ts', { eager: true })`,
 * and it is wrong here. `import.meta.glob` is a **Vite transform**, not a
 * language feature: it exists only when Vite compiles the module. But
 * `lib/games.ts` is also imported by `scripts/build-site-knowledge.ts` and
 * `scripts/generate-site-reference.ts`, which run under `tsx` (plain Node, no
 * Vite), and by the esbuild-bundled server entrypoints. Under any of those the
 * glob call is left in place and the catalog resolves to an empty list — the
 * generators would silently emit a site reference with zero games in it.
 *
 * So the entry list below is explicit. It costs one import line per new entry
 * (kept alphabetical, so additions append rather than interleave) and buys the
 * same module graph in every runtime that reads the catalog.
 *
 * ## Why zod at module load
 *
 * These entries are hand-written data. Validating them the moment the module is
 * first imported means a typo'd key or a missing field fails immediately — in
 * dev, in the test run, and in the build — instead of rendering as a blank card
 * in production. The cost is one strict parse of 34 small objects, once per
 * process. See `lib/catalog/types.ts` for the schemas.
 */

import { appEntrySchema, gameEntrySchema, type AppInfo, type GameInfo } from './types';

// ── Games ─────────────────────────────────────────────────────────────────
import altair from './games/altair';
import bumsRush from './games/bums-rush';
import cookgame from './games/cookgame';
import dailyPuzzles from './games/daily-puzzles';
import dreamRift from './games/dream-rift';
import forestExplorer from './games/forest-explorer';
import gabrielsHorn from './games/gabriels-horn';
import houseAlwaysWins from './games/house-always-wins';
import isleworks from './games/isleworks';
import kowloonKnockout from './games/kowloon-knockout';
import laundrySort from './games/laundry-sort';
import massiveMarch from './games/massive-march';
import neonDriftway from './games/neon-driftway';
import nightrail from './games/nightrail';
import rmhFarmingSim from './games/rmh-farming-sim';
import rmhbox from './games/rmhbox';
import rochesterOffensive from './games/rochester-offensive';
import sliceIt from './games/slice-it';
import synapseStorm from './games/synapse-storm';
import templeOfJoy from './games/temple-of-joy';
import velum2099 from './games/velum2099';
import versecraft from './games/versecraft';
import voidBreaker from './games/void-breaker';

// ── Apps ──────────────────────────────────────────────────────────────────
import rmhConnections from './apps/rmh-connections';
import rmhStrategies from './apps/rmh-strategies';
import rmhcalculator from './apps/rmhcalculator';
import rmhcode from './apps/rmhcode';
import rmhdle from './apps/rmhdle';
import rmhhomes from './apps/rmhhomes';
import rmhladder from './apps/rmhladder';
import rmhmusic from './apps/rmhmusic';
import rmhstudy from './apps/rmhstudy';
import rmhtube from './apps/rmhtube';
import rmhtype from './apps/rmhtype';
import studio from './apps/studio';

const GAME_MODULES: readonly unknown[] = [
  altair,
  bumsRush,
  cookgame,
  dailyPuzzles,
  dreamRift,
  forestExplorer,
  gabrielsHorn,
  houseAlwaysWins,
  isleworks,
  kowloonKnockout,
  laundrySort,
  massiveMarch,
  neonDriftway,
  nightrail,
  rmhFarmingSim,
  rmhbox,
  rochesterOffensive,
  sliceIt,
  synapseStorm,
  templeOfJoy,
  velum2099,
  versecraft,
  voidBreaker,
];

const APP_MODULES: readonly unknown[] = [
  rmhConnections,
  rmhStrategies,
  rmhcalculator,
  rmhcode,
  rmhdle,
  rmhhomes,
  rmhladder,
  rmhmusic,
  rmhstudy,
  rmhtube,
  rmhtype,
  studio,
];

/**
 * Parses every entry, then sorts by `order`.
 *
 * Two ids sharing an `order` would make the catalog order depend on the import
 * list — the thing this split is trying to stop being load-bearing — so a
 * collision is rejected outright rather than tie-broken silently.
 */
function buildCatalog<T extends { id: string; order: number }>(
  modules: readonly unknown[],
  parse: (value: unknown) => T,
  label: string,
): T[] {
  const entries = modules.map((mod, i) => {
    try {
      return parse(mod);
    } catch (cause) {
      throw new Error(`Invalid ${label} catalog entry at position ${i}: ${String(cause)}`, {
        cause,
      });
    }
  });

  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) throw new Error(`Duplicate ${label} catalog id: ${entry.id}`);
    if (seenOrders.has(entry.order)) {
      throw new Error(`Duplicate ${label} catalog order ${entry.order} on ${entry.id}`);
    }
    seenIds.add(entry.id);
    seenOrders.add(entry.order);
  }

  return entries.sort((a, b) => a.order - b.order);
}

/** Single source of truth for all games displayed on the site. */
export const games: GameInfo[] = buildCatalog(
  GAME_MODULES,
  (value) => gameEntrySchema.parse(value),
  'game',
);

/** Single source of truth for all apps displayed on the site. */
export const apps: AppInfo[] = buildCatalog(
  APP_MODULES,
  (value) => appEntrySchema.parse(value),
  'app',
);

export type { AppInfo, GameInfo };
