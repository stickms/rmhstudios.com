/**
 * Ranked seasons (P5) — the database around `season.ts`.
 *
 * The rules are all in that file, pure and tested. This reads and writes rows.
 */

import { prisma } from '@/lib/prisma.server';
import { BASE_RATING, nextRatingWithK } from '@/lib/ranked/elo';
import { tierForRating, type RankTier } from '@/lib/ranked/tiers';
import {
  PLACEMENT_MATCHES,
  displayRating,
  kFactorFor,
  seasonFor,
  seasonProgress,
  seasonWindow,
} from '@/lib/ranked/season';
import type { Db } from '@/lib/economy/ledger-core';

/** One row of a season ladder, as the UI renders it. */
export interface LadderEntry {
  userId: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  tier: RankTier;
}

/** A player's own standing, including the provisional case. */
export interface SeasonStanding {
  season: number;
  game: string;
  /** Null while provisional — the signal to render "N matches to place". */
  rating: number | null;
  provisional: boolean;
  placementsLeft: number;
  /** Points shed to decay, so the UI can say why the number moved. */
  shed: number;
  wins: number;
  losses: number;
  draws: number;
  tier: RankTier | null;
}

/**
 * Apply one result to the seasonal ladder.
 *
 * Runs inside the caller's transaction so it lands with the lifetime update or
 * not at all — a season rating that moved while the lifetime one did not would
 * be a discrepancy nobody could explain afterwards.
 *
 * Decay is folded into the rating BEFORE the match is applied, so a player
 * returning after three idle weeks plays their first match from the rating the
 * ladder has been showing, not the one they left behind.
 */
export async function applySeasonResult(
  tx: Db,
  opts: {
    game: string;
    challengerId: string;
    opponentId: string;
    /** null = draw */
    winnerId: string | null;
    now?: Date;
  },
): Promise<{ challengerRating: number; opponentRating: number; season: number }> {
  const now = opts.now ?? new Date();
  const season = seasonFor(now);

  const [a, b] = await Promise.all([
    getOrInit(tx, opts.challengerId, opts.game, season),
    getOrInit(tx, opts.opponentId, opts.game, season),
  ]);

  const aStart = displayRating(a, now).rating ?? a.rating;
  const bStart = displayRating(b, now).rating ?? b.rating;

  const aScore = opts.winnerId === null ? 0.5 : opts.winnerId === opts.challengerId ? 1 : 0;
  const bScore = 1 - aScore;

  const aNext = nextRatingWithK(aStart, bStart, aScore, kFactorFor(a.placementsLeft));
  const bNext = nextRatingWithK(bStart, aStart, bScore, kFactorFor(b.placementsLeft));

  await Promise.all([
    write(tx, opts.challengerId, opts.game, season, aNext, aScore, a.placementsLeft, now),
    write(tx, opts.opponentId, opts.game, season, bNext, bScore, b.placementsLeft, now),
  ]);

  return { challengerRating: aNext, opponentRating: bNext, season };
}

async function getOrInit(tx: Db, userId: string, game: string, season: number) {
  return tx.rankedSeasonRating.upsert({
    where: { userId_game_season: { userId, game, season } },
    create: { userId, game, season, rating: BASE_RATING, placementsLeft: PLACEMENT_MATCHES },
    update: {},
    select: { rating: true, placementsLeft: true, lastPlayedAt: true },
  });
}

function write(
  tx: Db,
  userId: string,
  game: string,
  season: number,
  rating: number,
  score: number,
  placementsLeft: number,
  now: Date,
) {
  return tx.rankedSeasonRating.update({
    where: { userId_game_season: { userId, game, season } },
    data: {
      rating,
      lastPlayedAt: now,
      placementsLeft: Math.max(0, placementsLeft - 1),
      wins: { increment: score === 1 ? 1 : 0 },
      losses: { increment: score === 0 ? 1 : 0 },
      draws: { increment: score === 0.5 ? 1 : 0 },
    },
  });
}

/** One player's standing in a game this season. */
export async function getStanding(
  userId: string,
  game: string,
  now: Date = new Date(),
): Promise<SeasonStanding> {
  const season = seasonFor(now);
  const row = await prisma.rankedSeasonRating.findUnique({
    where: { userId_game_season: { userId, game, season } },
    select: { rating: true, wins: true, losses: true, draws: true, placementsLeft: true, lastPlayedAt: true },
  });

  if (!row) {
    return {
      season,
      game,
      rating: null,
      provisional: true,
      placementsLeft: PLACEMENT_MATCHES,
      shed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      tier: null,
    };
  }

  const shown = displayRating(row, now);
  return {
    season,
    game,
    rating: shown.rating,
    provisional: shown.provisional,
    placementsLeft: row.placementsLeft,
    shed: shown.shed,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    tier: shown.rating === null ? null : tierForRating(shown.rating),
  };
}

/**
 * The ladder for a game this season.
 *
 * Provisional players are excluded in the query rather than filtered after, so
 * a page of 50 is 50 placed players — filtering afterwards would return short
 * pages that get shorter the more new players there are.
 *
 * Decay is applied on read and the result re-sorted, which means the ordering
 * is honest even though the stored ratings are stale. `take` is deliberately
 * generous relative to `limit` so a decayed player who falls below the cut is
 * replaced by someone real rather than leaving a gap.
 */
export async function getLadder(
  game: string,
  limit = 50,
  now: Date = new Date(),
): Promise<{ season: number; endsAt: Date; progress: number; entries: LadderEntry[] }> {
  const season = seasonFor(now);
  const rows = await prisma.rankedSeasonRating.findMany({
    where: { game, season, placementsLeft: 0 },
    orderBy: { rating: 'desc' },
    take: Math.min(limit * 3, 300),
    select: {
      userId: true,
      rating: true,
      wins: true,
      losses: true,
      draws: true,
      placementsLeft: true,
      lastPlayedAt: true,
    },
  });

  const entries = rows
    .map((r) => {
      const shown = displayRating(r, now);
      const rating = shown.rating ?? r.rating;
      return {
        userId: r.userId,
        rating,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        tier: tierForRating(rating),
      };
    })
    .sort((x, y) => y.rating - x.rating)
    .slice(0, limit);

  return { season, endsAt: seasonWindow(season).end, progress: seasonProgress(now), entries };
}
