/**
 * Ranked seasons (P5) — the database around `season.ts`.
 *
 * The rules are all in that file, pure and tested. This reads and writes rows.
 */

import { prisma, prismaRead } from '@/lib/prisma.server';
import { userNotHiddenWhere } from '@/lib/game/leaderboard-privacy';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { BASE_RATING, RANKED_GAMES, nextRatingWithK } from '@/lib/ranked/elo';
import { tierForRating, tierIdForRating, type RankTier, type TierId } from '@/lib/ranked/tiers';
import { PLACE_SCAN_CAP, placeFromCandidates, type RankedStandingGame } from '@/lib/ranked/standing';
import {
  PLACEMENT_MATCHES,
  displayRating,
  idleDays,
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
  /** The tier's id beside the object, so a client can translate it without reading the object. */
  tierId: TierId;
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
  // A public, cached ladder page: lag-tolerant, read-only.
  // Hidden members are left out before `take`, so the ladder stays full and ranks close up.
  const hidden = await leaderboardHiddenUserIds();
  const rows = await prismaRead.rankedSeasonRating.findMany({
    where: { game, season, placementsLeft: 0, ...userNotHiddenWhere(hidden) },
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
        tierId: tierIdForRating(rating),
      };
    })
    .sort((x, y) => y.rating - x.rating)
    .slice(0, limit);

  return { season, endsAt: seasonWindow(season).end, progress: seasonProgress(now), entries };
}

/**
 * Where a displayed rating sits on a game's ladder this season: one plus the placed, visible players above it.
 *
 * Decay is computed on read and only ever lowers a rating, so the only rows that can be above the member are those
 * whose STORED rating is higher; that read is the indexed range `[game, season, rating desc]`, two columns, at most
 * {@link PLACE_SCAN_CAP} rows. Each is then run through `displayRating` as the ladder does, and only those still
 * above count. Hidden members (their own board privacy, or banned) are left out of the query, so their rating never
 * moves anyone else's place. At the cap the answer is "beyond the cap", not a wrong number.
 */
export async function placeOf(
  game: string,
  displayedRating: number,
  now: Date = new Date(),
  hidden?: ReadonlySet<string>,
): Promise<{ place: number | null; beyondCap: boolean }> {
  const season = seasonFor(now);
  const hiddenIds = hidden ?? (await leaderboardHiddenUserIds());
  const rows = await prismaRead.rankedSeasonRating.findMany({
    where: { game, season, placementsLeft: 0, rating: { gt: displayedRating }, ...userNotHiddenWhere(hiddenIds) },
    orderBy: { rating: 'desc' },
    take: PLACE_SCAN_CAP,
    select: { rating: true, lastPlayedAt: true },
  });
  return placeFromCandidates(rows, displayedRating, now, PLACE_SCAN_CAP);
}

/** How many placed, visible players a game's ladder has this season. */
export async function ladderSize(game: string, now: Date = new Date(), hidden?: ReadonlySet<string>): Promise<number> {
  const season = seasonFor(now);
  const hiddenIds = hidden ?? (await leaderboardHiddenUserIds());
  return prismaRead.rankedSeasonRating.count({
    where: { game, season, placementsLeft: 0, ...userNotHiddenWhere(hiddenIds) },
  });
}

/**
 * The signed-in member's own standing in every ranked game this season: one read of their rows, then for each placed
 * game one indexed range read and one indexed count. The one caller-facing read of a standing (it replaces the
 * per-game `getStanding`, which nothing called).
 *
 * A member hidden from boards keeps their numbers but has no place ("Not on the ladder"), as with every board.
 */
export async function getStandings(
  userId: string,
  now: Date = new Date(),
): Promise<{ season: number; endsAt: Date; progress: number; games: RankedStandingGame[] }> {
  const season = seasonFor(now);
  const [rows, hidden] = await Promise.all([
    prisma.rankedSeasonRating.findMany({
      where: { userId, season, game: { in: RANKED_GAMES.map((g) => g.id) } },
      select: {
        game: true,
        rating: true,
        wins: true,
        losses: true,
        draws: true,
        placementsLeft: true,
        lastPlayedAt: true,
      },
    }),
    leaderboardHiddenUserIds(),
  ]);
  const byGame = new Map(rows.map((r) => [r.game, r]));
  const onLadder = !hidden.has(userId);

  const games = await Promise.all(
    RANKED_GAMES.map(async (g): Promise<RankedStandingGame> => {
      const row = byGame.get(g.id);
      if (!row) {
        return {
          game: g.id,
          name: g.name,
          played: false,
          rating: null,
          tier: null,
          tierId: null,
          provisional: true,
          placementsLeft: PLACEMENT_MATCHES,
          wins: 0,
          losses: 0,
          draws: 0,
          place: null,
          beyondCap: false,
          of: null,
          shed: 0,
          idleDays: 0,
        };
      }
      const shown = displayRating(row, now);
      let place: number | null = null;
      let beyondCap = false;
      let of: number | null = null;
      if (shown.rating !== null && onLadder) {
        const shownRating = shown.rating;
        const [p, size] = await Promise.all([placeOf(g.id, shownRating, now, hidden), ladderSize(g.id, now, hidden)]);
        place = p.place;
        beyondCap = p.beyondCap;
        of = size;
      }
      return {
        game: g.id,
        name: g.name,
        played: true,
        rating: shown.rating,
        tier: shown.rating === null ? null : tierForRating(shown.rating).label,
        tierId: shown.rating === null ? null : tierIdForRating(shown.rating),
        provisional: shown.provisional,
        placementsLeft: row.placementsLeft,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        place,
        beyondCap,
        of,
        shed: shown.shed,
        idleDays: idleDays(row.lastPlayedAt, now),
      };
    }),
  );

  return { season, endsAt: seasonWindow(season).end, progress: seasonProgress(now), games };
}
