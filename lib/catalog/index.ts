/**
 * The catalog barrel: one file per game/app, aggregated here and strict-parsed
 * in `lib/__tests__/catalog.test.ts` (see "Why the zod validation is NOT here
 * any more" below).
 *
 * ## Where an entry lives (redesign audit A1 step 7)
 *
 * A game or app that has a `features/<id>/` folder owns its entry:
 * `features/<id>/catalog.ts`, named by that feature's manifest `catalog` field.
 * Every other entry is still hand-kept under `lib/catalog/{games,apps}/` — the
 * single remaining list, which shrinks by one file each time a feature moves
 * (`git mv` the file to the feature, repoint the manifest, swap the import
 * line below). `lib/__tests__/feature-manifests.test.ts` fails when a manifest
 * names a catalog file that this barrel does not compose, or composes it twice,
 * and `lib/__tests__/catalog-contract.test.ts` pins the composed result.
 *
 * Why a static import list and not a generator: the manifests import zod and
 * cannot be read by client code, so a generated barrel would have to run each
 * manifest under tsx and need a freshness gate; the test above already fails in
 * both directions on drift, and the list is the same shape as
 * `server/socket-server/features.ts`. Order never depends on the list: entries
 * are sorted by `order`.
 *
 * ## Why this exists
 *
 * `lib/games.ts` (now deleted) was 408 lines of 22 inline object literals and `lib/apps.ts`
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
 * This module is also imported by `scripts/build-site-knowledge.ts` and
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

// ── Entries owned by a feature (features/<id>/catalog.ts, named by the manifest's `catalog`) ──
import altair from '@features/altair/catalog';
import doctrine from '@features/doctrine/catalog';
import dreamRift from '@features/dream-rift/catalog';
import gabrielsHorn from '@features/gabriels-horn/catalog';
import hearthworks from '@features/hearthworks/catalog';
import nightrail from '@features/nightrail/catalog';
import sliceIt from '@features/slice-it/catalog';
import synapseStorm from '@features/synapse-storm/catalog';
import voidBreaker from '@features/void-breaker/catalog';

// ── Games not yet in a feature folder ─────────────────────────────────────
import dailyPuzzles from './games/daily-puzzles';
import halfLife2 from './games/half-life-2';
import houseAlwaysWins from './games/house-always-wins';
import kowloonKnockout from './games/kowloon-knockout';
import laundrySort from './games/laundry-sort';
import neonDriftway from './games/neon-driftway';
import portal from './games/portal';
import csgo from './games/csgo';
import rmhbox from './games/rmhbox';
import templeOfJoy from './games/temple-of-joy';
import velum2099 from './games/velum2099';
import versecraft from './games/versecraft';

// ── Apps not yet in a feature folder ──────────────────────────────────────
import dunesday from './apps/dunesday';
import rmhConnections from './apps/rmh-connections';
import rmhTf2Hud from './apps/rmh-tf2-hud';
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
  // feature-owned
  altair,
  hearthworks,
  nightrail,
  sliceIt,
  voidBreaker,
  // hand-kept
  dailyPuzzles,
  dreamRift,
  gabrielsHorn,
  halfLife2,
  houseAlwaysWins,
  kowloonKnockout,
  laundrySort,
  neonDriftway,
  portal,
  csgo,
  rmhbox,
  synapseStorm,
  templeOfJoy,
  velum2099,
  versecraft,
];

const APP_MODULES: readonly AppInfo[] = [
  // feature-owned
  doctrine,
  // hand-kept
  dunesday,
  rmhConnections,
  rmhTf2Hud,
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
