import { pageSize } from '@/lib/pagination';
import type { PrismaClient, WagerMatch } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import { creditCoins, debitCoins, EscrowError, recordWagerTxn, type Tx } from './escrow.server';
import { getWagerGame } from './eligible-games';
import { rakeOf, WAGER_DEFAULT_EXPIRY_MS, WAGER_RAKE_BPS } from './constants';

type Db = PrismaClient;

export class WagerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'WagerError';
  }
}

export type ResultSource = 'authoritative' | 'agreement' | 'admin' | 'forfeit';

// ─── Serialization ─────────────────────────────────────────────────────────

export interface SerializedWager {
  id: string;
  gameId: string;
  gameTitle: string | null;
  gameHref: string | null;
  authoritative: boolean;
  stakeCoins: number;
  potCoins: number;
  status: WagerMatch['status'];
  challenger: ReturnType<typeof resolveUser> | null;
  opponent: ReturnType<typeof resolveUser> | null;
  winnerId: string | null;
  resultSource: string | null;
  /** Whether the viewer has already submitted a result report. */
  viewerReported: boolean;
  isParticipant: boolean;
  expiresAt: string;
  createdAt: string;
}

type ResolvableUser = Parameters<typeof resolveUser>[0];
type WagerRow = WagerMatch & {
  challenger: ResolvableUser;
  opponent: ResolvableUser | null;
};

export function serializeWager(row: WagerRow, viewerId?: string | null): SerializedWager {
  const game = getWagerGame(row.gameId);
  const viewerIsChallenger = viewerId === row.challengerId;
  const viewerIsOpponent = viewerId != null && viewerId === row.opponentId;
  const viewerReported = viewerIsChallenger
    ? row.challengerReportedWinnerId != null
    : viewerIsOpponent
      ? row.opponentReportedWinnerId != null
      : false;
  return {
    id: row.id,
    gameId: row.gameId,
    gameTitle: game?.title ?? null,
    gameHref: game?.href ?? null,
    authoritative: game?.authoritative ?? false,
    stakeCoins: row.stakeCoins,
    potCoins: row.potCoins,
    status: row.status,
    challenger: resolveUser(row.challenger),
    opponent: row.opponent ? resolveUser(row.opponent) : null,
    winnerId: row.winnerId,
    resultSource: row.resultSource,
    viewerReported,
    isParticipant: viewerIsChallenger || viewerIsOpponent,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

const INCLUDE = {
  challenger: { select: userDisplaySelect },
  opponent: { select: userDisplaySelect },
} as const;

// ─── Create ──────────────────────────────────────────────────────────────

export async function createWager(
  opts: {
    challengerId: string;
    gameId: string;
    stakeCoins: number;
    opponentId?: string | null;
    expiresInMs?: number;
  },
  db: Db = prisma,
): Promise<SerializedWager> {
  const game = getWagerGame(opts.gameId);
  if (!game) throw new WagerError('Game is not wager-eligible', 'INELIGIBLE_GAME', 400);
  if (opts.opponentId && opts.opponentId === opts.challengerId) {
    throw new WagerError('You cannot challenge yourself', 'SELF_CHALLENGE', 400);
  }

  if (opts.opponentId) {
    const opponent = await db.user.findUnique({
      where: { id: opts.opponentId },
      select: { id: true },
    });
    if (!opponent) throw new WagerError('Opponent not found', 'NO_OPPONENT', 404);
  }

  const expiresAt = new Date(Date.now() + (opts.expiresInMs ?? WAGER_DEFAULT_EXPIRY_MS));

  try {
    const row = await db.$transaction(async (tx) => {
      // Escrow the challenger's stake up front so the pot is guaranteed.
      await debitCoins(tx, opts.challengerId, opts.stakeCoins);
      const created = await tx.wagerMatch.create({
        data: {
          gameId: opts.gameId,
          challengerId: opts.challengerId,
          opponentId: opts.opponentId ?? null,
          stakeCoins: opts.stakeCoins,
          potCoins: opts.stakeCoins,
          rakeBps: WAGER_RAKE_BPS,
          status: 'OPEN',
          expiresAt,
        },
      });
      await recordWagerTxn(tx, {
        senderId: opts.challengerId,
        // Hold: the stake leaves the challenger's balance for escrow.
        recipientId: null,
        amount: opts.stakeCoins,
        entityType: 'wager',
        entityId: created.id,
        note: 'Wager stake escrowed',
      });
      return created;
    });

    if (opts.opponentId) {
      void createNotification({
        userId: opts.opponentId,
        actorId: opts.challengerId,
        type: 'SYSTEM',
        entityType: 'wager',
        entityId: row.id,
        preview: `You've been challenged to ${game.title} for ${opts.stakeCoins} coins`,
        link: `/wager/${row.id}`,
      }).catch(() => {});
    }

    const full = await db.wagerMatch.findUnique({ where: { id: row.id }, include: INCLUDE });
    return serializeWager(full as WagerRow, opts.challengerId);
  } catch (err) {
    if (err instanceof EscrowError && err.code === 'INSUFFICIENT_COINS') {
      throw new WagerError('Not enough coins to cover the stake', 'INSUFFICIENT_COINS', 400);
    }
    throw err;
  }
}

// ─── Accept ────────────────────────────────────────────────────────────────

export async function acceptWager(
  opts: { matchId: string; userId: string },
  db: Db = prisma,
): Promise<SerializedWager> {
  try {
    await db.$transaction(async (tx) => {
      const match = await tx.wagerMatch.findUnique({ where: { id: opts.matchId } });
      if (!match) throw new WagerError('Match not found', 'NOT_FOUND', 404);
      if (match.status !== 'OPEN') {
        throw new WagerError('This challenge is no longer open', 'NOT_OPEN', 409);
      }
      if (match.challengerId === opts.userId) {
        throw new WagerError('You cannot accept your own challenge', 'SELF_ACCEPT', 400);
      }
      if (match.opponentId && match.opponentId !== opts.userId) {
        throw new WagerError('This challenge is for another player', 'NOT_INVITED', 403);
      }
      if (match.expiresAt.getTime() <= Date.now()) {
        throw new WagerError('This challenge has expired', 'EXPIRED', 409);
      }

      await debitCoins(tx, opts.userId, match.stakeCoins);
      // Guarded state transition: only flip if still OPEN (prevents a double
      // accept from two racing opponents on an open challenge).
      const updated = await tx.wagerMatch.updateMany({
        where: { id: opts.matchId, status: 'OPEN' },
        data: {
          opponentId: opts.userId,
          status: 'ACCEPTED',
          potCoins: match.potCoins + match.stakeCoins,
          acceptedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new WagerError('This challenge was just taken', 'RACE_LOST', 409);
      }
      await recordWagerTxn(tx, {
        senderId: opts.userId,
        // Hold: the stake leaves the joining player's balance for escrow.
        recipientId: null,
        amount: match.stakeCoins,
        entityType: 'wager',
        entityId: match.id,
        note: 'Wager stake escrowed',
      });
    });
  } catch (err) {
    if (err instanceof EscrowError && err.code === 'INSUFFICIENT_COINS') {
      throw new WagerError('Not enough coins to cover the stake', 'INSUFFICIENT_COINS', 400);
    }
    throw err;
  }

  const full = await db.wagerMatch.findUnique({ where: { id: opts.matchId }, include: INCLUDE });
  const wager = serializeWager(full as WagerRow, opts.userId);
  void createNotification({
    userId: wager.challenger!.id,
    actorId: opts.userId,
    type: 'SYSTEM',
    entityType: 'wager',
    entityId: opts.matchId,
    preview: `Your ${wager.gameTitle ?? 'wager'} challenge was accepted — play now`,
    link: `/wager/${opts.matchId}`,
  }).catch(() => {});
  return wager;
}

// ─── Cancel / refund ─────────────────────────────────────────────────────────

/**
 * Refund every stake actually escrowed for a match and mark it terminal.
 *
 * The opponent's stake is in escrow only once the match left OPEN (accept
 * debits it); a *named* opponent on an OPEN challenge never paid. The
 * transition is a compare-and-swap on the status this transaction read, done
 * BEFORE any credit: under READ COMMITTED a concurrent accept/settle/cancel
 * makes our `count` 0 and nothing is refunded twice or against the wrong pot.
 *
 * Returns the status the match was closed from, or null if it was not in
 * `from` (already terminal, or moved under us) — a no-op.
 */
async function refundAndCloseTx(
  tx: Tx,
  matchId: string,
  finalStatus: 'CANCELLED' | 'EXPIRED',
  from: readonly WagerMatch['status'][],
  extra: { resultSource?: string; note: string },
): Promise<WagerMatch['status'] | null> {
  const match = await tx.wagerMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new WagerError('Match not found', 'NOT_FOUND', 404);
  if (!from.includes(match.status)) return null; // idempotent
  const claimed = await tx.wagerMatch.updateMany({
    where: { id: matchId, status: match.status },
    data: {
      status: finalStatus,
      potCoins: 0,
      ...(extra.resultSource ? { resultSource: extra.resultSource } : {}),
    },
  });
  if (claimed.count === 0) return null; // lost a race; the winner owns the pot

  await creditCoins(tx, match.challengerId, match.stakeCoins);
  await recordWagerTxn(tx, {
    recipientId: match.challengerId,
    amount: match.stakeCoins,
    entityType: 'wager',
    entityId: match.id,
    note: extra.note,
    idempotencyKey: `wager:${match.id}:refund:${match.challengerId}`,
  });
  const opponentEscrowed = match.status !== 'OPEN' && match.opponentId != null;
  if (opponentEscrowed && match.opponentId) {
    await creditCoins(tx, match.opponentId, match.stakeCoins);
    await recordWagerTxn(tx, {
      recipientId: match.opponentId,
      amount: match.stakeCoins,
      entityType: 'wager',
      entityId: match.id,
      note: extra.note,
      idempotencyKey: `wager:${match.id}:refund:${match.opponentId}`,
    });
  }
  return match.status;
}

async function refundAndClose(
  db: Db,
  matchId: string,
  finalStatus: 'CANCELLED' | 'EXPIRED',
): Promise<WagerMatch['status'] | null> {
  // Cancel and expiry only ever close a challenge nobody accepted.
  return db.$transaction((tx) =>
    refundAndCloseTx(tx, matchId, finalStatus, ['OPEN'], {
      note: `Wager ${finalStatus.toLowerCase()} refund`,
    }),
  );
}

export async function cancelWager(
  opts: { matchId: string; userId: string },
  db: Db = prisma,
): Promise<void> {
  const match = await db.wagerMatch.findUnique({ where: { id: opts.matchId } });
  if (!match) throw new WagerError('Match not found', 'NOT_FOUND', 404);
  if (match.status !== 'OPEN') {
    throw new WagerError('Only an open challenge can be cancelled', 'NOT_OPEN', 409);
  }
  // Challenger may cancel; a named opponent may decline (same effect: refund).
  const isChallenger = match.challengerId === opts.userId;
  const isNamedOpponent = match.opponentId != null && match.opponentId === opts.userId;
  if (!isChallenger && !isNamedOpponent) {
    throw new WagerError('Not your challenge', 'FORBIDDEN', 403);
  }
  const closedFrom = await refundAndClose(db, opts.matchId, 'CANCELLED');
  if (closedFrom == null) {
    // Accepted (or otherwise moved) between the check above and the CAS.
    throw new WagerError('Only an open challenge can be cancelled', 'NOT_OPEN', 409);
  }
}

/** Sweep expired-but-unaccepted challenges (called opportunistically on reads). */
export async function expireStaleWagers(db: Db = prisma, limit = 25): Promise<number> {
  const stale = await db.wagerMatch.findMany({
    where: { status: 'OPEN', expiresAt: { lte: new Date() } },
    select: { id: true },
    take: limit,
  });
  let n = 0;
  for (const { id } of stale) {
    try {
      if (await refundAndClose(db, id, 'EXPIRED')) n++;
    } catch {
      // best-effort; skip on contention
    }
  }
  return n;
}

// ─── Settlement ──────────────────────────────────────────────────────────────

/**
 * Pay out a match to `winnerId` from the escrowed pot (minus rake). Idempotent:
 * a match already SETTLED is a no-op. This is the single settlement path shared
 * by agreement, admin adjudication, and the authoritative hub report.
 */
export async function settleWager(
  opts: { matchId: string; winnerId: string; source: ResultSource },
  db: Db = prisma,
): Promise<{ settled: boolean; payout: number }> {
  const result = await db.$transaction(async (tx) => {
    const match = await tx.wagerMatch.findUnique({ where: { id: opts.matchId } });
    if (!match) throw new WagerError('Match not found', 'NOT_FOUND', 404);
    if (match.status === 'SETTLED') return { settled: false, payout: 0 };
    if (match.status !== 'ACCEPTED' && match.status !== 'LIVE' && match.status !== 'DISPUTED') {
      throw new WagerError('Match is not in a settleable state', 'NOT_SETTLEABLE', 409);
    }
    const participants = [match.challengerId, match.opponentId].filter(Boolean) as string[];
    if (!participants.includes(opts.winnerId)) {
      throw new WagerError('Winner must be a participant', 'BAD_WINNER', 400);
    }
    const rake = rakeOf(match.potCoins, match.rakeBps);
    const payout = match.potCoins - rake;
    // Claim the transition first (CAS on the settleable states). A concurrent
    // settle, void or second agreement report sees count 0 and pays nothing.
    // potCoins is fixed once the match left OPEN, so the read value is the pot.
    const claimed = await tx.wagerMatch.updateMany({
      where: { id: match.id, status: { in: ['ACCEPTED', 'LIVE', 'DISPUTED'] } },
      data: {
        status: 'SETTLED',
        winnerId: opts.winnerId,
        resultSource: opts.source,
        potCoins: 0,
        settledAt: new Date(),
      },
    });
    if (claimed.count === 0) return { settled: false, payout: 0 };
    await creditCoins(tx, opts.winnerId, payout);
    await recordWagerTxn(tx, {
      recipientId: opts.winnerId,
      amount: payout,
      entityType: 'wager',
      entityId: match.id,
      note: `Wager won (${opts.source})`,
      idempotencyKey: `wager:${match.id}:payout`,
    });
    return { settled: true, payout };
  });

  if (result.settled) {
    void createNotification({
      userId: opts.winnerId,
      type: 'SYSTEM',
      entityType: 'wager',
      entityId: opts.matchId,
      preview: `You won a wager — ${result.payout} coins paid out`,
      link: `/wager/${opts.matchId}`,
    }).catch(() => {});
  }
  return result;
}

/**
 * A participant reports the winner. When both participants agree, settle
 * immediately (source "agreement"). When they conflict, move to DISPUTED for
 * admin adjudication.
 */
export async function reportWagerResult(
  opts: { matchId: string; userId: string; winnerId: string },
  db: Db = prisma,
): Promise<{ status: 'recorded' | 'settled' | 'disputed' }> {
  const match = await db.wagerMatch.findUnique({ where: { id: opts.matchId } });
  if (!match) throw new WagerError('Match not found', 'NOT_FOUND', 404);
  if (match.status !== 'ACCEPTED' && match.status !== 'LIVE') {
    throw new WagerError('This match cannot be reported right now', 'NOT_REPORTABLE', 409);
  }
  const isChallenger = match.challengerId === opts.userId;
  const isOpponent = match.opponentId === opts.userId;
  if (!isChallenger && !isOpponent) {
    throw new WagerError('Only participants can report a result', 'FORBIDDEN', 403);
  }
  const participants = [match.challengerId, match.opponentId].filter(Boolean) as string[];
  if (!participants.includes(opts.winnerId)) {
    throw new WagerError('Reported winner must be a participant', 'BAD_WINNER', 400);
  }

  // Conditional on the match still being reportable: a blind write here could
  // flip a SETTLED/CANCELLED/DISPUTED match back to LIVE.
  const recorded = await db.wagerMatch.updateMany({
    where: { id: opts.matchId, status: { in: ['ACCEPTED', 'LIVE'] } },
    data: isChallenger
      ? { challengerReportedWinnerId: opts.winnerId, status: 'LIVE' }
      : { opponentReportedWinnerId: opts.winnerId, status: 'LIVE' },
  });
  if (recorded.count === 0) {
    throw new WagerError('This match cannot be reported right now', 'NOT_REPORTABLE', 409);
  }

  const fresh = await db.wagerMatch.findUnique({ where: { id: opts.matchId } });
  if (!fresh) throw new WagerError('Match not found', 'NOT_FOUND', 404);
  const a = fresh.challengerReportedWinnerId;
  const b = fresh.opponentReportedWinnerId;
  if (a && b) {
    if (a === b) {
      await settleWager({ matchId: opts.matchId, winnerId: a, source: 'agreement' }, db);
      return { status: 'settled' };
    }
    await db.wagerMatch.updateMany({
      where: { id: opts.matchId, status: 'LIVE' },
      data: { status: 'DISPUTED' },
    });
    return { status: 'disputed' };
  }
  return { status: 'recorded' };
}

/** Admin adjudication: force a winner, or void (`winnerId: null`) → refund. */
export async function adjudicateWager(
  opts: { matchId: string; winnerId: string | null; adminId: string; note?: string },
  db: Db = prisma,
): Promise<{ status: 'settled' | 'voided' }> {
  const match = await db.wagerMatch.findUnique({ where: { id: opts.matchId } });
  if (!match) throw new WagerError('Match not found', 'NOT_FOUND', 404);
  if (opts.note) {
    await db.wagerMatch.update({ where: { id: opts.matchId }, data: { adminNote: opts.note } });
  }
  if (opts.winnerId == null) {
    // Void: refund exactly the stakes in escrow (the opponent's only once the
    // match left OPEN). EXPIRED/CANCELLED/SETTLED already gave the pot back or
    // paid it out, so voiding them is a no-op rather than a second refund.
    await db.$transaction((tx) =>
      refundAndCloseTx(tx, opts.matchId, 'CANCELLED', ['OPEN', 'ACCEPTED', 'LIVE', 'DISPUTED'], {
        resultSource: 'admin',
        note: 'Wager voided refund',
      }),
    );
    return { status: 'voided' };
  }
  await settleWager({ matchId: opts.matchId, winnerId: opts.winnerId, source: 'admin' }, db);
  return { status: 'settled' };
}

/**
 * Authoritative settlement from a game hub: look up the ACCEPTED/LIVE match by
 * its `gameSessionRef` and settle it. Returns false if no live match matches.
 */
export async function settleWagerByGameSession(
  opts: { gameSessionRef: string; winnerId: string },
  db: Db = prisma,
): Promise<{ settled: boolean }> {
  const match = await db.wagerMatch.findFirst({
    where: { gameSessionRef: opts.gameSessionRef, status: { in: ['ACCEPTED', 'LIVE'] } },
    select: { id: true },
  });
  if (!match) return { settled: false };
  const res = await settleWager(
    { matchId: match.id, winnerId: opts.winnerId, source: 'authoritative' },
    db,
  );
  return { settled: res.settled };
}

/** Attach a hub session ref to a match so the authoritative report can find it. */
export async function linkWagerSession(
  opts: { matchId: string; userId: string; gameSessionRef: string },
  db: Db = prisma,
): Promise<void> {
  const match = await db.wagerMatch.findUnique({ where: { id: opts.matchId } });
  if (!match) throw new WagerError('Match not found', 'NOT_FOUND', 404);
  if (match.challengerId !== opts.userId && match.opponentId !== opts.userId) {
    throw new WagerError('Only participants can link a session', 'FORBIDDEN', 403);
  }
  // Only a match with both stakes in escrow can go LIVE; never revive a
  // settled/cancelled/expired/disputed one.
  const linked = await db.wagerMatch.updateMany({
    where: { id: opts.matchId, status: { in: ['ACCEPTED', 'LIVE'] } },
    data: { gameSessionRef: opts.gameSessionRef, status: 'LIVE' },
  });
  if (linked.count === 0) {
    throw new WagerError('This match cannot be linked right now', 'NOT_LINKABLE', 409);
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────

export async function getWager(
  matchId: string,
  viewerId?: string | null,
  db: Db = prisma,
): Promise<SerializedWager | null> {
  const row = await db.wagerMatch.findUnique({ where: { id: matchId }, include: INCLUDE });
  if (!row) return null;
  return serializeWager(row as WagerRow, viewerId);
}

export async function listWagers(
  opts: { viewerId?: string | null; filter: 'open' | 'mine'; gameId?: string; take?: number },
  db: Db = prisma,
): Promise<SerializedWager[]> {
  const take = pageSize(opts.take, 30, 60);
  const where =
    opts.filter === 'mine' && opts.viewerId
      ? {
          OR: [{ challengerId: opts.viewerId }, { opponentId: opts.viewerId }],
        }
      : {
          status: 'OPEN' as const,
          opponentId: null,
          ...(opts.gameId ? { gameId: opts.gameId } : {}),
        };
  const rows = await db.wagerMatch.findMany({
    where,
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map((r) => serializeWager(r as WagerRow, opts.viewerId));
}
