/**
 * Rivals (sprint 15 15), server side: the member's record against each named account they finished versus matches
 * with, and the resolution of a rival's `key` to the account behind it.
 *
 * One raw self-join of `ss_player_match`: the member's own rows (indexed by `ss_player_match_userId_lastUpdateAt_idx`)
 * to the other rows of the same matches (indexed by `ss_player_match_matchId_idx`), grouped by the other player's
 * `userId`. Only finished matches whose two rows both have a `finishedAt` count: a player who left early has no score
 * to compare. Guests, erased members, blocked members and members hidden from the boards (which includes anyone under a
 * ban) are left out in the query itself, so the cut to 50 rivals is taken over people who may be shown. The names are
 * one batched `user.findMany`, as in `matches.server.ts`; a deleted or unnamed account that got through is dropped
 * there. Nothing here returns an account id: a rival is the id of their `SSPlayerMatch` row.
 *
 * `COUNT(*)` is `bigint` in Postgres, so every count goes through `Number()` before it is JSON.
 */
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { GUEST_PREFIX, TOMBSTONE_PREFIX } from './matches';
import {
  RIVALS_LIMIT,
  compareRivals,
  isListableRival,
  isRivalAccountId,
  type RivalUser,
  type RivalView,
  type RivalsPage,
} from './rivals';

/** What the self-join returns for one rival, before the numbers are converted. */
interface RivalRow {
  userId: string;
  key: string;
  matches: bigint | number;
  wins: bigint | number;
  losses: bigint | number;
  ties: bigint | number;
  lastAt: Date;
}

/** Ids a rival list must leave out: blocks either way, plus everyone hidden from the boards (bans included). */
async function excludedIds(userId: string): Promise<{ blocked: ReadonlySet<string>; hidden: ReadonlySet<string> }> {
  const [blocked, hidden] = await Promise.all([getBlockedAuthorIds(userId), leaderboardHiddenUserIds()]);
  return { blocked: new Set(blocked), hidden };
}

/** The member's rivals, most matches together first, at most {@link RIVALS_LIMIT}. */
export async function listRivals(userId: string): Promise<RivalsPage> {
  const { blocked, hidden } = await excludedIds(userId);
  const excluded = [...new Set([...blocked, ...hidden])];
  const guestLike = `${GUEST_PREFIX}%`;
  const tombLike = `${TOMBSTONE_PREFIX}%`;
  const rows = await prisma.$queryRaw<RivalRow[]>`
    SELECT o."userId" AS "userId",
           (ARRAY_AGG(o."id" ORDER BY m."lastUpdateAt" DESC, m."id" DESC))[1] AS "key",
           COUNT(*) AS "matches",
           COUNT(*) FILTER (WHERE m."score" > o."score") AS "wins",
           COUNT(*) FILTER (WHERE m."score" < o."score") AS "losses",
           COUNT(*) FILTER (WHERE m."score" = o."score") AS "ties",
           MAX(m."lastUpdateAt") AS "lastAt"
    FROM "ss_player_match" m
    JOIN "ss_match" s ON s."id" = m."matchId" AND s."status" = 'FINISHED'
    JOIN "ss_player_match" o ON o."matchId" = m."matchId" AND o."userId" <> m."userId"
    WHERE m."userId" = ${userId}
      AND m."finishedAt" IS NOT NULL
      AND o."finishedAt" IS NOT NULL
      AND o."userId" NOT LIKE ${guestLike}
      AND o."userId" NOT LIKE ${tombLike}
      AND o."userId" <> ALL(${excluded}::text[])
    GROUP BY o."userId"
    ORDER BY COUNT(*) DESC, MAX(m."lastUpdateAt") DESC
    LIMIT ${RIVALS_LIMIT}
  `;
  const found = Array.isArray(rows) ? rows : [];
  if (found.length === 0) return { rivals: [] };

  const userRows = await prisma.user.findMany({
    where: { id: { in: found.map((r) => r.userId) } },
    select: { ...userChipSelect, bannedUntil: true, banReason: true },
  });
  const users = new Map<string, RivalUser>();
  for (const u of userRows) users.set(u.id, u);
  const now = new Date();

  const rivals: RivalView[] = [];
  for (const row of found) {
    const user = users.get(row.userId);
    if (!user || !user.name || !isListableRival(row.userId, user, blocked, hidden, now)) continue;
    rivals.push({
      key: row.key,
      name: user.name,
      matches: Number(row.matches),
      wins: Number(row.wins),
      losses: Number(row.losses),
      ties: Number(row.ties),
      lastAt: row.lastAt.toISOString(),
    });
  }
  rivals.sort(compareRivals);
  return { rivals };
}

/**
 * The account a rival `key` names, or null (the endpoint answers 404). The key is a `SSPlayerMatch` row id: it counts
 * only when the viewer has a row in the same match, so a key cannot be used to look up a stranger, and only when the
 * row is another listable account (never the viewer's own, a guest's, an erased member's, a blocked or hidden one).
 */
export async function resolveRivalKey(viewerId: string, key: string): Promise<string | null> {
  const row = await prisma.sSPlayerMatch.findUnique({ where: { id: key }, select: { matchId: true, userId: true } });
  if (!row || row.userId === viewerId || !isRivalAccountId(row.userId)) return null;
  const mine = await prisma.sSPlayerMatch.findFirst({
    where: { matchId: row.matchId, userId: viewerId },
    select: { id: true },
  });
  if (!mine) return null;
  const [user, { blocked, hidden }] = await Promise.all([
    prisma.user.findUnique({
      where: { id: row.userId },
      select: { ...userChipSelect, bannedUntil: true, banReason: true },
    }),
    excludedIds(viewerId),
  ]);
  return isListableRival(row.userId, user ?? undefined, blocked, hidden, new Date()) ? row.userId : null;
}
