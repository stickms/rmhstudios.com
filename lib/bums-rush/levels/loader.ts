/**
 * Bum's Rush — the level loader: fetch, parse, validate, cache.
 *
 * Levels are lazily fetched **per world** (design doc §6.1): each campaign
 * level and each Showdown arena is its own JSON file under
 * `data/bums-rush/levels/`, and this file loads them via plain `import()`
 * with the path written inline as a template literal at each call site. That
 * is deliberately **not** `import.meta.glob` (see `lib/catalog/index.ts` for
 * why that construct is wrong for a module that might run outside Vite) —
 * this is a standard dynamic `import()`, which Vite still statically
 * analyzes and code-splits (one chunk per matched file) but which also
 * degrades to an ordinary runtime import anywhere else, the same pattern
 * `lib/emoji/shortcodes.ts` and `lib/library/library.ts` already use for
 * lazy/static JSON. The practical effect is the one §6.1 asks for: opening
 * World 1 does not pull Worlds 2-8's JSON over the wire.
 *
 * The manifest is the one exception — it is a static top-level import (ships
 * in the initial bundle, per §6.1) parsed once at module load, in the same
 * "fail immediately, not in production" spirit as `lib/catalog/index.ts`.
 */

import rawManifest from '../../../data/bums-rush/levels/index.json';
import { levelSchema } from './schema';
import { parseLevelManifest } from './manifest';
import { validateLevel } from './validate';
import type { Level, LevelManifest } from '../types';

const CAMPAIGN_ID_RE = /^w[1-8]-\d{2}$/;
const SHOWDOWN_ID_RE = /^w[1-8]-[a-g]$/;
const WORLD_FROM_ID_RE = /^w([1-8])-/;

function isCampaignId(id: string): boolean {
  return CAMPAIGN_ID_RE.test(id);
}

function isShowdownId(id: string): boolean {
  return SHOWDOWN_ID_RE.test(id);
}

function worldNumberFromId(id: string): number {
  const match = WORLD_FROM_ID_RE.exec(id);
  if (!match) throw new Error(`Not a valid Bum's Rush level id: "${id}"`);
  return Number(match[1]);
}

/** Resolves and parses the raw JSON module for a single level/arena id. The
 *  two branches are separate `import()` call sites on purpose — each one is
 *  a distinct, statically-analyzable pattern for Vite to glob and chunk. */
async function importLevelRaw(id: string): Promise<unknown> {
  if (isCampaignId(id)) {
    const world = worldNumberFromId(id);
    const mod = (await import(`../../../data/bums-rush/levels/w${world}/${id}.json`)) as {
      default: unknown;
    };
    return mod.default;
  }
  if (isShowdownId(id)) {
    const mod = (await import(`../../../data/bums-rush/levels/showdown/${id}.json`)) as {
      default: unknown;
    };
    return mod.default;
  }
  throw new Error(`Not a valid Bum's Rush level id: "${id}"`);
}

function parseAndValidate(id: string, raw: unknown): Level {
  let level: Level;
  try {
    level = levelSchema.parse(raw);
  } catch (cause) {
    throw new Error(`Level "${id}" failed schema validation`, { cause });
  }
  // Throws its own aggregated, human-readable message on failure (validate.ts).
  validateLevel(level);
  return level;
}

// ─── Manifest (eager — ships in the initial bundle, §6.1) ──────────────────

const manifestCache: LevelManifest = parseLevelManifest(rawManifest);

/** Reads `data/bums-rush/levels/index.json`. Already parsed at module load
 *  (see `manifestCache`); this stays `async` so callers don't need to know
 *  that — and so a future move to a real fetch is not a signature change. */
export function loadManifest(): Promise<LevelManifest> {
  return Promise.resolve(manifestCache);
}

// ─── Per-level / per-world loading, with an in-memory cache ────────────────

const levelCache = new Map<string, Level>();
const levelPending = new Map<string, Promise<Level>>();
const worldCache = new Map<number, Level[]>();
const worldPending = new Map<number, Promise<Level[]>>();

/** Shared cache/fetch machinery for both campaign levels and Showdown
 *  arenas — their ids never collide (two digits vs. one letter), so one
 *  cache keyed by id is enough; `loadLevel`/`loadShowdownArena` only differ
 *  in which id shape they accept, for a clearer error at the call site. */
function loadById(id: string): Promise<Level> {
  const cached = levelCache.get(id);
  if (cached) return Promise.resolve(cached);

  let pending = levelPending.get(id);
  if (!pending) {
    pending = importLevelRaw(id)
      .then((raw) => parseAndValidate(id, raw))
      .then((level) => {
        levelCache.set(id, level);
        return level;
      })
      .finally(() => levelPending.delete(id));
    levelPending.set(id, pending);
  }
  return pending;
}

/** Loads (and validates) a single campaign level by id, e.g. `"w1-01"`. */
export function loadLevel(id: string): Promise<Level> {
  if (!isCampaignId(id)) {
    throw new Error(`"${id}" is not a campaign level id (expected "w<world>-<01-99>")`);
  }
  return loadById(id);
}

/** Loads (and validates) a single Showdown arena by id, e.g. `"w1-a"`. */
export function loadShowdownArena(id: string): Promise<Level> {
  if (!isShowdownId(id)) {
    throw new Error(`"${id}" is not a Showdown arena id (expected "w<world>-<a-g>")`);
  }
  return loadById(id);
}

/**
 * Loads every campaign level in a world, sorted by `index`. This is the
 * per-world bundle the world map/campaign screen drives from — the manifest
 * (already in the initial bundle) says which ids belong to the world, and
 * each one is fetched exactly once regardless of how many callers ask.
 */
export function loadWorld(world: number): Promise<Level[]> {
  const cached = worldCache.get(world);
  if (cached) return Promise.resolve(cached);

  let pending = worldPending.get(world);
  if (!pending) {
    pending = (async () => {
      const manifest = await loadManifest();
      const worldEntry = manifest.worlds.find((w) => w.world === world);
      if (!worldEntry) throw new Error(`No world ${world} in the level manifest`);

      const levels = await Promise.all(worldEntry.levels.map((entry) => loadLevel(entry.id)));
      const sorted = [...levels].sort((a, b) => a.index - b.index);
      worldCache.set(world, sorted);
      return sorted;
    })().finally(() => worldPending.delete(world));
    worldPending.set(world, pending);
  }
  return pending;
}

/** Forgets every cached level/world. Not needed in production (the JSON is
 *  static and versioned by deploy), but the level editor (§6.5) and tests
 *  reload the same id repeatedly and need a way back to a clean slate. */
export function clearLevelCache(): void {
  levelCache.clear();
  levelPending.clear();
  worldCache.clear();
  worldPending.clear();
}
