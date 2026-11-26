/**
 * "Your tournaments" (sprint 15, feature 14): every tournament a member entered or hosted, with the place they took
 * and the prize they won, and the same facts for the data export.
 *
 * Read-only. Nothing here writes `TournamentPayout`, `TournamentEntrant.placement`, coins or the ledger: settlement
 * (`maybeCompleteTournament`) stays the only writer, so no path through this module can pay twice.
 *
 * One page is two reads merged in the server (the member's entries joined to their tournaments, and the tournaments
 * they host) plus one `findMany` for the page's payouts. Both halves are ordered `(createdAt desc, id desc)` on the
 * tournament, so the top `limit + 1` of the union always sits inside the top `limit + 1` of each half and a keyset
 * cursor never repeats or skips a row. The hosted half reads `tournament_createdById_createdAt_idx` and the entered half
 * `tournament_entrant_userId_idx` (both added with this feature: without them each half seq-scanned its table).
 */
import { prisma } from '@/lib/prisma.server';
import { getWagerGame } from '@/lib/wager/eligible-games';
import { decodeTimeCursor, encodeTimeCursor, type TimeCursor } from '@/lib/api/v1/tournaments-schema';
import type { PrismaClient, TournamentFormat, TournamentStatus } from '@prisma/client';

export const MINE_PAGE_SIZE = 20;

/** The export reads at most this many rows of each kind (a member's whole history, bounded). */
const EXPORT_CAP = 5000;

export interface MyTournamentRow {
  id: string;
  name: string;
  gameId: string;
  gameTitle: string | null;
  format: TournamentFormat;
  status: TournamentStatus;
  /** How many entrants the tournament has now (the "of 16"). */
  playerCount: number;
  /** The member created it. */
  hosted: boolean;
  /** The member has an entry. A host may also have played. */
  entered: boolean;
  /** Final place (1 = champion), once the tournament has settled it. */
  placement: number | null;
  /** What the member's place paid, or null when it paid nothing. */
  prizeCoins: number | null;
  createdAt: string;
}

export interface MyTournamentsPage {
  tournaments: MyTournamentRow[];
  /** Pass back as `cursor` for the next page; null on the last. */
  nextCursor: string | null;
}

/** The tournaments older than a cursor in `(createdAt desc, id desc)` order. */
const olderThan = (c: TimeCursor) => ({
  OR: [{ createdAt: { lt: new Date(c.ms) } }, { createdAt: new Date(c.ms), id: { lt: c.id } }],
});

const COUNT = { _count: { select: { entrants: true } } } as const;

type Db = PrismaClient;

/** One page of the member's tournaments, newest first. A bad cursor reads as `'invalid_cursor'`. */
export async function listMyTournaments(
  userId: string,
  rawCursor: string | null | undefined,
  limit: number = MINE_PAGE_SIZE,
  db: Db = prisma,
): Promise<MyTournamentsPage | 'invalid_cursor'> {
  const cursor = rawCursor ? decodeTimeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return 'invalid_cursor';
  const before = cursor ? olderThan(cursor) : {};
  const take = limit + 1;

  const [entries, hosted] = await Promise.all([
    // A cancelled tournament the member only entered was refunded: it is not a result, so it is left out.
    db.tournamentEntrant.findMany({
      where: { userId, tournament: { status: { not: 'CANCELLED' }, ...before } },
      select: {
        placement: true,
        tournament: { include: COUNT },
      },
      orderBy: [{ tournament: { createdAt: 'desc' } }, { tournamentId: 'desc' }],
      take,
    }),
    db.tournament.findMany({
      where: { createdById: userId, ...before },
      include: COUNT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    }),
  ]);

  const byId = new Map<
    string,
    { t: (typeof hosted)[number]; entered: boolean; hosted: boolean; placement: number | null }
  >();
  for (const e of entries) {
    byId.set(e.tournament.id, { t: e.tournament, entered: true, hosted: false, placement: e.placement });
  }
  for (const t of hosted) {
    const seen = byId.get(t.id);
    if (seen) seen.hosted = true;
    else byId.set(t.id, { t, entered: false, hosted: true, placement: null });
  }

  const merged = [...byId.values()].sort(
    (a, b) => b.t.createdAt.getTime() - a.t.createdAt.getTime() || (a.t.id < b.t.id ? 1 : a.t.id > b.t.id ? -1 : 0),
  );
  const page = merged.slice(0, limit);
  const last = page[page.length - 1];

  // The page's payouts in one read: `userId` is a plain column, so it is filtered by value.
  const ids = page.map((p) => p.t.id);
  const payoutRows = ids.length
    ? await db.tournamentPayout.findMany({
        where: { tournamentId: { in: ids }, userId },
        select: { tournamentId: true, amountCoins: true },
      })
    : [];
  const prizeOf = new Map(payoutRows.map((p) => [p.tournamentId, p.amountCoins]));

  return {
    tournaments: page.map((p) => ({
      id: p.t.id,
      name: p.t.name,
      gameId: p.t.gameId,
      gameTitle: getWagerGame(p.t.gameId)?.title ?? null,
      format: p.t.format,
      status: p.t.status,
      playerCount: p.t._count.entrants,
      hosted: p.hosted,
      entered: p.entered,
      placement: p.placement,
      prizeCoins: prizeOf.get(p.t.id) ?? null,
      createdAt: p.t.createdAt.toISOString(),
    })),
    nextCursor:
      merged.length > limit && last ? encodeTimeCursor({ ms: last.t.createdAt.getTime(), id: last.t.id }) : null,
  };
}

/** What the data export carries about the member's tournaments (`sprint15.tournaments`). */
export interface MyTournamentsExport {
  entries: {
    tournamentId: string;
    name: string;
    gameId: string;
    status: string;
    placement: number | null;
    joinedAt: string;
    prizeCoins: number | null;
  }[];
  hosted: { tournamentId: string; name: string; gameId: string; status: string; createdAt: string }[];
  payouts: { tournamentId: string; placement: number; amountCoins: number; paidAt: string }[];
}

/** The member's entries (tournament, game, placement, joined, prize), the tournaments they hosted and their payouts. */
export async function exportMyTournaments(userId: string, db: Db = prisma): Promise<MyTournamentsExport> {
  const [entries, hosted, payouts] = await Promise.all([
    db.tournamentEntrant.findMany({
      where: { userId },
      select: {
        placement: true,
        joinedAt: true,
        tournament: { select: { id: true, name: true, gameId: true, status: true } },
      },
      orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_CAP,
    }),
    db.tournament.findMany({
      where: { createdById: userId },
      select: { id: true, name: true, gameId: true, status: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_CAP,
    }),
    db.tournamentPayout.findMany({
      where: { userId },
      select: { tournamentId: true, placement: true, amountCoins: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_CAP,
    }),
  ]);
  const prizeOf = new Map(payouts.map((p) => [p.tournamentId, p.amountCoins]));
  return {
    entries: entries.map((e) => ({
      tournamentId: e.tournament.id,
      name: e.tournament.name,
      gameId: e.tournament.gameId,
      status: e.tournament.status,
      placement: e.placement,
      joinedAt: e.joinedAt.toISOString(),
      prizeCoins: prizeOf.get(e.tournament.id) ?? null,
    })),
    hosted: hosted.map((t) => ({
      tournamentId: t.id,
      name: t.name,
      gameId: t.gameId,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
    payouts: payouts.map((p) => ({
      tournamentId: p.tournamentId,
      placement: p.placement,
      amountCoins: p.amountCoins,
      paidAt: p.createdAt.toISOString(),
    })),
  };
}
