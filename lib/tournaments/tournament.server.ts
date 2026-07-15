import type { Prisma, PrismaClient, Tournament, TournamentMatch } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import { creditCoins, debitCoins, EscrowError, recordWagerTxn } from '@/lib/wager/escrow.server';
import { getWagerGame } from '@/lib/wager/eligible-games';
import {
  rakeOf,
  TOURNAMENT_PAYOUT_SPLITS,
  TOURNAMENT_RAKE_BPS,
} from '@/lib/wager/constants';
import { generateBracket } from './bracket';

type Db = PrismaClient;

export class TournamentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'TournamentError';
  }
}

// ─── Create ──────────────────────────────────────────────────────────────

export async function createTournament(
  opts: {
    createdById: string;
    name: string;
    gameId: string;
    format: 'SINGLE_ELIM' | 'ROUND_ROBIN';
    entryFeeCoins: number;
    seedPoolCoins?: number;
    maxPlayers: number;
    startsAt?: string | null;
  },
  db: Db = prisma,
): Promise<string> {
  if (!getWagerGame(opts.gameId)) {
    throw new TournamentError('Game is not eligible', 'INELIGIBLE_GAME', 400);
  }
  const seed = opts.seedPoolCoins ?? 0;
  try {
    const id = await db.$transaction(async (tx) => {
      if (seed > 0) {
        // Creator escrows a guaranteed prize up front.
        await debitCoins(tx, opts.createdById, seed);
      }
      const t = await tx.tournament.create({
        data: {
          name: opts.name,
          gameId: opts.gameId,
          format: opts.format,
          entryFeeCoins: opts.entryFeeCoins,
          seedPoolCoins: seed,
          prizePoolCoins: seed,
          rakeBps: TOURNAMENT_RAKE_BPS,
          maxPlayers: opts.maxPlayers,
          createdById: opts.createdById,
          startsAt: opts.startsAt ? new Date(opts.startsAt) : null,
          status: 'REGISTRATION',
        },
      });
      if (seed > 0) {
        await recordWagerTxn(tx, {
          senderId: opts.createdById,
          recipientId: opts.createdById,
          amount: seed,
          entityType: 'tournament',
          entityId: t.id,
          note: 'Tournament seed prize',
        });
      }
      return t.id;
    });
    return id;
  } catch (err) {
    if (err instanceof EscrowError && err.code === 'INSUFFICIENT_COINS') {
      throw new TournamentError('Not enough coins for the seed prize', 'INSUFFICIENT_COINS', 400);
    }
    throw err;
  }
}

// ─── Register ──────────────────────────────────────────────────────────────

export async function registerForTournament(
  opts: { tournamentId: string; userId: string },
  db: Db = prisma,
): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      const t = await tx.tournament.findUnique({
        where: { id: opts.tournamentId },
        include: { _count: { select: { entrants: true } } },
      });
      if (!t) throw new TournamentError('Tournament not found', 'NOT_FOUND', 404);
      if (t.status !== 'REGISTRATION') {
        throw new TournamentError('Registration is closed', 'CLOSED', 409);
      }
      if (t._count.entrants >= t.maxPlayers) {
        throw new TournamentError('Tournament is full', 'FULL', 409);
      }
      const existing = await tx.tournamentEntrant.findUnique({
        where: { tournamentId_userId: { tournamentId: t.id, userId: opts.userId } },
      });
      if (existing) throw new TournamentError('Already registered', 'DUPLICATE', 409);

      if (t.entryFeeCoins > 0) {
        await debitCoins(tx, opts.userId, t.entryFeeCoins);
        await tx.tournament.update({
          where: { id: t.id },
          data: { prizePoolCoins: { increment: t.entryFeeCoins } },
        });
        await recordWagerTxn(tx, {
          senderId: opts.userId,
          recipientId: opts.userId,
          amount: t.entryFeeCoins,
          entityType: 'tournament',
          entityId: t.id,
          note: 'Tournament entry fee',
        });
      }
      await tx.tournamentEntrant.create({
        data: { tournamentId: t.id, userId: opts.userId },
      });
    });
  } catch (err) {
    if (err instanceof EscrowError && err.code === 'INSUFFICIENT_COINS') {
      throw new TournamentError('Not enough coins for the entry fee', 'INSUFFICIENT_COINS', 400);
    }
    throw err;
  }
}

/** Withdraw before the tournament starts; refunds the entry fee. */
export async function withdrawFromTournament(
  opts: { tournamentId: string; userId: string },
  db: Db = prisma,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id: opts.tournamentId } });
    if (!t) throw new TournamentError('Tournament not found', 'NOT_FOUND', 404);
    if (t.status !== 'REGISTRATION') {
      throw new TournamentError('Cannot withdraw after start', 'STARTED', 409);
    }
    const entrant = await tx.tournamentEntrant.findUnique({
      where: { tournamentId_userId: { tournamentId: t.id, userId: opts.userId } },
    });
    if (!entrant) return;
    if (t.entryFeeCoins > 0) {
      await creditCoins(tx, opts.userId, t.entryFeeCoins);
      await tx.tournament.update({
        where: { id: t.id },
        data: { prizePoolCoins: { decrement: t.entryFeeCoins } },
      });
      await recordWagerTxn(tx, {
        recipientId: opts.userId,
        amount: t.entryFeeCoins,
        entityType: 'tournament',
        entityId: t.id,
        note: 'Tournament withdrawal refund',
      });
    }
    await tx.tournamentEntrant.delete({ where: { id: entrant.id } });
  });
}

// ─── Start (generate bracket) ───────────────────────────────────────────────

export async function startTournament(
  opts: { tournamentId: string; byUserId: string; isAdmin?: boolean },
  db: Db = prisma,
): Promise<void> {
  const t = await db.tournament.findUnique({ where: { id: opts.tournamentId } });
  if (!t) throw new TournamentError('Tournament not found', 'NOT_FOUND', 404);
  if (t.createdById !== opts.byUserId && !opts.isAdmin) {
    throw new TournamentError('Only the host can start this', 'FORBIDDEN', 403);
  }
  if (t.status !== 'REGISTRATION') {
    throw new TournamentError('Already started', 'STARTED', 409);
  }
  const entrants = await db.tournamentEntrant.findMany({
    where: { tournamentId: t.id },
    orderBy: { joinedAt: 'asc' },
  });
  if (entrants.length < t.minPlayers) {
    throw new TournamentError('Not enough players to start', 'TOO_FEW', 400);
  }

  // Seed by join order, then build the bracket over entrant ids.
  const orderedIds = entrants.map((e) => e.id);
  const bracket = generateBracket(t.format as 'SINGLE_ELIM' | 'ROUND_ROBIN', orderedIds);

  await db.$transaction(async (tx) => {
    // Assign seeds.
    for (let i = 0; i < entrants.length; i++) {
      await tx.tournamentEntrant.update({
        where: { id: entrants[i].id },
        data: { seed: i + 1 },
      });
    }
    // Persist matches, keyed by (round, slot) so we can resolve nextKey → id.
    const keyToId = new Map<string, string>();
    for (const m of bracket.matches) {
      const created = await tx.tournamentMatch.create({
        data: {
          tournamentId: t.id,
          round: m.round,
          slot: m.slot,
          entrantAId: m.entrantAId,
          entrantBId: m.entrantBId,
          state: m.state === 'BYE' ? 'BYE' : m.state === 'READY' ? 'READY' : 'PENDING',
        },
      });
      keyToId.set(`${m.round}:${m.slot}`, created.id);
    }
    // Second pass: wire nextMatchId / nextSlot now that ids exist.
    for (const m of bracket.matches) {
      if (m.nextKey) {
        const id = keyToId.get(`${m.round}:${m.slot}`);
        const nextId = keyToId.get(m.nextKey);
        if (id && nextId) {
          await tx.tournamentMatch.update({
            where: { id },
            data: { nextMatchId: nextId, nextSlot: m.nextSlot },
          });
        }
      }
    }
    await tx.tournament.update({
      where: { id: t.id },
      data: { status: 'LIVE', startedAt: new Date() },
    });
  });

  // Resolve first-round byes: walk each BYE match and advance its lone entrant.
  const byes = await db.tournamentMatch.findMany({
    where: { tournamentId: t.id, state: 'BYE' },
  });
  for (const bye of byes) {
    const winner = bye.entrantAId ?? bye.entrantBId;
    if (winner) {
      await settleMatch(
        { tournamentId: t.id, matchId: bye.id, winnerEntrantId: winner, source: 'bye' },
        db,
      );
    }
  }
}

// ─── Match settlement + bracket advance ─────────────────────────────────────

async function advanceIntoNext(
  tx: Prisma.TransactionClient,
  match: TournamentMatch,
  winnerEntrantId: string,
): Promise<void> {
  if (!match.nextMatchId) return; // final — no onward flow
  const data =
    match.nextSlot === 1 ? { entrantBId: winnerEntrantId } : { entrantAId: winnerEntrantId };
  await tx.tournamentMatch.update({ where: { id: match.nextMatchId }, data });
  // If both slots are now filled, mark the next match READY.
  const next = await tx.tournamentMatch.findUnique({ where: { id: match.nextMatchId } });
  if (next && next.entrantAId && next.entrantBId && next.state === 'PENDING') {
    await tx.tournamentMatch.update({ where: { id: next.id }, data: { state: 'READY' } });
  }
}

/**
 * Record a match winner and advance the bracket. Idempotent per match (a match
 * already COMPLETE is a no-op). When the final resolves, completes the
 * tournament and pays out. `source` is stored for audit ("admin"/"authoritative"
 * /"agreement"/"bye").
 */
export async function settleMatch(
  opts: { tournamentId: string; matchId: string; winnerEntrantId: string; source: string },
  db: Db = prisma,
): Promise<{ settled: boolean; tournamentComplete: boolean }> {
  const outcome = await db.$transaction(async (tx) => {
    const match = await tx.tournamentMatch.findUnique({ where: { id: opts.matchId } });
    if (!match || match.tournamentId !== opts.tournamentId) {
      throw new TournamentError('Match not found', 'NOT_FOUND', 404);
    }
    if (match.state === 'COMPLETE') return { settled: false, isFinal: false };
    const validEntrants = [match.entrantAId, match.entrantBId].filter(Boolean) as string[];
    if (!validEntrants.includes(opts.winnerEntrantId)) {
      throw new TournamentError('Winner must be in this match', 'BAD_WINNER', 400);
    }
    const loserId = validEntrants.find((e) => e !== opts.winnerEntrantId) ?? null;

    await tx.tournamentMatch.update({
      where: { id: match.id },
      data: {
        winnerEntrantId: opts.winnerEntrantId,
        state: 'COMPLETE',
        resultSource: opts.source.slice(0, 24),
        completedAt: new Date(),
      },
    });
    await tx.tournamentEntrant.update({
      where: { id: opts.winnerEntrantId },
      data: { wins: { increment: 1 } },
    });
    if (loserId) {
      await tx.tournamentEntrant.update({
        where: { id: loserId },
        data: { losses: { increment: 1 }, eliminatedAt: new Date() },
      });
    }
    await advanceIntoNext(tx, match, opts.winnerEntrantId);
    const isFinal = match.nextMatchId == null;
    return { settled: true, isFinal };
  });

  let tournamentComplete = false;
  if (outcome.settled && outcome.isFinal) {
    tournamentComplete = await maybeCompleteTournament(opts.tournamentId, db);
  } else if (outcome.settled) {
    // Round-robin has no "final" — check whether every match is decided.
    const t = await db.tournament.findUnique({ where: { id: opts.tournamentId } });
    if (t?.format === 'ROUND_ROBIN') {
      const remaining = await db.tournamentMatch.count({
        where: { tournamentId: opts.tournamentId, state: { not: 'COMPLETE' } },
      });
      if (remaining === 0) tournamentComplete = await maybeCompleteTournament(opts.tournamentId, db);
    }
  }
  return { settled: outcome.settled, tournamentComplete };
}

/** Compute placements + distribute the prize pool. Idempotent. */
async function maybeCompleteTournament(tournamentId: string, db: Db): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!t || t.status === 'COMPLETE') return false;

    const entrants = await tx.tournamentEntrant.findMany({ where: { tournamentId } });

    // Rank entrants: round-robin by wins; single-elim by last-eliminated + wins.
    const ranked = [...entrants].sort((a, b) => {
      if (t.format === 'ROUND_ROBIN') {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.losses - b.losses;
      }
      // Single-elim: the never-eliminated champion first, then by elimination
      // time descending (later = better), then by wins.
      const aElim = a.eliminatedAt?.getTime() ?? Infinity;
      const bElim = b.eliminatedAt?.getTime() ?? Infinity;
      if (aElim !== bElim) return bElim - aElim;
      return b.wins - a.wins;
    });

    // Payout split by entrant-count bucket (largest key <= count).
    const count = ranked.length;
    const bucketKey = Object.keys(TOURNAMENT_PAYOUT_SPLITS)
      .map(Number)
      .filter((k) => k <= count)
      .sort((a, b) => b - a)[0];
    const split = TOURNAMENT_PAYOUT_SPLITS[bucketKey ?? 2] ?? [10_000];

    const rake = rakeOf(t.prizePoolCoins, t.rakeBps);
    const pool = t.prizePoolCoins - rake;
    const payouts = split.map((bps) => Math.floor((pool * bps) / 10_000));
    // Give rounding remainder to first place.
    const distributed = payouts.reduce((s, p) => s + p, 0);
    if (payouts.length > 0) payouts[0] += pool - distributed;

    for (let i = 0; i < ranked.length; i++) {
      const placement = i + 1;
      await tx.tournamentEntrant.update({
        where: { id: ranked[i].id },
        data: { placement },
      });
      const amount = payouts[i] ?? 0;
      if (amount > 0) {
        await creditCoins(tx, ranked[i].userId, amount);
        await recordWagerTxn(tx, {
          recipientId: ranked[i].userId,
          amount,
          entityType: 'tournament',
          entityId: t.id,
          note: `Tournament placement #${placement}`,
        });
        await tx.tournamentPayout.create({
          data: { tournamentId: t.id, userId: ranked[i].userId, placement, amountCoins: amount },
        });
      }
    }
    await tx.tournament.update({
      where: { id: t.id },
      data: { status: 'COMPLETE', completedAt: new Date(), prizePoolCoins: 0 },
    });
    return true;
  });
}

// ─── Reporting entry points ─────────────────────────────────────────────────

/** Host/admin (or a participant) reports a match winner. */
export async function reportMatch(
  opts: {
    tournamentId: string;
    matchId: string;
    winnerEntrantId: string;
    reporterId: string;
    isAdmin?: boolean;
  },
  db: Db = prisma,
): Promise<{ settled: boolean; tournamentComplete: boolean }> {
  const t = await db.tournament.findUnique({ where: { id: opts.tournamentId } });
  if (!t) throw new TournamentError('Tournament not found', 'NOT_FOUND', 404);
  if (t.status !== 'LIVE') throw new TournamentError('Tournament is not live', 'NOT_LIVE', 409);

  const match = await db.tournamentMatch.findUnique({ where: { id: opts.matchId } });
  if (!match || match.tournamentId !== t.id) {
    throw new TournamentError('Match not found', 'NOT_FOUND', 404);
  }
  // Authorization: host or admin may report any match; a participant may report
  // only their own match.
  const isHost = t.createdById === opts.reporterId || opts.isAdmin;
  if (!isHost) {
    const entrants = await db.tournamentEntrant.findMany({
      where: { id: { in: [match.entrantAId, match.entrantBId].filter(Boolean) as string[] } },
      select: { userId: true },
    });
    const isParticipant = entrants.some((e) => e.userId === opts.reporterId);
    if (!isParticipant) throw new TournamentError('Not your match', 'FORBIDDEN', 403);
  }
  if (match.state !== 'READY' && match.state !== 'LIVE') {
    throw new TournamentError('Match is not ready', 'NOT_READY', 409);
  }
  return settleMatch(
    {
      tournamentId: t.id,
      matchId: opts.matchId,
      winnerEntrantId: opts.winnerEntrantId,
      source: isHost ? 'admin' : 'agreement',
    },
    db,
  );
}

/** Authoritative report from a game hub (via /api/internal/match-result). */
export async function reportTournamentMatchByGameSession(
  opts: { gameSessionRef: string; winnerId: string },
  db: Db = prisma,
): Promise<{ settled: boolean }> {
  const match = await db.tournamentMatch.findFirst({
    where: { gameSessionRef: opts.gameSessionRef, state: { in: ['READY', 'LIVE'] } },
  });
  if (!match) return { settled: false };
  // Map the winning userId to its entrant in this match.
  const entrants = await db.tournamentEntrant.findMany({
    where: { id: { in: [match.entrantAId, match.entrantBId].filter(Boolean) as string[] } },
  });
  const winnerEntrant = entrants.find((e) => e.userId === opts.winnerId);
  if (!winnerEntrant) return { settled: false };
  const res = await settleMatch(
    {
      tournamentId: match.tournamentId,
      matchId: match.id,
      winnerEntrantId: winnerEntrant.id,
      source: 'authoritative',
    },
    db,
  );
  return { settled: res.settled };
}

/** Cancel a tournament and refund all escrowed coins (fees + seed). */
export async function cancelTournament(
  opts: { tournamentId: string; byUserId: string; isAdmin?: boolean },
  db: Db = prisma,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id: opts.tournamentId } });
    if (!t) throw new TournamentError('Tournament not found', 'NOT_FOUND', 404);
    if (t.createdById !== opts.byUserId && !opts.isAdmin) {
      throw new TournamentError('Only the host can cancel', 'FORBIDDEN', 403);
    }
    if (t.status === 'COMPLETE' || t.status === 'CANCELLED') return;

    const entrants = await tx.tournamentEntrant.findMany({ where: { tournamentId: t.id } });
    for (const e of entrants) {
      if (t.entryFeeCoins > 0) {
        await creditCoins(tx, e.userId, t.entryFeeCoins);
        await recordWagerTxn(tx, {
          recipientId: e.userId,
          amount: t.entryFeeCoins,
          entityType: 'tournament',
          entityId: t.id,
          note: 'Tournament cancelled refund',
        });
      }
    }
    if (t.seedPoolCoins > 0) {
      await creditCoins(tx, t.createdById, t.seedPoolCoins);
      await recordWagerTxn(tx, {
        recipientId: t.createdById,
        amount: t.seedPoolCoins,
        entityType: 'tournament',
        entityId: t.id,
        note: 'Tournament cancelled seed refund',
      });
    }
    await tx.tournament.update({
      where: { id: t.id },
      data: { status: 'CANCELLED', prizePoolCoins: 0 },
    });
  });
}

/** Attach a hub session ref to a match (for the authoritative report to find). */
export async function linkTournamentMatchSession(
  opts: { tournamentId: string; matchId: string; userId: string; gameSessionRef: string },
  db: Db = prisma,
): Promise<void> {
  const match = await db.tournamentMatch.findUnique({ where: { id: opts.matchId } });
  if (!match || match.tournamentId !== opts.tournamentId) {
    throw new TournamentError('Match not found', 'NOT_FOUND', 404);
  }
  const entrants = await db.tournamentEntrant.findMany({
    where: { id: { in: [match.entrantAId, match.entrantBId].filter(Boolean) as string[] } },
    select: { userId: true },
  });
  if (!entrants.some((e) => e.userId === opts.userId)) {
    throw new TournamentError('Not your match', 'FORBIDDEN', 403);
  }
  await db.tournamentMatch.update({
    where: { id: opts.matchId },
    data: { gameSessionRef: opts.gameSessionRef, state: 'LIVE' },
  });
}

// ─── Reads / serialization ───────────────────────────────────────────────

export interface SerializedTournament {
  id: string;
  name: string;
  gameId: string;
  gameTitle: string | null;
  gameHref: string | null;
  format: Tournament['format'];
  status: Tournament['status'];
  entryFeeCoins: number;
  prizePoolCoins: number;
  seedPoolCoins: number;
  maxPlayers: number;
  playerCount: number;
  createdById: string;
  startsAt: string | null;
  createdAt: string;
  entrants?: {
    id: string;
    seed: number | null;
    placement: number | null;
    wins: number;
    losses: number;
    user: ReturnType<typeof resolveUser> | null;
  }[];
  matches?: {
    id: string;
    round: number;
    slot: number;
    entrantAId: string | null;
    entrantBId: string | null;
    winnerEntrantId: string | null;
    state: TournamentMatch['state'];
  }[];
  payouts?: { userId: string; placement: number; amountCoins: number }[];
  viewerEntered?: boolean;
}

const LIST_INCLUDE = { _count: { select: { entrants: true } } } as const;

function serializeSummary(
  t: Tournament & { _count: { entrants: number } },
): SerializedTournament {
  const game = getWagerGame(t.gameId);
  return {
    id: t.id,
    name: t.name,
    gameId: t.gameId,
    gameTitle: game?.title ?? null,
    gameHref: game?.href ?? null,
    format: t.format,
    status: t.status,
    entryFeeCoins: t.entryFeeCoins,
    prizePoolCoins: t.prizePoolCoins,
    seedPoolCoins: t.seedPoolCoins,
    maxPlayers: t.maxPlayers,
    playerCount: t._count.entrants,
    createdById: t.createdById,
    startsAt: t.startsAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function listTournaments(
  opts: { status?: 'REGISTRATION' | 'LIVE' | 'COMPLETE'; take?: number },
  db: Db = prisma,
): Promise<SerializedTournament[]> {
  const take = Math.min(Math.max(opts.take ?? 30, 1), 60);
  const rows = await db.tournament.findMany({
    where: opts.status ? { status: opts.status } : { status: { not: 'CANCELLED' } },
    include: LIST_INCLUDE,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take,
  });
  return rows.map(serializeSummary);
}

export async function getTournament(
  id: string,
  viewerId?: string | null,
  db: Db = prisma,
): Promise<SerializedTournament | null> {
  const t = await db.tournament.findUnique({
    where: { id },
    include: {
      _count: { select: { entrants: true } },
      entrants: {
        orderBy: [{ seed: 'asc' }, { joinedAt: 'asc' }],
        include: { user: { select: userDisplaySelect } },
      },
      matches: { orderBy: [{ round: 'asc' }, { slot: 'asc' }] },
      payouts: true,
    },
  });
  if (!t) return null;
  const base = serializeSummary(t);
  return {
    ...base,
    entrants: t.entrants.map((e) => ({
      id: e.id,
      seed: e.seed,
      placement: e.placement,
      wins: e.wins,
      losses: e.losses,
      user: e.user ? resolveUser(e.user) : null,
    })),
    matches: t.matches.map((m) => ({
      id: m.id,
      round: m.round,
      slot: m.slot,
      entrantAId: m.entrantAId,
      entrantBId: m.entrantBId,
      winnerEntrantId: m.winnerEntrantId,
      state: m.state,
    })),
    payouts: t.payouts.map((p) => ({
      userId: p.userId,
      placement: p.placement,
      amountCoins: p.amountCoins,
    })),
    viewerEntered: viewerId ? t.entrants.some((e) => e.userId === viewerId) : false,
  };
}

/** Notify entrants when a tournament goes live (best-effort). */
export async function notifyTournamentStarted(tournamentId: string, db: Db = prisma): Promise<void> {
  const entrants = await db.tournamentEntrant.findMany({
    where: { tournamentId },
    select: { userId: true },
  });
  const t = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) return;
  await Promise.allSettled(
    entrants.map((e) =>
      createNotification({
        userId: e.userId,
        type: 'SYSTEM',
        entityType: 'tournament',
        entityId: tournamentId,
        preview: `${t.name} has started — check your bracket`,
        link: `/tournaments/${tournamentId}`,
      }),
    ),
  );
}
