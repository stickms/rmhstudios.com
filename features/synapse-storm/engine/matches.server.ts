/**
 * "Your matches" (sprint 14 03), server side: the member's own finished versus matches, the export of them and the
 * erasure of the rows that name the member. Lives here, not under `server/`, which holds the hub's socket handlers.
 *
 * `SSPlayerMatch` has no relation to `User`: its `userId` is an account id, `guest:<socketId>` or (after an erasure)
 * `deleted:<row id>`, so the other players' names are a second batched `user.findMany`, never a nested select. The page
 * is keyset-paged on the member's own `(lastUpdateAt, id)` (required columns, indexed by
 * `ss_player_match_userId_lastUpdateAt_idx`): `finishedAt` is optional and `SSMatch.endAt` lives in another table.
 *
 * Scores are client-claimed. Nothing here feeds a board, a quest or an achievement.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import {
  DELETED_PLAYER_NAME,
  MATCHES_PAGE_SIZE,
  decodeMatchesCursor,
  encodeMatchesCursor,
  isGuestId,
  isTombstoneId,
  placeByScore,
  type MatchView,
  type MatchesCursor,
  type MatchesPage,
  type OtherPlayerView,
} from './matches';

/** A bad cursor token: the endpoint answers 400. */
export class MatchesCursorError extends Error {
  constructor() {
    super('invalid cursor');
    this.name = 'MatchesCursorError';
  }
}

interface UserLookup {
  id: string;
  name: string | null;
  bannedUntil: Date | null;
  banReason: string | null;
}

/**
 * One other player as the member may see them: current name, "Deleted user" for an erased member, and "A player" for
 * a guest, anyone across a block either way and anyone under a ban. Pure, so the rules can be tested row by row.
 */
export function otherPlayerView(
  userId: string,
  users: ReadonlyMap<string, UserLookup>,
  blockedIds: ReadonlySet<string>,
  now: Date,
): OtherPlayerView {
  if (isTombstoneId(userId)) return { kind: 'deleted', name: null };
  if (isGuestId(userId)) return { kind: 'anonymous', name: null };
  const user = users.get(userId);
  if (
    !user ||
    user.id === DELETED_USER_ID ||
    user.banReason === DELETED_ACCOUNT_BAN_REASON ||
    user.name === DELETED_PLAYER_NAME
  ) {
    return { kind: 'deleted', name: null };
  }
  if (blockedIds.has(userId)) return { kind: 'anonymous', name: null };
  if (user.bannedUntil && user.bannedUntil.getTime() > now.getTime()) return { kind: 'anonymous', name: null };
  if (!user.name) return { kind: 'anonymous', name: null };
  return { kind: 'player', name: user.name };
}

/** The member's finished versus matches, newest first, 20 a page on `(lastUpdateAt, id)` of their own row. */
export async function listMyMatches(userId: string, token?: string): Promise<MatchesPage> {
  let cursor: MatchesCursor | null = null;
  if (token) {
    cursor = decodeMatchesCursor(token);
    if (!cursor) throw new MatchesCursorError();
  }
  const where = {
    userId,
    match: { status: 'FINISHED' },
    ...(cursor
      ? {
          OR: [{ lastUpdateAt: { lt: cursor.at } }, { lastUpdateAt: cursor.at, id: { lt: cursor.id } }],
        }
      : {}),
  } satisfies Prisma.SSPlayerMatchWhereInput;
  const rows = await prisma.sSPlayerMatch.findMany({
    where,
    orderBy: [{ lastUpdateAt: 'desc' }, { id: 'desc' }],
    take: MATCHES_PAGE_SIZE + 1,
    select: {
      id: true,
      score: true,
      maxCombo: true,
      puzzlesSolved: true,
      puzzlesMissed: true,
      finishedAt: true,
      lastUpdateAt: true,
      match: {
        select: {
          endAt: true,
          players: { select: { id: true, userId: true, score: true } },
        },
      },
    },
  });
  const page = rows.slice(0, MATCHES_PAGE_SIZE);
  const last = page[page.length - 1];

  // The other players' accounts, once for the whole page (guests and tombstones are never looked up).
  const lookupIds = new Set<string>();
  for (const row of page) {
    for (const p of row.match.players) {
      if (p.id !== row.id && p.userId !== userId && !isGuestId(p.userId) && !isTombstoneId(p.userId)) {
        lookupIds.add(p.userId);
      }
    }
  }
  const [userRows, blocked] =
    lookupIds.size > 0
      ? await Promise.all([
          prisma.user.findMany({
            where: { id: { in: [...lookupIds] } },
            select: { ...userChipSelect, bannedUntil: true, banReason: true },
          }),
          getBlockedAuthorIds(userId),
        ])
      : [[], [] as string[]];
  const users = new Map<string, UserLookup>();
  for (const u of userRows) users.set(u.id, u);
  const blockedIds = new Set(blocked);
  const now = new Date();

  const matches: MatchView[] = page.map((row) => {
    const players = row.match.players;
    return {
      id: row.id,
      endedAt: (row.match.endAt ?? row.lastUpdateAt).toISOString(),
      place: placeByScore(
        players.map((p) => p.score),
        row.score,
      ),
      players: players.length,
      score: row.score,
      maxCombo: row.maxCombo,
      solved: row.puzzlesSolved,
      missed: row.puzzlesMissed,
      finished: row.finishedAt !== null,
      others: players.filter((p) => p.id !== row.id).map((p) => otherPlayerView(p.userId, users, blockedIds, now)),
    };
  });
  return {
    matches,
    nextCursor:
      rows.length > MATCHES_PAGE_SIZE && last ? encodeMatchesCursor({ at: last.lastUpdateAt, id: last.id }) : null,
  };
}

export interface SynapseMatchExport {
  endedAt: string;
  place: number;
  players: number;
  score: number;
  maxCombo: number;
  solved: number;
  missed: number;
  finished: boolean;
}

/** The member's finished matches for the data export. Other players are a count only: their names are theirs. */
export async function exportSynapseMatches(userId: string): Promise<SynapseMatchExport[]> {
  const rows = await prisma.sSPlayerMatch.findMany({
    where: { userId, match: { status: 'FINISHED' } },
    orderBy: [{ lastUpdateAt: 'desc' }, { id: 'desc' }],
    select: {
      score: true,
      maxCombo: true,
      puzzlesSolved: true,
      puzzlesMissed: true,
      finishedAt: true,
      lastUpdateAt: true,
      match: { select: { endAt: true, players: { select: { score: true } } } },
    },
  });
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    endedAt: (row.match.endAt ?? row.lastUpdateAt).toISOString(),
    place: placeByScore(
      row.match.players.map((p) => p.score),
      row.score,
    ),
    players: row.match.players.length,
    score: row.score,
    maxCombo: row.maxCombo,
    solved: row.puzzlesSolved,
    missed: row.puzzlesMissed,
    finished: row.finishedAt !== null,
  }));
}

/**
 * Erasure: the member's rows keep their numbers (the other players' history) but lose the name and the id, so no later
 * read can join them back. Each id becomes `deleted:<row id>`, which keeps `@@unique([matchId, userId])` and
 * `@@unique([lobbyId, userId])` satisfied; `SSLobby.hostUserId` takes the same form. None of the three models has a
 * `User` relation, so this operation and its test are the record (feature 18 classifies the columns).
 *
 * Three set-based statements, no read first: they run inside the caller's transaction, so there is no window for a row
 * to change hands between a read and an update, and a heavy player costs three statements, not one per row. Each
 * repeats the member's id in its `WHERE`, so a row already tombstoned is left alone (re-run safe). Raw SQL names the
 * `@@map` tables. A test proxy without `$executeRaw` gets no operations (as in `erasure-follows.server.ts`).
 */
export function synapseMatchErasureOps(userId: string) {
  if (typeof prisma.$executeRaw !== 'function') return [];
  return [
    prisma.$executeRaw`UPDATE "ss_player_match" SET "userId" = 'deleted:' || "id", "displayName" = ${DELETED_PLAYER_NAME} WHERE "userId" = ${userId}`,
    prisma.$executeRaw`UPDATE "ss_lobby_member" SET "userId" = 'deleted:' || "id", "displayName" = ${DELETED_PLAYER_NAME} WHERE "userId" = ${userId}`,
    prisma.$executeRaw`UPDATE "ss_lobby" SET "hostUserId" = 'deleted:' || "id" WHERE "hostUserId" = ${userId}`,
  ];
}
