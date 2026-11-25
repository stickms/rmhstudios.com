/**
 * The friends board of the daily puzzles: how the viewer's mutual follows did on one mode and day.
 *
 * The audience is `scopeFilter('friends', viewerId)` and nothing else: mutual follows only, board privacy and
 * current bans already removed, the viewer included. A one-way follow never shows a member's result here, which is
 * why this file does not read the follow list itself. On top of that it drops anyone blocked in either direction
 * (`getBlockedAuthorIds`; a block deletes the follow edges, the check covers edges made before that) and deleted
 * accounts (a tombstone is banned until the lock date, tested in the query so a deletion shows at once rather than
 * after the 60 s hidden-set cache). The viewer always sees their own row, whatever their own privacy setting.
 *
 * Board privacy: `leaderboardHiddenUserIds()` is applied again here so the filter is visible at the read, and so
 * the viewer is the only member allowed back in.
 */
import { prisma } from '@/lib/prisma.server';
import { scopeFilter } from '@/lib/game/leaderboard-scope.server';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import type { FollowingBoardEntry, FollowingSummaryMode } from '@/lib/daily-puzzles/following.contract';
import { compareForMode, DAILY_MODES, FOLLOWING_BOARD_MAX } from '@/lib/daily-puzzles/following-schema';

/** Rows the summary reads at most: seven modes of a (capped) audience. */
const SUMMARY_ROW_CAP = 10_000;

/** The database's version of {@link compareForMode}. */
function orderByForMode(gameMode: string) {
  if (gameMode === 'lights-out') {
    return [{ dnf: 'asc' as const }, { moves: 'asc' as const }, { createdAt: 'asc' as const }];
  }
  if (gameMode === 'globeset') {
    return [{ dnf: 'asc' as const }, { timeSeconds: 'asc' as const }, { createdAt: 'asc' as const }];
  }
  return [{ score: 'desc' as const }, { createdAt: 'asc' as const }];
}

/**
 * Who may be on the viewer's friends board: the viewer, then their mutual follows who are not hidden from boards
 * and not blocked in either direction.
 */
export async function friendsAudience(viewerId: string): Promise<string[]> {
  const scope = await scopeFilter('friends', viewerId);
  if (!scope.supported || scope.audience === null) return [viewerId];
  const [hidden, blocked] = await Promise.all([leaderboardHiddenUserIds(), getBlockedAuthorIds(viewerId)]);
  const blockedSet = new Set(blocked);
  const friends = scope.audience.filter((id) => id !== viewerId && !hidden.has(id) && !blockedSet.has(id));
  return [viewerId, ...friends];
}

/** The viewer's own row, or a friend who is not banned or deleted right now (a lapsed ban is fine). */
function listedWhere(viewerId: string, audience: string[], now: Date) {
  return {
    userId: { in: audience },
    OR: [{ userId: viewerId }, { user: { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] } }],
  };
}

const ROW_SELECT = {
  userId: true,
  score: true,
  moves: true,
  hintUsed: true,
  dnf: true,
  timeSeconds: true,
  createdAt: true,
  // The shared select, so a name and avatar read the same here as on every other surface.
  user: { select: userDisplaySelect },
} as const;

function nameOf(user: (Parameters<typeof resolveUserDisplay>[0] & { username: string | null }) | null | undefined): {
  displayName: string;
  avatar: string | null;
} {
  const resolved = user ? resolveUserDisplay(user) : { name: null, image: null };
  return {
    displayName: user?.username || resolved.name || 'Anonymous',
    avatar: resolved.image || null,
  };
}

/** The viewer and their friends with a score for the mode and day, ranked by the mode's axis, at most 100 rows. */
export async function followingBoard(
  viewerId: string,
  gameMode: string,
  dateKey: string,
): Promise<FollowingBoardEntry[]> {
  const audience = await friendsAudience(viewerId);
  const rows = await prisma.dailyPuzzleScore.findMany({
    where: { gameMode, dateKey, ...listedWhere(viewerId, audience, new Date()) },
    orderBy: orderByForMode(gameMode),
    take: FOLLOWING_BOARD_MAX,
    select: ROW_SELECT,
  });
  return rows.map((row, i) => ({
    rank: i + 1,
    isYou: row.userId === viewerId,
    score: row.score,
    moves: row.moves,
    dnf: row.dnf ?? false,
    hintUsed: row.hintUsed ?? false,
    timeSeconds: row.timeSeconds,
    ...nameOf(row.user),
    solvedAt: row.createdAt.toISOString(),
  }));
}

/**
 * One line per mode for a day: how many friends finished, the best of them, and the viewer's own result. One query
 * over all seven modes, grouped here. A did-not-finish run is not a finish.
 */
export async function followingSummary(viewerId: string, dateKey: string): Promise<FollowingSummaryMode[]> {
  const audience = await friendsAudience(viewerId);
  const rows = await prisma.dailyPuzzleScore.findMany({
    where: { dateKey, gameMode: { in: [...DAILY_MODES] }, ...listedWhere(viewerId, audience, new Date()) },
    take: SUMMARY_ROW_CAP,
    select: { gameMode: true, ...ROW_SELECT },
  });

  return DAILY_MODES.map((gameMode) => {
    const ofMode = rows.filter((r) => r.gameMode === gameMode);
    const mine = ofMode.find((r) => r.userId === viewerId) ?? null;
    const finished = ofMode
      .filter((r) => r.userId !== viewerId && !r.dnf)
      .sort((a, b) => compareForMode(gameMode, a, b));
    const top = finished[0];
    return {
      gameMode,
      finished: finished.length,
      best: top
        ? {
            displayName: nameOf(top.user).displayName,
            score: top.score,
            moves: top.moves,
            timeSeconds: top.timeSeconds,
          }
        : null,
      you: mine
        ? { score: mine.score, moves: mine.moves, dnf: mine.dnf ?? false, timeSeconds: mine.timeSeconds }
        : null,
    };
  });
}
