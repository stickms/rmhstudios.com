/**
 * Bum's Rush — the §11.2 unlock table, and evaluating it against progress.
 *
 * There is no XP bar (§11.1): every cosmetic is earned by a specific, named
 * condition. This module is the one place that condition lives, so the
 * wardrobe screen, the merge report and the server (when it recomputes a
 * profile's owned set after a clear) all agree on what "earned" means.
 *
 * `evaluateUnlocks` is total and pure: given a progress snapshot it returns
 * exactly the cosmetics that snapshot has earned, recomputed from scratch
 * every time — never incremental, never order-dependent — which is what
 * makes it safe to call on every save without tracking "have we already
 * granted this" separately from the unlock rule itself.
 */
import type { LevelClear, Profile } from '@/lib/bums-rush/types';
import {
  ALL_COSMETIC_IDS,
  HAT_IDS,
  STARTER_COSMETICS,
  type CosmeticId,
} from '@/lib/bums-rush/cosmetics';

/** Design doc §6.6 / §20 file map: 8 worlds of 9 levels each = 72 co-op levels. */
export const LEVELS_PER_WORLD = 9;
export const WORLD_COUNT = 8;
export const CAMPAIGN_LEVEL_COUNT = LEVELS_PER_WORLD * WORLD_COUNT;
/** §11.1 — 72 levels × 3 objectives each. */
export const CAMPAIGN_OBJECTIVE_COUNT = CAMPAIGN_LEVEL_COUNT * 3;
/** §11.1 — 40 hidden parcels across the campaign. */
export const PARCEL_TOTAL = 40;

/** Every objective bit set on a 3-objective level: `0b111`. */
const ALL_OBJECTIVES_MASK = 0b111;

/** A level id is authored as `"w<world>-<index>"` (§10.2's own example: `"w3-07"`). */
const LEVEL_ID_PATTERN = /^w(\d+)-/;

export function worldOfLevel(levelId: string): number | null {
  const match = LEVEL_ID_PATTERN.exec(levelId);
  if (!match) return null;
  const world = Number(match[1]);
  return Number.isInteger(world) && world >= 1 && world <= WORLD_COUNT ? world : null;
}

/**
 * What the unlock table reads. Deliberately narrower than `Profile`: this is
 * everything a rule can key on, and nothing about *how* it got persisted —
 * the same shape works whether it was built from the client's local save or
 * from a set of `BumsRushLevelClear` rows read back off the database.
 */
export interface UnlockProgress {
  /**
   * Distinct cleared level ids, each mapped to the UNION of objective bits
   * earned across every `playerCount` that level was cleared at — a solo
   * objective and a 4-player objective are the same tick on the world map,
   * even though they are different leaderboard records (§10.5).
   */
  clearedLevels: ReadonlyMap<string, number>;
  parcelsFound: readonly string[];
  posesFound: readonly string[];
  recipesMade: readonly string[];
  levelsCleared: number;
  showdownWins: number;
  showdownLosses: number;
}

/** Build an {@link UnlockProgress} snapshot from a client `Profile`. */
export function progressFromProfile(profile: Profile): UnlockProgress {
  return {
    clearedLevels: unionClearsByLevel(Object.values(profile.clears)),
    parcelsFound: profile.parcelsFound,
    posesFound: profile.posesFound,
    recipesMade: profile.recipesMade,
    levelsCleared: profile.levelsCleared,
    showdownWins: profile.showdownWins,
    showdownLosses: profile.showdownLosses,
  };
}

/** Union objective bitmasks for the same level across its (possibly several) `playerCount` records. */
export function unionClearsByLevel(clears: Iterable<LevelClear>): Map<string, number> {
  const byLevel = new Map<string, number>();
  for (const clear of clears) {
    byLevel.set(clear.levelId, (byLevel.get(clear.levelId) ?? 0) | clear.objectives);
  }
  return byLevel;
}

function worldClearedLevelCount(progress: UnlockProgress, world: number): number {
  let count = 0;
  for (const levelId of progress.clearedLevels.keys()) {
    if (worldOfLevel(levelId) === world) count++;
  }
  return count;
}

function worldFullObjectiveCount(progress: UnlockProgress, world: number): number {
  let count = 0;
  for (const [levelId, objectives] of progress.clearedLevels) {
    if (worldOfLevel(levelId) === world && objectives === ALL_OBJECTIVES_MASK) count++;
  }
  return count;
}

function worldCleared(progress: UnlockProgress, world: number): boolean {
  return worldClearedLevelCount(progress, world) >= LEVELS_PER_WORLD;
}

function worldAllObjectives(progress: UnlockProgress, world: number): boolean {
  return worldFullObjectiveCount(progress, world) >= LEVELS_PER_WORLD;
}

function totalObjectivesCleared(progress: UnlockProgress): number {
  let total = 0;
  for (const bits of progress.clearedLevels.values()) total += popcount3(bits);
  return total;
}

/** Population count over the low 3 bits — small enough to unroll rather than loop. */
function popcount3(bits: number): number {
  return (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);
}

function campaign100(progress: UnlockProgress): boolean {
  return (
    progress.levelsCleared >= CAMPAIGN_LEVEL_COUNT &&
    totalObjectivesCleared(progress) >= CAMPAIGN_OBJECTIVE_COUNT &&
    progress.parcelsFound.length >= PARCEL_TOTAL
  );
}

/** §2.4 — the head granted by clearing each world, in world order (world 1 first). */
const WORLD_CLEAR_HEADS: readonly CosmeticId[] = [
  'staple',
  'teacup',
  'balloon',
  'helm',
  'shuriken',
  'snowball',
  'helmet',
  'speaker',
];

/** §2.5 — the 24 hats split into 8 three-hat world sets, in catalog order. */
const WORLD_HAT_SETS: readonly (readonly CosmeticId[])[] = Array.from(
  { length: WORLD_COUNT },
  (_, i) => HAT_IDS.slice(i * 3, i * 3 + 3),
);

/**
 * The 40 hidden parcels are authored per-level by the content tickets (T14),
 * so this module cannot know their real ids yet. §11.1 promises "each parcel:
 * one specific cosmetic (40 total)"; the cosmetics that §11.2 does not name
 * individually (9 of the 12 gloves, 5 of the 11 inks) are earned this way, in
 * a fixed order, one per parcel found — content authors do not need to touch
 * this file to keep that promise, only to keep authoring parcels.
 */
const PARCEL_REWARD_SEQUENCE: readonly CosmeticId[] = [
  'oven-mitt',
  'rubber-glove',
  'gauntlet',
  'ninja-tabi-hand',
  'winter-mitten',
  'gardening-glove',
  'surgical-glove',
  'catchers-mitt',
  'welding-glove',
  'pencil-grey',
  'red-correction',
  'gel-sparkle',
  'invisible-ink',
  'crayon',
];

export interface UnlockRule {
  id: string;
  description: string;
  grants: readonly CosmeticId[];
  isMet: (progress: UnlockProgress) => boolean;
}

/**
 * The §11.2 table, as data. Order does not affect the result — every rule is
 * evaluated independently and the grants are unioned — but it is kept in the
 * table's own order for anyone diffing this file against the design doc.
 */
export const UNLOCK_RULES: readonly UnlockRule[] = [
  {
    id: 'first-launch',
    description: 'First launch',
    grants: STARTER_COSMETICS,
    isMet: () => true,
  },
  ...Array.from({ length: WORLD_COUNT }, (_, i): UnlockRule => {
    const world = i + 1;
    return {
      id: `clear-world-${world}`,
      description: `Clear world ${world}`,
      grants: [WORLD_CLEAR_HEADS[i]!],
      isMet: (p) => worldCleared(p, world),
    };
  }),
  ...Array.from({ length: WORLD_COUNT }, (_, i): UnlockRule => {
    const world = i + 1;
    // World 1's all-objectives clear additionally grants the Paper Plane
    // head (§2.4 row 5) — the one row in §11.2 where a hat-set trigger also
    // carries a head.
    const grants =
      world === 1 ? [...WORLD_HAT_SETS[i]!, 'paper-plane' as CosmeticId] : WORLD_HAT_SETS[i]!;
    return {
      id: `world-${world}-all-objectives`,
      description: `All objectives in world ${world}`,
      grants,
      isMet: (p) => worldAllObjectives(p, world),
    };
  }),
  {
    id: 'recipes-12',
    description: '12 Recipes in Sizzle Street',
    grants: ['whisk'],
    isMet: (p) => p.recipesMade.length >= 12,
  },
  {
    id: 'poses-20',
    description: '20 hidden Poses',
    grants: ['lightbulb'],
    isMet: (p) => p.posesFound.length >= 20,
  },
  {
    id: 'parcels-30',
    description: '30 Parcels found',
    grants: ['inkpot'],
    isMet: (p) => p.parcelsFound.length >= 30,
  },
  {
    id: 'levels-10',
    description: '10 levels cleared',
    grants: ['sticky-note'],
    isMet: (p) => p.levelsCleared >= 10,
  },
  {
    id: 'levels-25',
    description: '25 levels cleared',
    grants: ['bubble-wrap'],
    isMet: (p) => p.levelsCleared >= 25,
  },
  {
    id: 'levels-50',
    description: '50 levels cleared',
    grants: ['highlighter-yellow'],
    isMet: (p) => p.levelsCleared >= 50,
  },
  {
    id: 'levels-72',
    description: '72 levels cleared',
    grants: ['halo'],
    isMet: (p) => p.levelsCleared >= CAMPAIGN_LEVEL_COUNT,
  },
  {
    id: 'showdown-first',
    description: 'First Showdown match',
    grants: ['boxing-glove'],
    isMet: (p) => p.showdownWins + p.showdownLosses >= 1,
  },
  {
    id: 'showdown-25-wins',
    description: '25 Showdown wins',
    grants: ['crown-bent'],
    isMet: (p) => p.showdownWins >= 25,
  },
  {
    id: 'campaign-100',
    description: '100% campaign',
    grants: ['inkblot', 'gold-ink'],
    isMet: campaign100,
  },
  ...PARCEL_REWARD_SEQUENCE.map((cosmetic, i): UnlockRule => ({
    id: `parcel-reward-${i + 1}`,
    description: `Parcel #${i + 1} found`,
    grants: [cosmetic],
    isMet: (p) => p.parcelsFound.length >= i + 1,
  })),
];

/** Every cosmetic {@link UNLOCK_RULES} can grant, across every rule. Used by the totality test. */
export const REACHABLE_COSMETIC_IDS: ReadonlySet<CosmeticId> = new Set(
  UNLOCK_RULES.flatMap((rule) => rule.grants),
);

/**
 * Every cosmetic the given progress has earned, recomputed from scratch.
 *
 * Sorted so the result is stable and diffable — two calls with equal progress
 * produce byte-identical arrays, which is what makes "what's new" a plain set
 * difference rather than something that has to track insertion order.
 */
export function evaluateUnlocks(progress: UnlockProgress): CosmeticId[] {
  const unlocked = new Set<CosmeticId>();
  for (const rule of UNLOCK_RULES) {
    if (rule.isMet(progress)) for (const id of rule.grants) unlocked.add(id);
  }
  return [...unlocked].sort();
}

/** The subset of {@link evaluateUnlocks}'s result that `previouslyOwned` did not already have — what a toast should announce. */
export function newlyUnlocked(
  previouslyOwned: readonly string[],
  progress: UnlockProgress,
): CosmeticId[] {
  const owned = new Set(previouslyOwned);
  return evaluateUnlocks(progress).filter((id) => !owned.has(id));
}

// Re-exported so callers evaluating unlocks don't need a second import for
// "is this actually a real cosmetic" — see `cosmetics.ts` for the source.
export { ALL_COSMETIC_IDS };
