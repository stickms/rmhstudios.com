import { notice } from '@/lib/notifications/notice-keys';
import { pageSize } from '@/lib/pagination';
import type { Prisma, PrismaClient, Tournament, TournamentMatch } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import { creditCoins, debitCoins, EscrowError, recordWagerTxn } from '@/lib/wager/escrow.server';
import { getWagerGame } from '@/lib/wager/eligible-games';
import { TOURNAMENT_RAKE_BPS } from '@/lib/wager/constants';
import { MIN_DOUBLE_ELIM_PLAYERS } from './tournament-schema';
import { generateBracket, rankDoubleElim, resolveBracketRows } from './bracket';
import { pairRound, recommendedRounds, type Pairing } from './swiss';
import {
  computePayouts,
  resultsFromMatches as resultsFromRows,
  swissSettlement,
} from './swiss-flow';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { checkInShortfall, isCheckInOpen, isCheckInMinutes, noShows, checkInOpensAt } from './checkin';
import { TournamentError } from './tournament-error';
import { orderForStart } from './seeding.server';
import { ratingSeedingAvailable, type SeedingMethod } from './seeding';
import { randomUUID } from 'node:crypto';
import { emitMatchSettled } from '@/lib/webhooks/activity-emit.server';
import { stampDeadline, stampTournamentDeadlines } from './deadline.server';
import { isDeadlineHours } from './scheduling';

type Db = PrismaClient;

export { TournamentError };

/** Reporting a result for a match its tournament's cancellation closed. */
export function matchCancelledError(): TournamentError {
  return new TournamentError(
    'This match was cancelled with its tournament',
    'MATCH_CANCELLED',
    409,
  );
}

// ─── Create ──────────────────────────────────────────────────────────────

export async function createTournament(
  opts: {
    createdById: string;
    name: string;
    gameId: string;
    format: 'SINGLE_ELIM' | 'DOUBLE_ELIM' | 'ROUND_ROBIN' | 'SWISS';
    entryFeeCoins: number;
    seedPoolCoins?: number;
    maxPlayers: number;
    startsAt?: string | null;
    checkInMinutes?: number | null;
    /** s07-06: each match must be played within this many hours of becoming ready; null or left out = no deadline. */
    matchDeadlineHours?: number | null;
    /** How the field is seeded at the start; sign-up order when left out. */
    seeding?: SeedingMethod;
  },
  db: Db = prisma,
): Promise<string> {
  if (!getWagerGame(opts.gameId)) {
    throw new TournamentError('Game is not eligible', 'INELIGIBLE_GAME', 400);
  }
  if (opts.checkInMinutes != null && (!isCheckInMinutes(opts.checkInMinutes) || !opts.startsAt)) {
    throw new TournamentError('Check-in needs a start time', 'NO_START_TIME', 400);
  }
  if (opts.seeding === 'rating' && !ratingSeedingAvailable(opts.gameId)) {
    throw new TournamentError('Rating seeding is only for ranked games', 'RATING_UNAVAILABLE', 400);
  }
  if (opts.matchDeadlineHours != null && !isDeadlineHours(opts.matchDeadlineHours)) {
    throw new TournamentError('Pick a listed match deadline', 'BAD_DEADLINE', 400);
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
          minPlayers: opts.format === 'DOUBLE_ELIM' ? MIN_DOUBLE_ELIM_PLAYERS : undefined,
          createdById: opts.createdById,
          startsAt: opts.startsAt ? new Date(opts.startsAt) : null,
          checkInMinutes: opts.checkInMinutes ?? null,
          matchDeadlineHours: opts.matchDeadlineHours ?? null,
          seeding: opts.seeding ?? 'join',
          status: 'REGISTRATION',
        },
      });
      if (seed > 0) {
        await recordWagerTxn(tx, {
          senderId: opts.createdById,
          // Hold: the seed leaves the creator's balance for the prize pot.
          recipientId: null,
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
      // Claim the tournament row while it is still REGISTRATION. This is the
      // guard (the read above is not, under READ COMMITTED): a concurrent
      // cancel/start that flipped the status makes count 0, and one that is
      // still in flight holds the row lock until it commits — so an entrant can
      // never be added (and charged) after cancel has computed its refunds.
      const claimed = await tx.tournament.updateMany({
        where: { id: t.id, status: 'REGISTRATION' },
        data: { prizePoolCoins: { increment: t.entryFeeCoins } },
      });
      if (claimed.count === 0) {
        throw new TournamentError('Registration is closed', 'CLOSED', 409);
      }
      // Re-count under the row lock: concurrent registrations serialise on it.
      const count = await tx.tournamentEntrant.count({ where: { tournamentId: t.id } });
      if (count >= t.maxPlayers) {
        throw new TournamentError('Tournament is full', 'FULL', 409);
      }
      const existing = await tx.tournamentEntrant.findUnique({
        where: { tournamentId_userId: { tournamentId: t.id, userId: opts.userId } },
      });
      if (existing) throw new TournamentError('Already registered', 'DUPLICATE', 409);

      if (t.entryFeeCoins > 0) {
        await debitCoins(tx, opts.userId, t.entryFeeCoins);
        await recordWagerTxn(tx, {
          senderId: opts.userId,
          // Hold: the entry fee leaves the entrant's balance for the pot.
          recipientId: null,
          amount: t.entryFeeCoins,
          entityType: 'tournament',
          entityId: t.id,
          note: 'Tournament entry fee',
        });
      }
      // Registering once the check-in window is open counts as checking in.
      const now = new Date();
      await tx.tournamentEntrant.create({
        data: {
          tournamentId: t.id,
          userId: opts.userId,
          checkedInAt: isCheckInOpen(t, now) ? now : null,
        },
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
    // Lock the row while still REGISTRATION (see registerForTournament): a
    // racing cancel/start either already flipped it (count 0) or waits for us.
    const claimed = await tx.tournament.updateMany({
      where: { id: t.id, status: 'REGISTRATION' },
      data: { updatedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new TournamentError('Cannot withdraw after start', 'STARTED', 409);
    }
    const entrant = await tx.tournamentEntrant.findUnique({
      where: { tournamentId_userId: { tournamentId: t.id, userId: opts.userId } },
    });
    if (!entrant) return;
    await refundEntrant(tx, t, entrant, 'withdraw');
  });
}

/** Why an entrant leaves before the start; names the ledger note and idempotency key. */
export type RefundReason = 'withdraw' | 'no-show';

const REFUND_NOTES: Record<RefundReason, string> = {
  withdraw: 'Tournament withdrawal refund',
  'no-show': 'Tournament no-show refund',
};

/**
 * Remove one entrant from a tournament that has not drawn its bracket and hand
 * back their entry fee. The one place a leaving entrant is refunded, so a
 * withdrawal and a no-show drop can never diverge: the entrant is deleted with a
 * conditional `deleteMany` (a racing second removal matches nothing and refunds
 * nothing), then the coins are credited, the pool is lowered and the ledger row
 * is written under `tournament:entrant:<id>:<reason>` (its unique index aborts
 * the surrounding transaction on a repeat). Call inside a transaction that has
 * already claimed the tournament row. Answers whether this call removed them.
 */
export async function refundEntrant(
  tx: Prisma.TransactionClient,
  t: Pick<Tournament, 'id' | 'entryFeeCoins'>,
  entrant: { id: string; userId: string },
  reason: RefundReason,
): Promise<boolean> {
  const removed = await tx.tournamentEntrant.deleteMany({ where: { id: entrant.id } });
  if (removed.count === 0) return false;
  if (t.entryFeeCoins > 0) {
    await creditCoins(tx, entrant.userId, t.entryFeeCoins);
    await tx.tournament.update({
      where: { id: t.id },
      data: { prizePoolCoins: { decrement: t.entryFeeCoins } },
    });
    await recordWagerTxn(tx, {
      recipientId: entrant.userId,
      amount: t.entryFeeCoins,
      entityType: 'tournament',
      entityId: t.id,
      note: REFUND_NOTES[reason],
      idempotencyKey: `tournament:entrant:${entrant.id}:${reason}`,
    });
  }
  return true;
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
  // Everything below runs inside one transaction that first claims the
  // REGISTRATION → LIVE transition (CAS). Two racing starts can no longer both
  // build a bracket, and the entrant list is read after the claim, so a
  // registration racing the start is either in the bracket or refused.
  //
  // With check-in on and its window open, the field is the checked-in entrants:
  // the rest are removed and refunded in this same transaction (after the claim,
  // so a failed claim refunds nobody), and a start with too few left throws
  // before the bracket is written, which rolls the claim and every refund back.
  // The per-tournament advisory lock serialises the start with check-ins and
  // settings changes, which take the same lock.
  const removedUserIds: string[] = [];
  // The method is read under the lock, so a change racing the start is either seen or refused.
  let seeding: string | undefined;
  const takeField = async (tx: Prisma.TransactionClient) => {
    const all = await tx.tournamentEntrant.findMany({
      where: { tournamentId: t.id },
      orderBy: { joinedAt: 'asc' },
    });
    const live = await tx.tournament.findUnique({
      where: { id: t.id },
      select: { startsAt: true, checkInMinutes: true, seeding: true },
    });
    seeding = live?.seeding;
    const now = new Date();
    const dropped = live ? noShows(live, all, now) : [];
    if (live && isCheckInOpen(live, now)) {
      const kept = all.length - dropped.length;
      const short = checkInShortfall(kept, t.minPlayers);
      if (short) {
        throw new TournamentError(
          `Only ${short.checkedIn} of the ${short.needed} players needed have checked in`,
          'TOO_FEW_CHECKED_IN',
          400,
          { ...short },
        );
      }
    }
    for (const e of dropped) {
      if (await refundEntrant(tx, t, e, 'no-show')) removedUserIds.push(e.userId);
    }
    const droppedIds = new Set(dropped.map((e) => e.id));
    return all.filter((e) => !droppedIds.has(e.id));
  };
  const claimStart = async (tx: Prisma.TransactionClient, extra: { swissRounds?: number }) => {
    const claimed = await tx.tournament.updateMany({
      where: { id: t.id, status: 'REGISTRATION' },
      data: { status: 'LIVE', startedAt: new Date(), ...extra },
    });
    if (claimed.count === 0) throw new TournamentError('Already started', 'STARTED', 409);
  };
  const assertEnough = (n: number) => {
    if (n < t.minPlayers) {
      throw new TournamentError('Not enough players to start', 'TOO_FEW', 400);
    }
  };

  if (t.format === 'SWISS') {
    await db.$transaction(async (tx) => {
      // Lock first (rounds are fixed after reading entrants, under the lock).
      await lockKey(tx, `tournament:${t.id}`);
      await claimStart(tx, {});
      const field = await takeField(tx);
      const entrants = await orderForStart(tx, { gameId: t.gameId, seeding }, field);
      assertEnough(entrants.length);
      const orderedIds = entrants.map((e) => e.id);
      const pairs = pairRound(orderedIds, []);
      if (!pairs) throw new TournamentError('Could not pair the first round', 'UNPAIRABLE', 400);
      for (let i = 0; i < entrants.length; i++) {
        await tx.tournamentEntrant.update({ where: { id: entrants[i].id }, data: { seed: i + 1 } });
      }
      await createSwissRound(tx, t.id, 1, pairs);
      await tx.tournament.update({
        where: { id: t.id },
        data: { swissRounds: Math.max(1, recommendedRounds(orderedIds.length)) },
      });
    });
    await notifyRemovedNoShows(t, removedUserIds);
    return;
  }

  await db.$transaction(async (tx) => {
    await lockKey(tx, `tournament:${t.id}`);
    await claimStart(tx, {});
    const field = await takeField(tx);
    const entrants = await orderForStart(tx, { gameId: t.gameId, seeding }, field);
    assertEnough(entrants.length);

    // Seed by the tournament's method (sign-up order unless the host chose
    // another), then build the bracket over entrant ids. Match ids
    // are minted here rather than discovered from the database, so the whole
    // bracket — including every nextMatchId link — is fully resolved before
    // anything is written (see resolveBracketRows).
    const orderedIds = entrants.map((e) => e.id);
    const bracket = generateBracket(t.format as 'SINGLE_ELIM' | 'DOUBLE_ELIM' | 'ROUND_ROBIN', orderedIds);
    const matchRows = resolveBracketRows(bracket.matches, randomUUID);

    // Assign seeds.
    for (let i = 0; i < entrants.length; i++) {
      await tx.tournamentEntrant.update({
        where: { id: entrants[i].id },
        data: { seed: i + 1 },
      });
    }

    // Persist matches in bulk. This used to be one INSERT per match followed by
    // one UPDATE per match to wire the winner-advances links, all awaited in
    // sequence inside this transaction. A round-robin is n(n-1)/2 matches, so at
    // the 64-player cap that was 2016 inserts plus their updates on a single
    // connection — comfortably past Prisma's default 5s interactive-transaction
    // timeout, i.e. starting a large tournament could not succeed at all.
    // Chunked so a very large bracket stays clear of Postgres' bind-parameter
    // ceiling (~65535 per statement, and each row binds 12).
    const CHUNK = 1000;
    for (let i = 0; i < matchRows.length; i += CHUNK) {
      await tx.tournamentMatch.createMany({
        data: matchRows.slice(i, i + CHUNK).map((m) => ({
          id: m.id,
          tournamentId: t.id,
          round: m.round,
          slot: m.slot,
          entrantAId: m.entrantAId,
          entrantBId: m.entrantBId,
          state: m.state === 'BYE' ? 'BYE' : m.state === 'READY' ? 'READY' : 'PENDING',
          nextMatchId: m.nextMatchId,
          nextSlot: m.nextSlot,
          bracket: m.bracket,
          loserNextMatchId: m.loserNextMatchId,
          loserNextSlot: m.loserNextSlot,
        })),
      });
    }
    // s07-06: the first round's matches are ready now; stamp their deadlines in the same transaction.
    await stampTournamentDeadlines(tx, t.id);
  });

  await notifyRemovedNoShows(t, removedUserIds);

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

/** Tell the entrants a start removed for not checking in (best-effort, after the commit that refunded them). */
async function notifyRemovedNoShows(
  t: Pick<Tournament, 'id' | 'name'>,
  userIds: readonly string[],
): Promise<void> {
  await Promise.allSettled(
    userIds.map((userId) =>
      createNotification({
        userId,
        type: 'SYSTEM',
        entityType: 'tournament_checkin',
        entityId: t.id,
        preview: notice('tournament-removed-no-checkin', { name: t.name }),
        link: `/tournaments/${t.id}`,
      }),
    ),
  );
}

/** Persist one Swiss round; a bye is recorded as an already-won match. */
async function createSwissRound(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  round: number,
  pairs: readonly Pairing[],
): Promise<void> {
  const now = new Date();
  await tx.tournamentMatch.createMany({
    data: pairs.map((p, slot) => ({
      tournamentId,
      round,
      slot,
      entrantAId: p.a,
      entrantBId: p.b,
      state: p.b === null ? ('COMPLETE' as const) : ('READY' as const),
      winnerEntrantId: p.b === null ? p.a : null,
      resultSource: p.b === null ? 'bye' : null,
      completedAt: p.b === null ? now : null,
    })),
  });
  // s07-06: every pairing of the round gets its deadline when the round is generated.
  await stampTournamentDeadlines(tx, tournamentId, { round });
  for (const p of pairs) {
    if (p.b === null) {
      await tx.tournamentEntrant.update({ where: { id: p.a }, data: { wins: { increment: 1 } } });
    }
  }
}

/**
 * After a Swiss match settles: if the round is finished, pair the next one
 * (server-side, from standings) or complete the event after the last round or
 * when no rematch-free pairing remains. Safe to race: the unique
 * (tournament, round, slot) index makes a duplicate next-round insert fail.
 */
async function advanceSwiss(tournamentId: string, db: Db): Promise<boolean> {
  const t = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!t || t.status !== 'LIVE' || t.format !== 'SWISS') return false;
  const matches = await db.tournamentMatch.findMany({ where: { tournamentId } });
  const current = Math.max(...matches.map((m) => m.round));
  if (matches.some((m) => m.round === current && m.state !== 'COMPLETE')) return false;

  const entrants = await db.tournamentEntrant.findMany({
    where: { tournamentId },
    orderBy: { seed: 'asc' },
    select: { id: true },
  });
  const ids = entrants.map((e) => e.id);
  const pairs = current < (t.swissRounds ?? 1) ? pairRound(ids, resultsFromRows(matches)) : null;
  if (pairs) {
    try {
      await db.$transaction((tx) => createSwissRound(tx, tournamentId, current + 1, pairs));
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err; // another request paired it
    }
    return false;
  }
  return maybeCompleteTournament(tournamentId, db);
}

// ─── Match settlement + bracket advance ─────────────────────────────────────

/** Put an entrant into one slot of a match; the match is READY once both slots are filled. */
async function fillSlot(
  tx: Prisma.TransactionClient,
  matchId: string,
  slot: number | null,
  entrantId: string,
): Promise<void> {
  const data = slot === 1 ? { entrantBId: entrantId } : { entrantAId: entrantId };
  await tx.tournamentMatch.update({ where: { id: matchId }, data });
  const next = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
  if (next && next.entrantAId && next.entrantBId && next.state === 'PENDING') {
    await tx.tournamentMatch.update({ where: { id: next.id }, data: { state: 'READY' } });
    // s07-06: the second entrant just arrived, so the match is ready: stamp its deadline.
    await stampDeadline(tx, next.id);
  }
}

async function advanceIntoNext(
  tx: Prisma.TransactionClient,
  match: TournamentMatch,
  winnerEntrantId: string,
  loserId: string | null,
): Promise<void> {
  if (match.nextMatchId) await fillSlot(tx, match.nextMatchId, match.nextSlot, winnerEntrantId);
  // Double elimination: a winners-bracket loser drops into the losers bracket.
  // A bye has no loser, so nothing is routed for one.
  if (match.loserNextMatchId && loserId) {
    await fillSlot(tx, match.loserNextMatchId, match.loserNextSlot, loserId);
  }
}

/**
 * Record a match winner and advance the bracket. Idempotent per match (a match
 * already COMPLETE is a no-op). When the final resolves, completes the
 * tournament and pays out. `source` is stored for audit ("admin"/"authoritative"
 * /"agreement"/"bye").
 */
export async function settleMatch(
  opts: {
    tournamentId: string;
    matchId: string;
    winnerEntrantId: string;
    source: string;
    /** Runs inside the settling transaction, only when this call is the one that settled (s07-06: the walkover's audit row). */
    inTx?: (tx: Prisma.TransactionClient) => Promise<void>;
  },
  db: Db = prisma,
): Promise<{ settled: boolean; tournamentComplete: boolean }> {
  const outcome = await db.$transaction(async (tx) => {
    const match = await tx.tournamentMatch.findUnique({ where: { id: opts.matchId } });
    if (!match || match.tournamentId !== opts.tournamentId) {
      throw new TournamentError('Match not found', 'NOT_FOUND', 404);
    }
    if (match.state === 'COMPLETE') return { settled: false, isFinal: false, swiss: false, round: 0, loserId: null, at: null };
    if (match.state === 'CANCELLED') throw matchCancelledError();
    const validEntrants = [match.entrantAId, match.entrantBId].filter(Boolean) as string[];
    if (!validEntrants.includes(opts.winnerEntrantId)) {
      throw new TournamentError('Winner must be in this match', 'BAD_WINNER', 400);
    }
    const loserId = validEntrants.find((e) => e !== opts.winnerEntrantId) ?? null;
    const tournament = await tx.tournament.findUnique({
      where: { id: opts.tournamentId },
      select: { format: true, status: true },
    });
    if (tournament?.status !== 'LIVE') {
      throw new TournamentError('Tournament is not live', 'NOT_LIVE', 409);
    }
    const settledAt = new Date();
    const swiss = tournament.format === 'SWISS';
    const double = tournament.format === 'DOUBLE_ELIM';
    // Double elimination: the winners champion's first grand-final loss is not an
    // elimination (the bracket reset follows) and nobody leaves from the winners
    // bracket; every other loss in every non-Swiss format does eliminate.
    const resetFollows =
      double && match.bracket === 'GF' && opts.winnerEntrantId === match.entrantBId;
    const eliminates = !swiss && !resetFollows && !(double && match.bracket === 'W');

    // CAS on "still open": a concurrent settle of the same match (two reports,
    // or a report racing the hub) sees count 0 and changes nothing, so
    // wins/losses and the bracket advance are applied exactly once. A match
    // closed by a cancel racing this settle is not open either.
    const claimed = await tx.tournamentMatch.updateMany({
      where: { id: match.id, state: { notIn: ['COMPLETE', 'CANCELLED'] } },
      data: {
        winnerEntrantId: opts.winnerEntrantId,
        state: 'COMPLETE',
        resultSource: opts.source.slice(0, 24),
        completedAt: settledAt,
        // s07-06: a settled match ignores scheduling; a live proposal goes with it.
        proposedAt: null,
        proposedById: null,
      },
    });
    if (claimed.count === 0) return { settled: false, isFinal: false, swiss: false, round: 0, loserId: null, at: null };
    if (opts.inTx) await opts.inTx(tx);
    await tx.tournamentEntrant.update({
      where: { id: opts.winnerEntrantId },
      data: { wins: { increment: 1 } },
    });
    if (loserId) {
      await tx.tournamentEntrant.update({
        where: { id: loserId },
        data: eliminates
          ? { losses: { increment: 1 }, eliminatedAt: new Date() }
          : { losses: { increment: 1 } },
      });
    }
    await advanceIntoNext(tx, match, opts.winnerEntrantId, loserId);
    if (resetFollows) {
      // The losers champion beat the winners champion: the same two play again,
      // and whoever wins that decides the tournament. Only the settle that won
      // the claim above gets here, so the reset is created once.
      const reset = await tx.tournamentMatch.create({
        data: {
          tournamentId: opts.tournamentId,
          round: match.round + 1,
          slot: 0,
          bracket: 'GR',
          entrantAId: match.entrantAId,
          entrantBId: match.entrantBId,
          state: 'READY',
        },
      });
      // s07-06: the reset match is ready as soon as it exists.
      await stampDeadline(tx, reset.id);
    }
    const isFinal = match.nextMatchId == null && !resetFollows;
    return { settled: true, isFinal, swiss, round: match.round, loserId, at: settledAt };
  });

  // After the settle committed (a rolled-back settle never gets here): one `tournament.match_settled` per
  // player, to that player's own endpoints. A bye has no loser and emits nothing. Never throws.
  if (outcome.settled && outcome.at) {
    await emitMatchSettled(db, {
      tournamentId: opts.tournamentId,
      matchId: opts.matchId,
      round: outcome.round,
      winnerEntrantId: opts.winnerEntrantId,
      loserEntrantId: outcome.loserId,
      settledAt: outcome.at,
    });
  }

  let tournamentComplete = false;
  if (outcome.settled && outcome.swiss) {
    tournamentComplete = await advanceSwiss(opts.tournamentId, db);
  } else if (outcome.settled && outcome.isFinal) {
    tournamentComplete = await maybeCompleteTournament(opts.tournamentId, db);
  } else if (outcome.settled) {
    // Round-robin has no "final" — check whether every match is decided.
    const t = await db.tournament.findUnique({ where: { id: opts.tournamentId } });
    if (t?.format === 'ROUND_ROBIN') {
      const remaining = await db.tournamentMatch.count({
        where: { tournamentId: opts.tournamentId, state: { not: 'COMPLETE' } },
      });
      if (remaining === 0)
        tournamentComplete = await maybeCompleteTournament(opts.tournamentId, db);
    }
  }
  return { settled: outcome.settled, tournamentComplete };
}

/** Compute placements + distribute the prize pool. Idempotent. */
async function maybeCompleteTournament(tournamentId: string, db: Db): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!t || t.status !== 'LIVE') return false;
    // Claim LIVE → COMPLETE before paying anything (CAS on the status and the
    // pool we are about to distribute). A cancelled tournament has already
    // refunded its pool and can never be completed; a concurrent completion or
    // cancel makes count 0 and this one pays nothing.
    const claimed = await tx.tournament.updateMany({
      where: { id: t.id, status: 'LIVE', prizePoolCoins: t.prizePoolCoins },
      data: { status: 'COMPLETE', completedAt: new Date(), prizePoolCoins: 0 },
    });
    if (claimed.count === 0) return false;

    const entrants = await tx.tournamentEntrant.findMany({ where: { tournamentId } });

    // Rank entrants: Swiss by standings (points, Buchholz, seed), round-robin
    // by wins; single-elim by last-eliminated + wins; double-elim by the final, then the
    // losers-bracket round each player fell in (rankDoubleElim).
    let ranked = [...entrants];
    let swissAmounts: Map<string, number> | null = null;
    if (t.format === 'DOUBLE_ELIM') {
      const matches = await tx.tournamentMatch.findMany({ where: { tournamentId } });
      const byId = new Map(entrants.map((e) => [e.id, e]));
      ranked = rankDoubleElim(entrants, matches).map((id) => byId.get(id)!);
    } else if (t.format === 'SWISS') {
      const matches = await tx.tournamentMatch.findMany({ where: { tournamentId } });
      const bySeed = [...entrants].sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
      const settlement = swissSettlement(
        bySeed.map((e) => e.id),
        matches,
        t.prizePoolCoins,
        t.rakeBps,
      );
      const byId = new Map(entrants.map((e) => [e.id, e]));
      ranked = settlement.map((x) => byId.get(x.entrantId)!);
      swissAmounts = new Map(settlement.map((x) => [x.entrantId, x.amount]));
    } else {
      ranked.sort((a, b) => {
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
    }

    const { payouts } = computePayouts(t.prizePoolCoins, t.rakeBps, ranked.length);

    for (let i = 0; i < ranked.length; i++) {
      const placement = i + 1;
      await tx.tournamentEntrant.update({
        where: { id: ranked[i].id },
        data: { placement },
      });
      const amount = swissAmounts ? (swissAmounts.get(ranked[i].id) ?? 0) : (payouts[i] ?? 0);
      if (amount > 0) {
        await creditCoins(tx, ranked[i].userId, amount);
        await recordWagerTxn(tx, {
          recipientId: ranked[i].userId,
          amount,
          entityType: 'tournament',
          entityId: t.id,
          note: `Tournament placement #${placement}`,
          idempotencyKey: `tournament:${t.id}:payout:${ranked[i].userId}`,
        });
        await tx.tournamentPayout.create({
          data: { tournamentId: t.id, userId: ranked[i].userId, placement, amountCoins: amount },
        });
      }
    }
    return true;
  });
}

/** Cancel a tournament, close its open matches, and refund all escrowed coins (fees + seed). */
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
    // Claim the terminal transition FIRST, then read entrants. Registration and
    // withdrawal CAS on REGISTRATION too, so once this commits no entrant can be
    // added or removed; and any that committed before it are visible to the
    // entrant read below (a fresh statement under READ COMMITTED). A racing
    // completion or second cancel makes count 0 and refunds nothing.
    const claimed = await tx.tournament.updateMany({
      where: { id: t.id, status: { in: ['REGISTRATION', 'LIVE'] } },
      data: { status: 'CANCELLED', prizePoolCoins: 0 },
    });
    if (claimed.count === 0) return;

    // Close every match still open. Nothing can settle or link them any more
    // (both require a LIVE tournament), so left alone they would sit in
    // PENDING/READY/LIVE forever and render as playable in the bracket.
    // COMPLETE and BYE rows keep their results.
    await tx.tournamentMatch.updateMany({
      where: { tournamentId: t.id, state: { in: ['PENDING', 'READY', 'LIVE'] } },
      // s07-06: a live time proposal goes with the match.
      data: { state: 'CANCELLED', proposedAt: null, proposedById: null },
    });

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
          idempotencyKey: `tournament:${t.id}:cancel-refund:${e.userId}`,
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
        idempotencyKey: `tournament:${t.id}:seed-refund`,
      });
    }
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
  // Only a playable match of a live tournament can go LIVE; never revive a
  // COMPLETE match (or one whose tournament was cancelled).
  const linked = await db.tournamentMatch.updateMany({
    where: {
      id: opts.matchId,
      state: { in: ['READY', 'LIVE'] },
      tournament: { status: 'LIVE' },
    },
    data: { gameSessionRef: opts.gameSessionRef, state: 'LIVE' },
  });
  if (linked.count === 0) {
    throw new TournamentError('Match is not ready', 'NOT_READY', 409);
  }
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
  swissRounds: number | null;
  playerCount: number;
  createdById: string;
  startsAt: string | null;
  /** Minutes before `startsAt` that check-in opens; null when the tournament has none. */
  checkInMinutes: number | null;
  /** When check-in opens (ISO), or null when there is none. */
  checkInOpensAt: string | null;
  /** How the field is seeded at the start: join, rating, random or manual. */
  seeding: string;
  /** s07-06: hours each match has once it is ready (24, 48, 72 or 168); null = no deadline. */
  matchDeadlineHours: number | null;
  createdAt: string;
  entrants?: {
    id: string;
    checkedIn: boolean;
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
    /** W winners, L losers, GF grand final, GR bracket reset (W for non-double-elimination formats). */
    bracket: string;
    loserNextMatchId: string | null;
    /** How a settled match was decided: agreement, admin (the host's report), authoritative or unanswered. */
    resultSource: string | null;
    /** Disputed matches read "Disputed" to everyone; the detail below is for the players, the host and admins. */
    disputed: boolean;
    /** The claim awaiting the opponent (players, host and admins only). */
    claimedWinnerId: string | null;
    claimedByUserId: string | null;
    claimedAt: string | null;
    disputedByUserId: string | null;
    disputeNote: string | null;
    /** s07-06: when the match must be played by (ISO), or null. */
    deadlineAt: string | null;
    /** s07-06: the agreed time (ISO), or null. */
    scheduledAt: string | null;
    /** s07-06: a live time proposal (players, host and admins only): the proposed instant and who proposed it. */
    proposedAt: string | null;
    proposedByUserId: string | null;
  }[];
  payouts?: { userId: string; placement: number; amountCoins: number }[];
  viewerEntered?: boolean;
  viewerCheckedIn?: boolean;
}

const LIST_INCLUDE = { _count: { select: { entrants: true } } } as const;

function serializeSummary(t: Tournament & { _count: { entrants: number } }): SerializedTournament {
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
    swissRounds: t.swissRounds,
    playerCount: t._count.entrants,
    createdById: t.createdById,
    startsAt: t.startsAt?.toISOString() ?? null,
    checkInMinutes: t.checkInMinutes,
    checkInOpensAt: checkInOpensAt(t)?.toISOString() ?? null,
    seeding: t.seeding,
    matchDeadlineHours: t.matchDeadlineHours,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function listTournaments(
  opts: { status?: 'REGISTRATION' | 'LIVE' | 'COMPLETE'; take?: number },
  db: Db = prisma,
): Promise<SerializedTournament[]> {
  const take = pageSize(opts.take, 30, 60);
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
  viewerIsAdmin = false,
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
      checkedIn: e.checkedInAt != null,
      seed: e.seed,
      placement: e.placement,
      wins: e.wins,
      losses: e.losses,
      user: e.user ? resolveUser(e.user) : null,
    })),
    matches: t.matches.map((m) => {
      const privileged =
        viewerIsAdmin ||
        (!!viewerId &&
          (t.createdById === viewerId ||
            [m.entrantAId, m.entrantBId].some(
              (id) => id != null && t.entrants.find((e) => e.id === id)?.userId === viewerId,
            )));
      return {
      id: m.id,
      round: m.round,
      slot: m.slot,
      entrantAId: m.entrantAId,
      entrantBId: m.entrantBId,
      winnerEntrantId: m.winnerEntrantId,
      state: m.state,
      bracket: m.bracket,
      loserNextMatchId: m.loserNextMatchId,
      resultSource: m.resultSource,
      disputed: m.disputedAt != null && m.state !== 'COMPLETE',
      claimedWinnerId: privileged && m.state !== 'COMPLETE' ? m.claimedWinnerId : null,
      claimedByUserId: privileged && m.state !== 'COMPLETE' ? m.claimedById : null,
      claimedAt: privileged && m.state !== 'COMPLETE' ? (m.claimedAt?.toISOString() ?? null) : null,
      disputedByUserId: privileged && m.state !== 'COMPLETE' ? m.disputedById : null,
      disputeNote: privileged && m.state !== 'COMPLETE' ? m.disputeNote : null,
      deadlineAt: m.deadlineAt?.toISOString() ?? null,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      proposedAt: privileged && m.state !== 'COMPLETE' ? (m.proposedAt?.toISOString() ?? null) : null,
      proposedByUserId: privileged && m.state !== 'COMPLETE' ? m.proposedById : null,
      };
    }),
    payouts: t.payouts.map((p) => ({
      userId: p.userId,
      placement: p.placement,
      amountCoins: p.amountCoins,
    })),
    viewerEntered: viewerId ? t.entrants.some((e) => e.userId === viewerId) : false,
    viewerCheckedIn: viewerId
      ? t.entrants.some((e) => e.userId === viewerId && e.checkedInAt != null)
      : false,
  };
}

/** Notify entrants when a tournament goes live (best-effort). */
export async function notifyTournamentStarted(
  tournamentId: string,
  db: Db = prisma,
): Promise<void> {
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
        preview: notice('tournament-started', { name: t.name }),
        link: `/tournaments/${tournamentId}`,
      }),
    ),
  );
}
