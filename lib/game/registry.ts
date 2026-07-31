/**
 * The scoring registry — one declaration per scored game.
 *
 * `lib/games.ts` is the catalog of what exists (cards, art, copy). This is the
 * catalog of how a game SCORES, which nothing owned before: each game's score
 * endpoint invented its own bounds, its own rate limit, and its own idea of a
 * plausible result. The consequences were not cosmetic —
 *
 *  - Ceilings disagreed wildly (one game capped at 100,000,000, another did no
 *    upper-bound check at all), so "is this score real?" had a different answer
 *    per route.
 *  - Rate limits were keyed on IP, not user, so one account could submit from
 *    several addresses and a shared NAT could lock out innocents.
 *  - Nothing checked whether a score was physically reachable in the time
 *    claimed, which is the cheapest and most effective anti-cheat signal there
 *    is for a browser game.
 *
 * Declaring the contract here means every game gets the same treatment and a
 * new game gets it by default. Client-safe (no Prisma, no server imports) so UI
 * can render bounds and labels from the same source the server validates
 * against.
 */

/** How a game's primary score is interpreted. */
export type ScoreDirection = 'higher-is-better' | 'lower-is-better';

export interface GameScoreRules {
  /** Must match an `id` in `lib/games.ts`. */
  id: string;
  /** Human label for leaderboards and error copy (already in English). */
  label: string;
  /**
   * Largest score that is even theoretically reachable. A submission above this
   * is rejected outright — not clamped, because a clamped impossible score
   * still poisons a leaderboard at the ceiling.
   */
  maxScore: number;
  /**
   * Highest defensible score-per-second of play. Combined with the client's
   * reported duration this catches the common "submit a huge number instantly"
   * forgery without needing a replay. Omit where a game has no meaningful
   * duration (turn-based, persistent progression).
   */
  maxScorePerSecond?: number;
  /**
   * Shortest run that can legitimately produce a score, in ms. Anything faster
   * is rejected. Omit where instant results are legitimate.
   */
  minDurationMs?: number;
  direction: ScoreDirection;
  /**
   * True for games that are deliberately absent from the public catalog
   * (`lib/games.ts`) — Signal Forge lives under `/secret/`. They still need
   * scoring rules; they just aren't listed anywhere a visitor browses.
   */
  unlisted?: boolean;
  /** Secondary progress metric a run can report (waves, floors, distance…). */
  progressLabel?: string;
  /** Ceiling for that secondary metric. */
  maxProgress?: number;
}

/**
 * Every game that accepts a score submission.
 *
 * Ceilings are deliberately generous — the goal is to reject the impossible,
 * not to police the excellent. A limit that a strong player can hit is worse
 * than no limit, because it produces false accusations instead of caught
 * cheats.
 */
export const GAME_SCORE_RULES: readonly GameScoreRules[] = [
  {
    id: 'void-breaker',
    label: 'Void Breaker',
    maxScore: 10_000_000,
    maxScorePerSecond: 5_000,
    minDurationMs: 3_000,
    direction: 'higher-is-better',
    progressLabel: 'Wave',
    maxProgress: 500,
  },
  {
    id: 'neon-driftway',
    label: 'Neon Driftway',
    maxScore: 5_000_000,
    maxScorePerSecond: 4_000,
    minDurationMs: 3_000,
    direction: 'higher-is-better',
    progressLabel: 'Distance',
    maxProgress: 1_000_000,
  },
  {
    id: 'signal-forge',
    label: 'Signal Forge',
    unlisted: true,
    maxScore: 5_000_000,
    maxScorePerSecond: 3_000,
    minDurationMs: 3_000,
    direction: 'higher-is-better',
    progressLabel: 'Floor',
    maxProgress: 500,
  },
  {
    id: 'synapse-storm',
    label: 'Synapse Storm',
    maxScore: 5_000_000,
    maxScorePerSecond: 3_000,
    minDurationMs: 3_000,
    direction: 'higher-is-better',
    progressLabel: 'Combo',
    maxProgress: 10_000,
  },
] as const;

const BY_ID = new Map(GAME_SCORE_RULES.map((g) => [g.id, g]));

/** Scoring rules for a game id, or undefined if it isn't a scored game. */
export function getGameScoreRules(gameId: string): GameScoreRules | undefined {
  return BY_ID.get(gameId);
}

/** Every registered scored-game id. */
export function scoredGameIds(): string[] {
  return GAME_SCORE_RULES.map((g) => g.id);
}

/** Why a submitted score was rejected. */
export type ScoreRejection =
  | 'UNKNOWN_GAME'
  | 'INVALID_SCORE'
  | 'SCORE_TOO_HIGH'
  | 'INVALID_PROGRESS'
  | 'PROGRESS_TOO_HIGH'
  | 'RUN_TOO_SHORT'
  | 'SCORE_RATE_IMPLAUSIBLE';

export interface ScoreCandidate {
  score: number;
  /** Run duration in ms, when the game reports one. */
  durationMs?: number;
  /** Secondary metric (wave/floor/distance). */
  progress?: number;
}

/**
 * Validate a candidate score against a game's rules.
 *
 * Pure and client-safe on purpose: the client can pre-check to give immediate
 * feedback, and the server runs the identical function so the two can never
 * disagree about what is acceptable. The server's copy is the authority — this
 * being shared does not make the client's call trustworthy.
 */
export function validateScore(
  gameId: string,
  candidate: ScoreCandidate,
): { ok: true; rules: GameScoreRules } | { ok: false; reason: ScoreRejection } {
  const rules = BY_ID.get(gameId);
  if (!rules) return { ok: false, reason: 'UNKNOWN_GAME' };

  const { score, durationMs, progress } = candidate;

  if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0) {
    return { ok: false, reason: 'INVALID_SCORE' };
  }
  if (score > rules.maxScore) return { ok: false, reason: 'SCORE_TOO_HIGH' };

  if (progress !== undefined) {
    if (!Number.isFinite(progress) || !Number.isInteger(progress) || progress < 0) {
      return { ok: false, reason: 'INVALID_PROGRESS' };
    }
    if (rules.maxProgress !== undefined && progress > rules.maxProgress) {
      return { ok: false, reason: 'PROGRESS_TOO_HIGH' };
    }
  }

  if (durationMs !== undefined && Number.isFinite(durationMs)) {
    if (rules.minDurationMs !== undefined && durationMs < rules.minDurationMs) {
      return { ok: false, reason: 'RUN_TOO_SHORT' };
    }
    if (rules.maxScorePerSecond !== undefined && durationMs > 0) {
      const perSecond = score / (durationMs / 1000);
      if (perSecond > rules.maxScorePerSecond) {
        return { ok: false, reason: 'SCORE_RATE_IMPLAUSIBLE' };
      }
    }
  }

  return { ok: true, rules };
}

/** User-facing message for a rejection (English; callers translate). */
export function rejectionMessage(reason: ScoreRejection): string {
  switch (reason) {
    case 'UNKNOWN_GAME':
      return 'Unknown game.';
    case 'INVALID_SCORE':
      return 'Invalid score.';
    case 'SCORE_TOO_HIGH':
      return 'That score is above this game’s maximum.';
    case 'INVALID_PROGRESS':
      return 'Invalid progress value.';
    case 'PROGRESS_TOO_HIGH':
      return 'That progress value is above this game’s maximum.';
    case 'RUN_TOO_SHORT':
      return 'That run was too short to produce a score.';
    case 'SCORE_RATE_IMPLAUSIBLE':
      return 'That score is not achievable in the time reported.';
    default:
      return 'Score rejected.';
  }
}
