/**
 * One score-submission pipeline for every scored game.
 *
 * Each game's endpoint used to re-implement this: parse the body its own way,
 * invent its own bounds, rate-limit on IP, write its table, then remember (or
 * forget) to call the progression hooks. The result was four slightly different
 * security postures and, in a couple of cases, progression that silently never
 * fired.
 *
 * The order here is the point:
 *   session → per-USER rate limit → registry validation → persist → progression
 *
 * Rate limiting is keyed on the account rather than the IP because the thing
 * being limited is a player's submission rate. IP keying got it wrong in both
 * directions at once: one account could submit from several addresses, while
 * everyone behind a shared NAT (a school, an office, a phone network) competed
 * for a single bucket.
 */

import { rateLimit } from '@/lib/rate-limit';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { reportGameResult } from '@/lib/game/results.server';
import { validateScore, rejectionMessage, type ScoreRejection } from '@/lib/game/registry';
import { getGameAdapter } from '@/lib/game/adapters.server';

/** Submissions allowed per account per minute, across all games. */
const SUBMIT_LIMIT = 10;
const SUBMIT_WINDOW_MS = 60_000;

export interface SubmitScoreInput {
  gameId: string;
  userId: string;
  score: number;
  /** Secondary metric (wave/floor/distance/combo). Defaults to 0. */
  progress?: number;
  /** Run duration in ms; enables the plausibility checks. */
  durationMs?: number;
  /** Player-chosen display name, for games that collect one. */
  username?: string | null;
  /** Game-specific numeric extras the adapter understands. */
  meta?: Record<string, number>;
}

export type SubmitScoreResult =
  { ok: true } | { ok: false; status: number; error: string; reason?: ScoreRejection };

/**
 * Strip a submitted display name to the characters the player tables accept.
 * Returns null when nothing usable survives, which the adapters treat as
 * "generate one" rather than as an error — a bad nickname should not cost
 * somebody their score.
 */
export function sanitizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw
    .trim()
    .replace(/[^a-zA-Z0-9_\-. ]/g, '')
    .slice(0, 24);
  return clean.length >= 2 ? clean : null;
}

/**
 * Validate and record a run. Returns a typed result rather than throwing, so
 * route handlers map it straight onto a response.
 */
export async function submitGameScore(input: SubmitScoreInput): Promise<SubmitScoreResult> {
  const adapter = getGameAdapter(input.gameId);
  // A leaderboard-only adapter (a game that still submits through its own
  // bespoke route) must not silently accept a submission here.
  if (!adapter?.submit) {
    return { ok: false, status: 404, error: 'Unknown game', reason: 'UNKNOWN_GAME' };
  }

  const { allowed, retryAfter } = rateLimit(input.userId, {
    limit: SUBMIT_LIMIT,
    windowMs: SUBMIT_WINDOW_MS,
    prefix: 'game-score',
  });
  if (!allowed) {
    return {
      ok: false,
      status: 429,
      error: `Too many score submissions. Try again in ${retryAfter}s.`,
    };
  }

  const score = Math.round(input.score);
  const progress = Math.round(input.progress ?? 0);
  const durationMs = Math.max(0, Math.round(input.durationMs ?? 0));

  const verdict = validateScore(input.gameId, {
    score,
    progress,
    // Only pass a duration when the client actually reported one; a fabricated
    // zero would trip `minDurationMs` for every game that sends no timing.
    durationMs: durationMs > 0 ? durationMs : undefined,
  });
  if (!verdict.ok) {
    return {
      ok: false,
      status: 400,
      error: rejectionMessage(verdict.reason),
      reason: verdict.reason,
    };
  }

  await adapter.submit({
    userId: input.userId,
    score,
    progress,
    username: sanitizeUsername(input.username),
    durationMs,
    meta: input.meta,
  });

  // Progression is best-effort and must never fail a recorded score: the run
  // happened whether or not a quest advanced.
  await recordGamePlay(input.userId).catch(() => {});
  await reportGameResult(input.userId, {
    game: input.gameId,
    score,
    cleared: progress,
  }).catch(() => {});

  return { ok: true };
}
