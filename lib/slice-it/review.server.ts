/**
 * Slice It — the review queue for what integrity already flags (`R7`).
 *
 * The detection shipped: `integrity.ts` computes bounds, internal consistency,
 * an HMAC wall-clock receipt and a timing-distribution check, and `SliceRun`
 * already persists `suspicion` and the `suspicions` codes behind it. What was
 * missing is that **a flag had nowhere to go** — nothing surfaced it, and
 * nothing looked at a pattern of them.
 *
 * ## The rule this module is built around
 *
 * `integrity.ts`'s design note is explicit that its statistical layer flags and
 * never rejects, because "a false positive on a legitimate record run is worse
 * than a false negative on one cheated score". Nothing here decides an outcome.
 * It ranks runs for a human and shows the EVIDENCE — a moderator who cannot see
 * why something is flagged cannot judge it.
 */

import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';
import {
  ESCALATE_WINDOW_DAYS,
  REVIEW_SUSPICION,
  shouldEscalate,
} from './sharing';

export interface ReviewRun {
  runId: string;
  songId: string;
  title: string;
  artist: string;
  difficulty: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  /** 0–1. */
  suspicion: number;
  /** The codes behind the score — the evidence, not the verdict. */
  suspicions: string[];
  /** Welford statistics from the run, for comparison against the population. */
  timing: { count: number | null; meanMs: number | null; sdMs: number | null };
  at: string;
  user: ResolvedUser;
  /** Flagged runs by this player inside the escalation window. */
  recentFlags: number;
  /** True when the pattern, not the run, warrants a look. */
  escalated: boolean;
}

/**
 * The queue, worst first.
 *
 * Ordered by suspicion rather than by time: a moderator with ten minutes should
 * spend them on the most anomalous runs, not the most recent ones.
 */
export async function reviewQueue(limit = 50): Promise<ReviewRun[]> {
  const runs = await prisma.sliceRun.findMany({
    where: { suspicion: { gt: REVIEW_SUSPICION } },
    orderBy: [{ suspicion: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      songId: true,
      userId: true,
      difficulty: true,
      score: true,
      accuracy: true,
      maxCombo: true,
      suspicion: true,
      suspicions: true,
      timingCount: true,
      timingMeanMs: true,
      timingSdMs: true,
      createdAt: true,
      song: { select: { title: true, artist: true } },
      user: { select: userDisplaySelect },
    },
  });
  if (runs.length === 0) return [];

  // One grouped count for every player in the page rather than a query per
  // row: the queue is ordered by suspicion, so one prolific account can fill it
  // and N+1 here would be fifty identical counts.
  const since = new Date(Date.now() - ESCALATE_WINDOW_DAYS * 86_400_000);
  const grouped = await prisma.sliceRun.groupBy({
    by: ['userId'],
    where: {
      userId: { in: [...new Set(runs.map((run) => run.userId))] },
      suspicion: { gt: REVIEW_SUSPICION },
      createdAt: { gte: since },
    },
    _count: { _all: true },
  });
  const flagsByUser = new Map(grouped.map((row) => [row.userId, row._count._all]));

  return runs.map((run) => {
    const recentFlags = flagsByUser.get(run.userId) ?? 0;
    return {
      // `SliceRun.id` is a BigInt — stringified here rather than at the
      // component, because `JSON.stringify` throws on a BigInt and the failure
      // would be a 500 with no useful message.
      runId: run.id.toString(),
      songId: run.songId,
      title: run.song.title,
      artist: run.song.artist,
      difficulty: run.difficulty,
      score: run.score,
      accuracy: run.accuracy,
      maxCombo: run.maxCombo,
      suspicion: run.suspicion ?? 0,
      suspicions: run.suspicions,
      timing: {
        count: run.timingCount,
        meanMs: run.timingMeanMs,
        sdMs: run.timingSdMs,
      },
      at: run.createdAt.toISOString(),
      user: resolveUser(run.user),
      recentFlags,
      escalated: shouldEscalate(recentFlags),
    };
  });
}

/**
 * How this chart's population actually plays, for context beside a flag.
 *
 * A standard deviation means nothing on its own — the question a moderator is
 * answering is "is this tighter than humans play THIS chart", and that needs the
 * distribution the flag was measured against.
 */
export async function chartTimingPopulation(songId: string, difficulty: string) {
  const agg = await prisma.sliceRun.aggregate({
    where: { songId, difficulty, timingSdMs: { not: null } },
    _count: { _all: true },
    _avg: { timingSdMs: true, timingMeanMs: true },
    _min: { timingSdMs: true },
  });
  return {
    runs: agg._count._all,
    meanSdMs: agg._avg.timingSdMs,
    meanOffsetMs: agg._avg.timingMeanMs,
    /** The tightest run anyone has produced on this chart. */
    tightestSdMs: agg._min.timingSdMs,
  };
}

/**
 * Count a player's recent flags.
 *
 * Called from the score route after a submission is annotated, to decide
 * whether the PATTERN warrants escalation. Never called with a single run's
 * verdict — that is the whole distinction this feature rests on.
 */
export async function recentFlagCount(userId: string): Promise<number> {
  const since = new Date(Date.now() - ESCALATE_WINDOW_DAYS * 86_400_000);
  return prisma.sliceRun.count({
    where: { userId, suspicion: { gt: REVIEW_SUSPICION }, createdAt: { gte: since } },
  });
}
