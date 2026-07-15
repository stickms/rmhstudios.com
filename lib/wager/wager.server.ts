import type { PrismaClient, WagerMatch } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import { creditCoins, debitCoins, EscrowError, recordWagerTxn } from './escrow.server';
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
        recipientId: opts.challengerId,
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
        recipientId: opts.userId,
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

/** Refund all escrowed stakes for a match and mark it with a terminal status. */
async function refundAndClose(
  db: Db,
  matchId: string,
  finalStatus: 'CANCELLED' | 'EXPIRED',
): Promise<void> {
  await db.$transaction(async (tx) => {
    const match = await tx.wagerMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new WagerError('Match not found', 'NOT_FOUND', 404);
    if (match.status !== 'OPEN' && match.status !== 'ACCEPTED') return; // idempotent

    // Refund challenger their stake; refund opponent too if they had accepted.
    await creditCoins(tx, match.challengerId, match.stakeCoins);
    await recordWagerTxn(tx, {
      recipientId: match.challengerId,
      amount: match.stakeCoins,
      entityType: 'wager',
      entityId: match.id,
      note: `Wager ${finalStatus.toLowerCase()} refund`,
    });
    if (match.status === 'ACCEPTED' && match.opponentId) {
      await creditCoins(tx, match.opponentId, match.stakeCoins);
      await recordWagerTxn(tx, {
        recipientId: match.opponentId,
        amount: match.stakeCoins,
        entityType: 'wager',
        entityId: match.id,
        note: `Wager ${finalStatus.toLowerCase()} refund`,
      });
    }
    await tx.wagerMatch.update({
      where: { id: matchId },
      data: { status: finalStatus, potCoins: 0 },
    });
  });
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
  await refundAndClose(db, opts.matchId, 'CANCELLED');
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
      await refundAndClose(db, id, 'EXPIRED');
      n++;
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
    await creditCoins(tx, opts.winnerId, payout);
    await recordWagerTxn(tx, {
      recipientId: opts.winnerId,
      amount: payout,
      entityType: 'wager',
      entityId: match.id,
      note: `Wager won (${opts.source})`,
    });
    await tx.wagerMatch.update({
      where: { id: match.id },
      data: {
        status: 'SETTLED',
        winnerId: opts.winnerId,
        resultSource: opts.source,
        potCoins: 0,
        settledAt: new Date(),
      },
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

  await db.wagerMatch.update({
    where: { id: opts.matchId },
    data: isChallenger
      ? { challengerReportedWinnerId: opts.winnerId, status: 'LIVE' }
      : { opponentReportedWinnerId: opts.winnerId, status: 'LIVE' },
  });

  const fresh = await db.wagerMatch.findUnique({ where: { id: opts.matchId } });
  if (!fresh) throw new WagerError('Match not found', 'NOT_FOUND', 404);
  const a = fresh.challengerReportedWinnerId;
  const b = fresh.opponentReportedWinnerId;
  if (a && b) {
    if (a === b) {
      await settleWager({ matchId: opts.matchId, winnerId: a, source: 'agreement' }, db);
      return { status: 'settled' };
    }
    await db.wagerMatch.update({ where: { id: opts.matchId }, data: { status: 'DISPUTED' } });
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
    // Void: refund both stakes. Reuse the refund path by forcing status.
    await db.$transaction(async (tx) => {
      const m = await tx.wagerMatch.findUnique({ where: { id: opts.matchId } });
      if (!m || m.status === 'SETTLED' || m.status === 'CANCELLED') return;
      await creditCoins(tx, m.challengerId, m.stakeCoins);
      await recordWagerTxn(tx, {
        recipientId: m.challengerId,
        amount: m.stakeCoins,
        entityType: 'wager',
        entityId: m.id,
        note: 'Wager voided refund',
      });
      if (m.opponentId) {
        await creditCoins(tx, m.opponentId, m.stakeCoins);
        await recordWagerTxn(tx, {
          recipientId: m.opponentId,
          amount: m.stakeCoins,
          entityType: 'wager',
          entityId: m.id,
          note: 'Wager voided refund',
        });
      }
      await tx.wagerMatch.update({
        where: { id: opts.matchId },
        data: { status: 'CANCELLED', potCoins: 0, resultSource: 'admin' },
      });
    });
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
  await db.wagerMatch.update({
    where: { id: opts.matchId },
    data: { gameSessionRef: opts.gameSessionRef, status: 'LIVE' },
  });
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
  const take = Math.min(Math.max(opts.take ?? 30, 1), 60);
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
