/**
 * Slice It — the player page's data (`X12`).
 *
 * `Player` holds `totalScore` and `gamesPlayed` and was rendered nowhere. The
 * platform profile at `/u/$handle` shows posts and site activity; nothing showed
 * what a player is like *at this game*, so the most natural social action in it
 * — "who is this person who beat me, and what else do they play?" — was a dead
 * end at the leaderboard row (`X11`).
 *
 * Server-only.
 */

import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { Difficulty } from './constants';
import { DIFFICULTIES } from './constants';
import { toModPool, type ModPool } from './pools';
import { lampOf } from './songs.server';
import type { Lamp } from './types';

/** One of the player's personal bests, as the page renders it. */
export interface PlayerBest {
  songId: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  score: number;
  accuracy: number | null;
  maxCombo: number;
  difficulty: Difficulty;
  modPool: ModPool;
  lamp: Lamp;
  achievedAt: string;
}

/** A recent attempt — not necessarily a best. Only `SliceRun` can answer this. */
export interface PlayerRun {
  songId: string;
  title: string;
  artist: string;
  score: number;
  accuracy: number;
  difficulty: Difficulty;
  lamp: Lamp;
  playedAt: string;
}

/** Lamp counts for one tier. The IIDX-style summary of "what have you done". */
export interface TierLamps {
  difficulty: Difficulty;
  played: number;
  cleared: number;
  fullCombo: number;
  perfect: number;
}

export interface PlayerProfile {
  user: {
    id: string;
    /** Null for an account that has never been given one. */
    handle: string | null;
    name: string;
    image: string | null;
    isVerified: boolean;
  };
  /** Null when the account has never submitted a run. */
  career: { totalScore: number; gamesPlayed: number } | null;
  lamps: TierLamps[];
  best: PlayerBest[];
  recent: PlayerRun[];
  /** Public songs this account uploaded. */
  uploads: number;
  /** Charts this account authored in the editor (`C1`). */
  charts: number;
  isSelf: boolean;
}

/** How many personal bests the page lists. */
const BEST_LIMIT = 20;
/** How many recent runs the page lists. */
const RECENT_LIMIT = 10;

/**
 * Everything the player page renders, for one player.
 *
 * One `$transaction`, not eight round trips. A profile page that issues a query
 * per section is a profile page nobody links to twice — and this one is linked
 * from every leaderboard row, every match result and every multiplayer sidebar
 * entry, which is the entire point of `X11`.
 *
 * ## Why the parameter is "handle **or** id"
 *
 * The canonical URL is the handle: it is the thing a person can read off a
 * leaderboard, type, and share, and `LeaderboardEntry.handle` exists so a row
 * can build one. The **multiplayer** surfaces cannot: `FinalStanding` and
 * `LobbyPlayer` come off the wire carrying `userId` and a display name and no
 * handle at all, and their shape lives in `lib/slice-it/net/events.ts` — a file
 * this wave does not own. Accepting an id here is what lets a match-results row
 * link at all, and the page emits the handle form as its canonical so only one
 * of the two is ever indexed.
 *
 * Returns null for an identifier nobody holds, so the route can `notFound()`
 * rather than render an empty profile for a name that does not exist.
 */
export async function playerProfile(
  handleOrId: string,
  viewerId: string | null,
): Promise<PlayerProfile | null> {
  // Both branches are indexed — `handle` is unique, `id` is the primary key —
  // so this is one index probe or two, never a scan.
  const user = await prisma.user.findFirst({
    where: { OR: [{ handle: handleOrId }, { id: handleOrId }] },
    select: userDisplaySelect,
  });
  if (!user) return null;

  const [career, bestRows, recentRows, uploads, charts, lampRows] = await prisma.$transaction([
    prisma.player.findUnique({
      where: { userId: user.id },
      select: { totalScore: true, gamesPlayed: true },
    }),
    prisma.songLeaderboard.findMany({
      where: { userId: user.id },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: BEST_LIMIT,
      select: {
        score: true,
        accuracy: true,
        maxCombo: true,
        difficulty: true,
        modPool: true,
        cleared: true,
        isFullCombo: true,
        isPerfect: true,
        createdAt: true,
        song: { select: { id: true, title: true, artist: true, coverUrl: true } },
      },
    }),
    // `id desc` is the same order as `createdAt desc` on an append-only table
    // with a monotonic key, and it is the index the table was given.
    prisma.sliceRun.findMany({
      where: { userId: user.id },
      orderBy: { id: 'desc' },
      take: RECENT_LIMIT,
      select: {
        score: true,
        accuracy: true,
        difficulty: true,
        cleared: true,
        isFullCombo: true,
        isPerfect: true,
        createdAt: true,
        song: { select: { id: true, title: true, artist: true } },
      },
    }),
    prisma.song.count({ where: { uploadedBy: user.id, isPublic: true } }),
    prisma.chart.count({ where: { authorId: user.id, status: { in: ['public', 'ranked'] } } }),
    // The lamp summary. Fetched as rows rather than four `groupBy`s because
    // Prisma cannot count a boolean's true-values in a `groupBy`, and four
    // extra aggregate queries to save reading a few hundred rows of three
    // booleans is the wrong trade.
    prisma.songLeaderboard.findMany({
      where: { userId: user.id },
      select: { difficulty: true, cleared: true, isFullCombo: true, isPerfect: true },
    }),
  ]);

  const display = resolveUser(user);

  return {
    user: {
      id: user.id,
      handle: display.handle,
      name: display.name || display.username || display.handle || 'Player',
      image: display.image ?? null,
      isVerified: display.isVerified,
    },
    career,
    lamps: summariseLamps(lampRows),
    best: bestRows.map((row) => ({
      songId: row.song.id,
      title: row.song.title,
      artist: row.song.artist,
      // The stream/cover endpoints, never a storage key — same contract as
      // `toSliceSong`.
      coverUrl: row.song.coverUrl ? `/api/slice-it/songs/${row.song.id}/cover` : null,
      score: row.score,
      accuracy: row.accuracy,
      maxCombo: row.maxCombo,
      difficulty: row.difficulty as Difficulty,
      modPool: toModPool(row.modPool),
      lamp: lampOf(row),
      achievedAt: row.createdAt.toISOString(),
    })),
    recent: recentRows.map((row) => ({
      songId: row.song.id,
      title: row.song.title,
      artist: row.song.artist,
      score: row.score,
      accuracy: row.accuracy,
      difficulty: row.difficulty as Difficulty,
      lamp: lampOf(row),
      playedAt: row.createdAt.toISOString(),
    })),
    uploads,
    charts,
    isSelf: viewerId === user.id,
  };
}

/**
 * Fold the board rows into per-tier lamp counts.
 *
 * The counts nest the way the lamps do — a perfect is also a full combo is also
 * a clear — because that is how every game in the genre reads them, and a
 * summary where "cleared: 3, fullCombo: 5" is possible would be nonsense.
 */
function summariseLamps(
  rows: { difficulty: string; cleared: boolean; isFullCombo: boolean; isPerfect: boolean }[],
): TierLamps[] {
  const byTier = new Map<Difficulty, TierLamps>(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      { difficulty, played: 0, cleared: 0, fullCombo: 0, perfect: 0 },
    ]),
  );

  for (const row of rows) {
    const tier = byTier.get(row.difficulty as Difficulty);
    // An unrecognised tier is a row written by a version of the game that no
    // longer exists. Counting it under a name the UI cannot render would be
    // worse than leaving it out of the summary.
    if (!tier) continue;
    tier.played += 1;
    if (row.cleared || row.isFullCombo || row.isPerfect) tier.cleared += 1;
    if (row.isFullCombo || row.isPerfect) tier.fullCombo += 1;
    if (row.isPerfect) tier.perfect += 1;
  }

  return [...byTier.values()];
}
