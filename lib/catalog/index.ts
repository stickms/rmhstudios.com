/**
 * The catalog barrel: one file per game/app, aggregated here and strict-parsed
 * in `lib/__tests__/catalog.test.ts` (see "Why the zod validation is NOT here
 * any more" below).
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
 * ## Why the zod validation is NOT here any more
 *
 * These entries are hand-written data, so they are strict-parsed against the
 * schemas in `lib/catalog/types.ts` — but in `lib/__tests__/catalog.test.ts`,
 * not at module load. The parse used to run here, and the cost of that decision
 * was paid by the wrong party:
 *
 *   * This module is imported by `components/Providers.tsx`, i.e. by every page.
 *     Importing the schemas pulled **zod (71 KB raw) onto the shared critical
 *     path of the entire site**, and module-scope `z.object(...)` calls are not
 *     tree-shakeable, so no amount of "the parse never runs in production" would
 *     have removed it.
 *   * The parse itself then ran 34 strict `.parse()` calls **in the browser, on
 *     every cold page load**, to re-check data that had already been checked in
 *     CI and cannot change at runtime.
 *
 * The validation is not weaker for moving: the test parses every entry with the
 * same schemas (and now sees the RAW module objects rather than already-parsed
 * output), `pnpm test` is in the commit gate and in `web-ci`, and each entry
 * file is additionally annotated `const entry: GameInfo`, so TypeScript's excess
 * property checking rejects a typo'd key at compile time too. What is gone is
 * only the third copy of the check — the one that ran on visitors' phones.
 *
 * The cross-entry invariants that are *cheap* (duplicate id, duplicate order)
 * stay below: they are plain comparisons, they need no schema, and they are the
 * ones whose failure mode is silent reordering rather than a loud parse error.
 */

import type { AppInfo, GameInfo } from './types';

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

const GAME_MODULES: readonly GameInfo[] = [
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

const APP_MODULES: readonly AppInfo[] = [
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
 * Sorts by `order`, rejecting the two collisions that would otherwise be silent.
 *
 * Two ids sharing an `order` would make the catalog order depend on the import
 * list — the thing this split is trying to stop being load-bearing — so a
 * collision is rejected outright rather than tie-broken silently. Both checks
 * are plain comparisons over 34 objects: no schema, no zod, nothing that ends up
 * in a client bundle.
 */
function buildCatalog<T extends { id: string; order: number }>(
  entries: readonly T[],
  label: string,
): T[] {
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

  return [...entries].sort((a, b) => a.order - b.order);
}

/** Single source of truth for all games displayed on the site. */
export const games: GameInfo[] = buildCatalog(GAME_MODULES, 'game');

/** Single source of truth for all apps displayed on the site. */
export const apps: AppInfo[] = buildCatalog(APP_MODULES, 'app');

export type { AppInfo, GameInfo };
