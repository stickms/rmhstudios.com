/**
 * Bum's Rush — the level manifest: schema, parsing, and the small helpers
 * that read it (solo-viable filtering, next/prev level, world completion).
 *
 * The manifest (`data/bums-rush/levels/index.json`) is deliberately small —
 * ids, names, `minPlayers`, par times, and (for arenas) supported Showdown
 * round types, nothing else — so it can ship in the initial bundle and the
 * world map can render before any per-world level JSON has been fetched
 * (design doc §6.1). It is validated the same way `levels/schema.ts` validates
 * a level: a strict zod schema, parsed once at load, unknown keys rejected.
 */

import { z } from 'zod';
import type { LevelManifest, LevelManifestEntry, ShowdownRoundKind, WorldManifestEntry } from '../types';

export const showdownRoundKindSchema = z.enum(['race', 'survive', 'handle']);

/**
 * `id`/`name` intentionally reuse the same shapes as `levels/schema.ts`
 * (`levelIdSchema`/`levelNameKeySchema` there are not exported — small enough
 * to restate here, and this file is not allowed to import from `schema.ts`'s
 * private internals). A manifest entry that doesn't match its level file's
 * own `id`/`name` is exactly the kind of drift `loader.ts` cross-checks.
 */
const manifestIdSchema = z
  .string()
  .regex(/^w[1-8]-(\d{2}|[a-g])$/, 'id must look like "w3-07" (campaign) or "w1-a" (showdown)');

const manifestLevelNameSchema = z
  .string()
  .regex(
    /^bums\.(level|showdown)\.[a-z0-9-]+\.name$/,
    'name must be an i18n key, not display text (§15)',
  );

/** §15: world names are keys too — a separate pattern from level/arena names
 *  (`bums.world.w1.name`, not `bums.level.*`/`bums.showdown.*`). */
const manifestWorldNameSchema = z
  .string()
  .regex(/^bums\.world\.w[1-8]\.name$/, 'world name must be an i18n key, not display text (§15)');

export const levelManifestEntrySchema = z.strictObject({
  id: manifestIdSchema,
  world: z.number().int().min(1).max(8),
  index: z.number().int().min(1),
  name: manifestLevelNameSchema,
  minPlayers: z.number().int().min(1).max(4),
  parSeconds: z.number().positive(),
  // Showdown arenas carry the round types they support (§8.2); campaign
  // levels omit this entirely rather than shipping `[]`.
  showdownRounds: z.array(showdownRoundKindSchema).min(1).optional(),
});

export const worldManifestEntrySchema = z.strictObject({
  world: z.number().int().min(1).max(8),
  name: manifestWorldNameSchema,
  levels: z.array(levelManifestEntrySchema).min(1),
});

export const levelManifestSchema = z.strictObject({
  version: z.literal(1),
  worlds: z.array(worldManifestEntrySchema),
  showdown: z.array(levelManifestEntrySchema),
});

// ─── Compile-time drift guards (see schema.ts for the pattern and why) ──────

const _entryShapeCheck: LevelManifestEntry = {} as z.infer<typeof levelManifestEntrySchema>;
const _worldShapeCheck: WorldManifestEntry = {} as z.infer<typeof worldManifestEntrySchema>;
const _manifestShapeCheck: LevelManifest = {} as z.infer<typeof levelManifestSchema>;
const _roundKindShapeCheck: ShowdownRoundKind = {} as z.infer<typeof showdownRoundKindSchema>;
void _entryShapeCheck;
void _worldShapeCheck;
void _manifestShapeCheck;
void _roundKindShapeCheck;

/** Parses `index.json`'s contents. Throws with a labeled cause on failure —
 *  a malformed manifest must fail loudly, not render an empty world map. */
export function parseLevelManifest(data: unknown): LevelManifest {
  try {
    return levelManifestSchema.parse(data);
  } catch (cause) {
    throw new Error('Invalid Bum\'s Rush level manifest (data/bums-rush/levels/index.json)', {
      cause,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Every campaign entry across all worlds, in manifest order. */
function allCampaignEntries(manifest: LevelManifest): LevelManifestEntry[] {
  return manifest.worlds.flatMap((w) => w.levels);
}

/** §6.7: `minPlayers: 1` is the solo-viable contract — the split the Solo
 *  Ladder and the "needs 2 - find someone" card (§0.2) both key off. */
export function isSoloViable(entry: LevelManifestEntry): boolean {
  return entry.minPlayers === 1;
}

/** Solo-viable campaign levels, optionally narrowed to one world. */
export function soloViableLevels(manifest: LevelManifest, world?: number): LevelManifestEntry[] {
  const entries = allCampaignEntries(manifest);
  return entries.filter((e) => isSoloViable(e) && (world === undefined || e.world === world));
}

/** Look up a manifest entry by id across both campaign worlds and Showdown. */
export function findLevelEntry(manifest: LevelManifest, id: string): LevelManifestEntry | undefined {
  return allCampaignEntries(manifest).find((e) => e.id === id) ?? manifest.showdown.find((e) => e.id === id);
}

/**
 * The next campaign level after `currentId`: the following index within the
 * same world, or index 1 of the next world if `currentId` was that world's
 * last level, or `null` at the end of the campaign. Showdown arenas have no
 * ordering (a match draws from the pool per §8.1), so this only walks
 * `manifest.worlds`.
 */
export function nextLevel(manifest: LevelManifest, currentId: string): LevelManifestEntry | null {
  const worldIndex = manifest.worlds.findIndex((w) => w.levels.some((l) => l.id === currentId));
  if (worldIndex === -1) return null;
  const world = manifest.worlds[worldIndex];
  const levelIndex = world.levels.findIndex((l) => l.id === currentId);
  if (levelIndex < world.levels.length - 1) return world.levels[levelIndex + 1];

  const nextWorld = manifest.worlds[worldIndex + 1];
  return nextWorld?.levels[0] ?? null;
}

/** Symmetric with `nextLevel`: the previous level in-world, or the last
 *  level of the previous world, or `null` at the start of the campaign. */
export function prevLevel(manifest: LevelManifest, currentId: string): LevelManifestEntry | null {
  const worldIndex = manifest.worlds.findIndex((w) => w.levels.some((l) => l.id === currentId));
  if (worldIndex === -1) return null;
  const world = manifest.worlds[worldIndex];
  const levelIndex = world.levels.findIndex((l) => l.id === currentId);
  if (levelIndex > 0) return world.levels[levelIndex - 1];

  const prevWorld = manifest.worlds[worldIndex - 1];
  if (!prevWorld) return null;
  return prevWorld.levels[prevWorld.levels.length - 1] ?? null;
}

export interface WorldCompletion {
  world: number;
  total: number;
  cleared: number;
  /** 0..100, unrounded — callers format for display. */
  percent: number;
  complete: boolean;
}

/** World-map completion maths: how many of a world's levels are in the
 *  caller's cleared set. Takes the cleared-id set rather than a save object
 *  so this file stays free of the save format (`progress/save.ts`, a
 *  different ticket) — it only needs to count. */
export function worldCompletion(
  manifest: LevelManifest,
  world: number,
  clearedIds: ReadonlySet<string> | readonly string[],
): WorldCompletion {
  const cleared = clearedIds instanceof Set ? clearedIds : new Set(clearedIds);
  const worldEntry = manifest.worlds.find((w) => w.world === world);
  const levels = worldEntry?.levels ?? [];
  const clearedCount = levels.filter((l) => cleared.has(l.id)).length;
  const total = levels.length;
  return {
    world,
    total,
    cleared: clearedCount,
    percent: total === 0 ? 0 : (clearedCount / total) * 100,
    complete: total > 0 && clearedCount === total,
  };
}
