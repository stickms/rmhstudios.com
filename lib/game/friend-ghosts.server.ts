/**
 * Race a friend's ghost (sprint 12 #03).
 *
 * A friend is a mutual follow: the audience `scopeFilter('friends')` builds for the game boards, minus the viewer, minus
 * a member the viewer has blocked or who has blocked the viewer, minus a member who hides from leaderboards (a ban is
 * part of that set) and minus an account whose deletion is pending. Their ghost is served only when they hold a
 * validated board entry and the ghost's own, client-reported score does not exceed it, the same rule `getGhost` applies
 * to the world's best, so a forged upload cannot become a friend's time either.
 *
 * The list carries no trace data; the trace is read only for the one friend the viewer chose, and every rule is
 * checked again at that point.
 */

import { prisma } from '@/lib/prisma.server';
import { scopeFilter } from '@/lib/game/leaderboard-scope.server';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { getReplayable } from '@/lib/game/replay';
import { GHOST_GAME_IDS } from '@/lib/game/replay-library';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { userChipSelect } from '@/lib/user-display';

/** Most friends the picker lists. */
export const FRIEND_GHOST_CAP = 20;

/** Most friends one request considers: the follow graph the boards read is capped the same way. */
const CANDIDATE_CAP = 500;

export interface FriendGhostEntry {
  userId: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  /** How long the ghost's run took. */
  timeMs: number;
}

export interface FriendGhostTrace {
  replayId: string;
  data: unknown;
  owner: { id: string; name: string | null; handle: string | null; image: string | null };
}

/** The replays that are ghosts of one level, at the game's current logic version. */
export const ghostReplayWhere = (game: string, level: number) => ({
  game,
  version: getReplayable(game)?.version,
  data: { path: ['level'], equals: level },
});

/** An account that can take part: not banned now, not waiting to be deleted. */
const activeUserWhere = (now: Date) => ({
  deletionScheduledAt: null,
  OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }],
});

/** Mutual follows the viewer may race, before any question about ghosts. */
async function friendIds(viewerId: string): Promise<string[]> {
  const scope = await scopeFilter('friends', viewerId);
  const audience = scope.supported ? (scope.audience ?? []) : [];
  const hidden = await leaderboardHiddenUserIds();
  const blocked = new Set(await getBlockedAuthorIds(viewerId));
  return audience.filter((id) => id !== viewerId && !hidden.has(id) && !blocked.has(id)).slice(0, CANDIDATE_CAP);
}

/** The validated board score of each id that holds one (one read). Only Neon Driftway records ghosts. */
async function boardScores(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.neonDriftwayPlayer.findMany({
    where: { userId: { in: ids }, highScore: { gt: 0 } },
    select: { userId: true, highScore: true },
  });
  const scores = new Map<string, number>();
  for (const r of rows) if (r.userId) scores.set(r.userId, r.highScore);
  return scores;
}

const isGhostGame = (game: string) => (GHOST_GAME_IDS as readonly string[]).includes(game);

/** Friends with a ghost on this level, fastest first, at most {@link FRIEND_GHOST_CAP}. No trace data. */
export async function friendGhostList(viewerId: string, game: string, level: number): Promise<FriendGhostEntry[]> {
  if (!isGhostGame(game)) return [];
  const board = await boardScores(await friendIds(viewerId));
  if (board.size === 0) return [];
  const rows = await prisma.gameReplay.findMany({
    where: {
      userId: { in: [...board.keys()] },
      user: activeUserWhere(new Date()),
      ...ghostReplayWhere(game, level),
    },
    select: { userId: true, score: true, durationMs: true, user: { select: userChipSelect } },
    orderBy: { durationMs: 'asc' },
  });
  const listed = new Set<string>();
  const out: FriendGhostEntry[] = [];
  for (const row of rows) {
    const limit = board.get(row.userId);
    // A ghost claiming more than its owner's board score is not the owner's run.
    if (limit === undefined || row.score === null || row.score > limit || listed.has(row.userId)) continue;
    listed.add(row.userId);
    out.push({
      userId: row.userId,
      name: row.user.name,
      handle: row.user.handle,
      image: row.user.image,
      timeMs: row.durationMs,
    });
    if (out.length >= FRIEND_GHOST_CAP) break;
  }
  return out;
}

/** One friend's ghost trace, or null when the friend does not qualify (the caller never learns which rule failed). */
export async function friendGhost(
  viewerId: string,
  game: string,
  level: number,
  friendId: string,
): Promise<FriendGhostTrace | null> {
  if (!isGhostGame(game) || friendId === viewerId) return null;
  const ids = await friendIds(viewerId);
  if (!ids.includes(friendId)) return null;
  const limit = (await boardScores([friendId])).get(friendId);
  if (limit === undefined) return null;
  const row = await prisma.gameReplay.findFirst({
    where: {
      userId: friendId,
      score: { lte: limit },
      user: activeUserWhere(new Date()),
      ...ghostReplayWhere(game, level),
    },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, data: true, user: { select: userChipSelect } },
  });
  return row ? { replayId: row.id, data: row.data, owner: row.user } : null;
}
