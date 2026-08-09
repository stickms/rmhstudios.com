/**
 * Bum's Rush — the §10.4 merge policy, as a pure function.
 *
 * This is the part of the save system that must not be wrong: get it wrong
 * and a player who played offline for a week, then signed in, loses either
 * the week or the account's history. So this module does the opposite of
 * `lib/game-saves/conflict.ts`'s `chooseSave` — it never picks a side and
 * discards the other. Every field below is a genuine combination of both
 * inputs, not a winner:
 *
 * | Field                                   | Rule                                                          |
 * | ---------------------------------------- | -------------------------------------------------------------- |
 * | `unlockedCosmetics`/`parcelsFound`/`posesFound`/`recipesMade` | union            |
 * | per-level clears                         | best time wins; objectives union; `assisted` true only if BOTH were |
 * | `deaths`/`metresSwung`/per-record `clears` count | max of the two, capped at a plausible bound (see below) |
 * | `levelsCleared`                          | **recomputed** from the merged clears (see below — not summed)  |
 * | `settings` (and equipped `cosmetics`)    | whichever side has the later `updatedAt`; remote on a tie       |
 * | `showdownRating`/`showdownWins`/`showdownLosses` | remote always wins (guests have no rating)             |
 *
 * `levelsCleared` deliberately does not follow the counter rule its
 * neighbours do: it is a count of *distinct* levels, and combining two sides
 * that agree on nine of their ten cleared levels by any per-field arithmetic
 * would report the wrong number either way. It is recomputed from the merged
 * `clears` map instead, which cannot double-count by construction.
 *
 * **Why `max` and not `sum` for the lifetime counters, despite §10.4 saying
 * "sum":** a plain sum is not idempotent. `local` and `remote` share no
 * baseline this module can see — nothing here can tell "two genuinely
 * disjoint histories" apart from "the same history read back twice" (a
 * signed-in player's local mirror after a routine save, a duplicate sign-in
 * event, a retried merge). Summing the second case doubles every lifetime
 * counter on every re-run; `max` does not, because it is idempotent,
 * commutative and associative with no baseline required — the merge property
 * this module is explicitly required to have (see `mergeProfiles`'s doc and
 * `__tests__/save-merge.test.ts`). The cost is an undercount in the genuine
 * first-sign-in case where a guest's device and the account both recorded
 * real, disjoint deaths — an inaccurate stat, never a lost record (nothing
 * here is a leaderboard time or an owned cosmetic), which is the right side
 * of that trade.
 *
 * The whole function is pure and side-effect free — no clock read, no
 * network, no storage — which is what makes {@link mergeProfiles} safe to run
 * twice on the same pair and get the same answer (idempotency, unit-tested in
 * `__tests__/save-merge.test.ts`).
 */
import type { Cosmetics, GameSettings, LevelClear, Profile } from '@/lib/bums-rush/types';

/** Plausible ceiling for a lifetime counter — generous, but finite, so a corrupt save cannot poison the result. */
const MAX_DEATHS = 5_000_000;
const MAX_METRES_SWUNG = 50_000_000;
/** A single level replayed this many times is already absurd; it exists to stop overflow, not to be hit. */
const MAX_CLEARS_PER_RECORD = 100_000;

export type SaveSide = 'local' | 'remote';

/** The stable key a per-level clear is merged under — a level id alone is not unique (§10.5: playerCount matters). */
export function clearKey(levelId: string, playerCount: number): string {
  return `${levelId}:${playerCount}`;
}

/** A toast-able account of what the merge did, so the UI can say what happened instead of merging silently. */
export interface MergeReport {
  settings: {
    source: SaveSide;
    localUpdatedAt: number;
    remoteUpdatedAt: number;
  };
  /** The equipped look (`Profile.cosmetics`) follows the same recency rule as `settings` — see the module doc. */
  cosmeticsEquipped: { source: SaveSide };
  /** How many entries the merge restored beyond what the local copy alone already had. */
  gained: {
    unlockedCosmetics: number;
    parcelsFound: number;
    posesFound: number;
    recipesMade: number;
    /** Level-clear records where the merge kept a strictly better time, or added a record local did not have. */
    improvedClears: number;
  };
  showdownRatingSource: 'remote';
}

export interface MergeResult {
  merged: Profile;
  report: MergeReport;
}

function unionSorted(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

function clamp(value: number, max: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(safe, 0), max);
}

/** The §10.4 per-level rule, applied to one `(levelId, playerCount)` pair. `a`/`b` are interchangeable — the merge is commutative. */
function mergeClear(a: LevelClear, b: LevelClear): LevelClear {
  return {
    levelId: a.levelId,
    playerCount: a.playerCount,
    bestMs: Math.min(a.bestMs, b.bestMs),
    objectives: a.objectives | b.objectives,
    assisted: a.assisted && b.assisted,
    // Not named in §10.4's table explicitly. Same counter shape as
    // `deaths`/`metresSwung` below, so it follows the same `max` rule and the
    // same idempotency reasoning — see the module doc.
    clears: clamp(Math.max(a.clears, b.clears), MAX_CLEARS_PER_RECORD),
  };
}

function mergeClears(
  local: Record<string, LevelClear>,
  remote: Record<string, LevelClear>,
): { clears: Record<string, LevelClear>; improved: number } {
  const merged: Record<string, LevelClear> = {};
  let improved = 0;
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const a = local[key];
    const b = remote[key];
    if (a && b) {
      const combined = mergeClear(a, b);
      merged[key] = combined;
      if (combined.bestMs < a.bestMs || combined.objectives !== a.objectives) improved++;
    } else {
      // Only one side has this record — it is, by definition, better than the
      // "no record" the other side has, so it survives untouched.
      merged[key] = (a ?? b)!;
      improved++;
    }
  }
  return { clears: merged, improved };
}

/** Recount `levelsCleared` from a clears map — distinct level ids, not distinct records (§10.5: a solo and a 4p clear of the same level are one level, two records). Exported for `save.ts`/`save.server.ts`, which recompute this outside a merge too (after a single new clear, not just after reconciling two histories). */
export function distinctLevelsCleared(clears: Record<string, LevelClear>): number {
  return new Set(Object.values(clears).map((c) => c.levelId)).size;
}

/** `settings`/equipped `cosmetics`: the side modified more recently wins; a tie goes to remote (§10.4's literal wording). */
function pickByRecency<T>(
  local: T,
  remote: T,
  localAt: number,
  remoteAt: number,
): { value: T; source: SaveSide } {
  return localAt > remoteAt
    ? { value: local, source: 'local' }
    : { value: remote, source: 'remote' };
}

/**
 * Merge a locally-played save with the account's save from the cloud.
 *
 * Order of the two arguments does not change the result for any field except
 * `settings`/`cosmetics` (which read `local`/`remote`'s own `updatedAt`, by
 * design — see the module doc) — every other field is a symmetric union, min,
 * or max. Safe to call with `local === remote` (returns an equivalent
 * profile) and safe to call twice on the same pair (idempotent) — both are
 * asserted in the test suite.
 */
export function mergeProfiles(local: Profile, remote: Profile): MergeResult {
  const unlockedCosmetics = unionSorted(local.unlockedCosmetics, remote.unlockedCosmetics);
  const parcelsFound = unionSorted(local.parcelsFound, remote.parcelsFound);
  const posesFound = unionSorted(local.posesFound, remote.posesFound);
  const recipesMade = unionSorted(local.recipesMade, remote.recipesMade);
  const { clears, improved } = mergeClears(local.clears, remote.clears);

  const settingsPick = pickByRecency<GameSettings>(
    local.settings,
    remote.settings,
    local.updatedAt,
    remote.updatedAt,
  );
  const cosmeticsPick = pickByRecency<Cosmetics>(
    local.cosmetics,
    remote.cosmetics,
    local.updatedAt,
    remote.updatedAt,
  );

  const merged: Profile = {
    cosmetics: cosmeticsPick.value,
    unlockedCosmetics,
    parcelsFound,
    posesFound,
    recipesMade,
    clears,
    levelsCleared: distinctLevelsCleared(clears),
    deaths: clamp(Math.max(local.deaths, remote.deaths), MAX_DEATHS),
    metresSwung: clamp(Math.max(local.metresSwung, remote.metresSwung), MAX_METRES_SWUNG),
    // Guests have no rating (§10.4) — remote is always the account of record.
    showdownRating: remote.showdownRating,
    showdownWins: remote.showdownWins,
    showdownLosses: remote.showdownLosses,
    settings: settingsPick.value,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };

  const report: MergeReport = {
    settings: {
      source: settingsPick.source,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt,
    },
    cosmeticsEquipped: { source: cosmeticsPick.source },
    gained: {
      unlockedCosmetics: Math.max(0, unlockedCosmetics.length - local.unlockedCosmetics.length),
      parcelsFound: Math.max(0, parcelsFound.length - local.parcelsFound.length),
      posesFound: Math.max(0, posesFound.length - local.posesFound.length),
      recipesMade: Math.max(0, recipesMade.length - local.recipesMade.length),
      improvedClears: improved,
    },
    showdownRatingSource: 'remote',
  };

  return { merged, report };
}
