/**
 * The scoring registry — one declaration per scored game.
 *
 * A game's scoring rules are part of its catalog record (`scoring` on the entry
 * in the catalog, see `lib/catalog/types.ts`), so there is one record per
 * game, not a catalog plus a parallel registry. This module derives the rules
 * from those records and adds the few boards that have no card of their own
 * (`UNCATALOGED_SCORE_BOARDS`). Declaring scoring once matters because each score
 * endpoint used to invent its own bounds, its own rate limit, and its own idea
 * of a plausible result. The consequences were not cosmetic —
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

import { games } from '@/lib/catalog';

/** How a game's primary score is interpreted. */
export type ScoreDirection =
  | 'higher-is-better'
  | 'lower-is-better';

export interface GameScoreRules {
  /** Must match an `id` in the catalog (`lib/catalog`). */
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
   * (`lib/catalog`) — Signal Forge lives under `/secret/`. They still need
   * scoring rules; they just aren't listed anywhere a visitor browses.
   */
  unlisted?: boolean;
  /** Secondary progress metric a run can report (waves, floors, distance…). */
  progressLabel?: string;
  /** Ceiling for that secondary metric. */
  maxProgress?: number;
}

/**
 * Score boards that have no catalog card: a secondary board of a catalog game
 * (Boss Rush, Temple of Joy efficiency) or a hidden game (Signal Forge). They
 * need the same validation, so they are declared here; every catalog game
 * declares its rules on its own entry instead.
 *
 * Ceilings are deliberately generous — the goal is to reject the impossible,
 * not to police the excellent. A limit that a strong player can hit is worse
 * than no limit, because it produces false accusations instead of caught
 * cheats.
 */
const UNCATALOGED_SCORE_BOARDS: readonly GameScoreRules[] =
  [
    {
      // Boss Rush's own board (generic adapter, GameStat row keyed by this id) so
      // a rush run can never touch the main Void Breaker board. Not a catalog game.
      id: 'void-breaker-boss-rush',
      label:
        'Void Breaker Boss Rush',
      unlisted: true,
      maxScore: 10_000_000,
      maxScorePerSecond: 5_000,
      minDurationMs: 20_000,
      direction:
        'higher-is-better',
      progressLabel:
        'Bosses',
      maxProgress: 8,
    },
    {
      // Temple of Joy's idle-efficiency board: floor(log10(joy per hour) * 100),
      // derived server-side from the stored save (lib/temple-of-joy/api/temple-of-joy.efficiency.server.ts).
      // A double tops out near 10^308, so 31,000 is the honest ceiling.
      id: 'temple-of-joy-efficiency',
      label:
        'Temple of Joy efficiency',
      unlisted: true,
      maxScore: 31_000,
      minDurationMs: 3_600_000,
      direction:
        'higher-is-better',
      progressLabel:
        'Hours played',
      maxProgress: 1_000_000,
    },
    {
      id: 'signal-forge',
      label:
        'Signal Forge',
      unlisted: true,
      maxScore: 5_000_000,
      maxScorePerSecond: 3_000,
      minDurationMs: 3_000,
      direction:
        'higher-is-better',
      progressLabel:
        'Floor',
      maxProgress: 500,
    },
  ];

/** Every game that accepts a score submission: catalog games with `scoring`, then the uncataloged boards. */
export const GAME_SCORE_RULES: readonly GameScoreRules[] =
  [
    ...games.flatMap(
      (
        g,
      ) =>
        g.scoring
          ? [
              {
                id: g.id,
                label:
                  g.title,
                ...g.scoring,
              },
            ]
          : [],
    ),
    ...UNCATALOGED_SCORE_BOARDS,
  ];

const BY_ID =
  new Map(
    GAME_SCORE_RULES.map(
      (
        g,
      ) => [
        g.id,
        g,
      ],
    ),
  );

/** Scoring rules for a game id, or undefined if it isn't a scored game. */
export function getGameScoreRules(
  gameId: string,
):
  | GameScoreRules
  | undefined {
  return BY_ID.get(
    gameId,
  );
}

/** Every registered scored-game id. */
export function scoredGameIds(): string[] {
  return GAME_SCORE_RULES.map(
    (
      g,
    ) =>
      g.id,
  );
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
):
  | {
      ok: true;
      rules: GameScoreRules;
    }
  | {
      ok: false;
      reason: ScoreRejection;
    } {
  const rules =
    BY_ID.get(
      gameId,
    );
  if (
    !rules
  )
    return {
      ok: false,
      reason:
        'UNKNOWN_GAME',
    };

  const {
    score,
    durationMs,
    progress,
  } =
    candidate;

  if (
    !Number.isFinite(
      score,
    ) ||
    !Number.isInteger(
      score,
    ) ||
    score <
      0
  ) {
    return {
      ok: false,
      reason:
        'INVALID_SCORE',
    };
  }
  if (
    score >
    rules.maxScore
  )
    return {
      ok: false,
      reason:
        'SCORE_TOO_HIGH',
    };

  if (
    progress !==
    undefined
  ) {
    if (
      !Number.isFinite(
        progress,
      ) ||
      !Number.isInteger(
        progress,
      ) ||
      progress <
        0
    ) {
      return {
        ok: false,
        reason:
          'INVALID_PROGRESS',
      };
    }
    if (
      rules.maxProgress !==
        undefined &&
      progress >
        rules.maxProgress
    ) {
      return {
        ok: false,
        reason:
          'PROGRESS_TOO_HIGH',
      };
    }
  }

  if (
    durationMs !==
      undefined &&
    Number.isFinite(
      durationMs,
    )
  ) {
    if (
      rules.minDurationMs !==
        undefined &&
      durationMs <
        rules.minDurationMs
    ) {
      return {
        ok: false,
        reason:
          'RUN_TOO_SHORT',
      };
    }
    if (
      rules.maxScorePerSecond !==
        undefined &&
      durationMs >
        0
    ) {
      const perSecond =
        score /
        (durationMs /
          1000);
      if (
        perSecond >
        rules.maxScorePerSecond
      ) {
        return {
          ok: false,
          reason:
            'SCORE_RATE_IMPLAUSIBLE',
        };
      }
    }
  }

  return {
    ok: true,
    rules,
  };
}

/** User-facing message for a rejection (English; callers translate). */
export function rejectionMessage(
  reason: ScoreRejection,
): string {
  switch (
    reason
  ) {
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
