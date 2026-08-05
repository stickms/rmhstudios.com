/**
 * Speedrun categories — the shared vocabulary (design K1).
 *
 * Client-safe: the page, the components, the API routes and the verifier all
 * import these, so there is exactly one spelling of a status, a metric and a
 * rejection reason. Nothing here touches Prisma.
 *
 * The DB columns are plain `VarChar`s rather than enums (see
 * `prisma/schema.prisma` → `SpeedrunCategory` / `SpeedrunEntry`), so these
 * unions are the only place the allowed values are written down. Parse into
 * them at the boundary — {@link toSpeedrunStatus} — instead of casting.
 */

/** How a category ranks its runs. */
export type SpeedrunMetric =
  /** Fastest wall-clock run wins. `timeMs` is the sort key. */
  | 'time'
  /** Highest score wins, with the run's time kept as the tie-break. */
  | 'score';

export const SPEEDRUN_METRICS: readonly SpeedrunMetric[] = ['time', 'score'] as const;

/** Lifecycle of a submitted run. */
export type SpeedrunStatus = 'pending' | 'verified' | 'rejected';

export const SPEEDRUN_STATUSES: readonly SpeedrunStatus[] = [
  'pending',
  'verified',
  'rejected',
] as const;

export function isSpeedrunStatus(value: unknown): value is SpeedrunStatus {
  return typeof value === 'string' && (SPEEDRUN_STATUSES as readonly string[]).includes(value);
}

/** Narrow a raw DB string, defaulting to the safest value rather than throwing. */
export function toSpeedrunStatus(value: string): SpeedrunStatus {
  return isSpeedrunStatus(value) ? value : 'pending';
}

export function toSpeedrunMetric(value: string): SpeedrunMetric {
  return value === 'score' ? 'score' : 'time';
}

/**
 * How much a verifier's verdict is actually worth.
 *
 * This exists because "verified" is a promise, and a leaderboard that makes the
 * same promise for a re-simulated run and for a self-reported log is lying about
 * one of them. Each registry entry declares its tier and the UI shows it, so a
 * player can tell which board is proof and which is trust.
 */
export type VerificationTier =
  /**
   * The run is re-derived from `(seed, inputs)` through the game's own headless
   * logic and the final state is checked against the claim. A forged log either
   * fails to simulate or produces a different result — there is nothing to
   * trust. Auto-verified or auto-rejected, never queued.
   */
  | 'deterministic'
  /**
   * The stored log is checked for internal consistency against everything the
   * server CAN re-derive (the seed's schedule, monotonic timestamps, the scoring
   * rule) and the score is recomputed from it. This catches every impossible
   * claim but cannot prove a *plausible* fabricated log, so a pass lands in the
   * manual queue rather than being called verified.
   */
  | 'consistency'
  /**
   * No headless logic to run. The entry queues for human review. Declared, not
   * silently defaulted, so "we can't check this" is visible in the registry.
   */
  | 'manual';

/** Why a run was rejected, or why it could not be judged automatically. */
export type SpeedrunRejection =
  /** The replay's `data` does not match the game's payload schema. */
  | 'INVALID_REPLAY'
  /** Re-simulation ran but the run is not a legal/complete one. */
  | 'SIMULATION_FAILED'
  /** Re-simulation produced a different score than the run claims. */
  | 'SCORE_MISMATCH'
  /** The claimed time is impossible for the inputs in the log. */
  | 'TIME_IMPLAUSIBLE'
  /** The replay was recorded on a version this verifier does not understand. */
  | 'VERSION_UNSUPPORTED'
  /** The game has no automatic verifier (tier `manual`). */
  | 'NO_VERIFIER'
  /** The verifier passed, but its tier is not strong enough to auto-verify. */
  | 'NEEDS_REVIEW';

/** English reason strings; callers translate. Mirrors `rejectionMessage` in `lib/game/registry.ts`. */
export function speedrunRejectionMessage(reason: SpeedrunRejection): string {
  switch (reason) {
    case 'INVALID_REPLAY':
      return 'The replay payload is not a valid recording for this game.';
    case 'SIMULATION_FAILED':
      return 'Re-simulating the inputs did not produce a completed run.';
    case 'SCORE_MISMATCH':
      return 'The re-simulated result does not match the submitted result.';
    case 'TIME_IMPLAUSIBLE':
      return 'The claimed time is not achievable for the inputs in this replay.';
    case 'VERSION_UNSUPPORTED':
      return 'This replay was recorded on a game version the verifier cannot run.';
    case 'NO_VERIFIER':
      return 'This game has no automatic verifier — queued for review.';
    case 'NEEDS_REVIEW':
      return 'Consistent, but this game can only be checked for consistency — queued for review.';
    default:
      return 'Run rejected.';
  }
}

/* -------------------------------------------------------------------------- */
/* Serialized views (what the API returns and the UI renders)                  */
/* -------------------------------------------------------------------------- */

export interface SpeedrunCategoryView {
  id: string;
  game: string;
  slug: string;
  name: string;
  rules: string;
  metric: SpeedrunMetric;
  /** Game logic version this category's board is for. */
  version: string;
  active: boolean;
  /** How runs on this category's game can be checked, from the verifier registry. */
  tier: VerificationTier;
}

export interface SpeedrunEntryView {
  id: string;
  categoryId: string;
  /** The version of the category this run was accepted onto — the board label. */
  version: string;
  replayId: string;
  timeMs: number;
  score: number | null;
  status: SpeedrunStatus;
  rejectReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
  runner: {
    id: string;
    name: string | null;
    image: string | null;
    handle: string | null;
  };
}

/** The sentinel the "all versions" board uses in place of a version string. */
export const ALL_VERSIONS = 'all';
