/**
 * Prediction-market server logic — trading, moderation, and resolution.
 *
 * Markets are priced by an LMSR market maker (see `./lmsr`). Coins are the
 * shared virtual currency on `UserProfile.coins` (same balance used by the
 * casino games and tips). A trade debits coins and credits the user with
 * fractional shares; at resolution each winning share pays back 1 coin.
 *
 * Server-only (`.server.ts`) — reuses the singleton Prisma client.
 */

import type { Prediction, PredictionPosition, PredictionStatus, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { creditCoins, debitCoins, getBalance, InsufficientFundsError } from '@/lib/economy/ledger.server';
import type { ErrorCode } from '@/lib/errors/codes';
import { priceYes, proceedsForShares, sharesForBudget, type Side } from './lmsr';

/**
 * Lets the standalone bot-worker pass its own client (it doesn't share the
 * singleton pool) while API routes default to the singleton.
 */
type Db = PrismaClient;

export class PredictionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
    /** A taxonomy code (`lib/errors/codes.ts`) the route answers with, for a sentence in the reader's language. */
    readonly refusal?: ErrorCode,
  ) {
    super(message);
  }
}

/** Shape sent to clients for a single market. */
export interface SerializedMarket {
  id: string;
  title: string;
  description: string | null;
  status: PredictionStatus;
  isAiGenerated: boolean;
  /** True for self-referential markets that resolve from the platform's own data. */
  isAuto: boolean;
  /** In-app deep link to what an auto market is about (build, tournament, …). */
  subjectUrl: string | null;
  yesPercent: number; // 1..99 implied probability
  /** Public LMSR state, already implied by the price; the card quotes a trade from it. */
  qYes: number;
  qNo: number;
  b: number;
  volume: number;
  closesAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  creator: { id: string; name: string | null; handle: string | null; image: string | null } | null;
  // Present only when a viewer is supplied and holds a position.
  position: { yesShares: number; noShares: number; spent: number; received: number; settled: boolean } | null;
}

type CreatorRel = {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
} | null;

export function serializeMarket(
  p: Prediction & { creator?: CreatorRel; positions?: PredictionPosition[] },
  viewerId?: string,
): SerializedMarket {
  const pos = viewerId ? p.positions?.find((x) => x.userId === viewerId) ?? null : null;
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    isAiGenerated: p.isAiGenerated,
    isAuto: p.resolverKey != null,
    subjectUrl: p.subjectUrl ?? null,
    yesPercent: Math.min(99, Math.max(1, Math.round(priceYes(p.qYes, p.qNo, p.b) * 100))),
    qYes: p.qYes,
    qNo: p.qNo,
    b: p.b,
    volume: p.volume,
    closesAt: p.closesAt?.toISOString() ?? null,
    resolvedAt: p.resolvedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    creator: p.creator ?? null,
    position: pos
      ? {
          yesShares: pos.yesShares,
          noShares: pos.noShares,
          spent: pos.spent,
          received: pos.received,
          settled: pos.settled,
        }
      : null,
  };
}

const CREATOR_SELECT = {
  select: { id: true, name: true, handle: true, image: true },
} as const;

/**
 * Place a YES/NO trade of `amount` coins on a market. Atomic: validates state +
 * balance, debits coins, mints LMSR shares into the user's position, and bumps
 * the market's share quantities and volume.
 */
export async function placeTrade(
  opts: {
    userId: string;
    predictionId: string;
    side: Side;
    amount: number;
    /** Refuse (`PREDICTION_PRICE_MOVED`) a trade that would buy fewer shares. Bots omit it. */
    minShares?: number;
  },
  db: Db = prisma,
): Promise<{ market: SerializedMarket; sharesBought: number; newBalance: number }> {
  const { userId, predictionId, side, amount, minShares } = opts;
  if (amount <= 0) throw new PredictionError('Invalid amount', 'INVALID_AMOUNT');

  return db.$transaction(async (tx) => {
    const seen = await tx.prediction.findUnique({ where: { id: predictionId } });
    if (!seen) throw new PredictionError('Market not found', 'NOT_FOUND', 404);
    if (seen.status !== 'OPEN') {
      throw new PredictionError('Market is not open for trading', 'NOT_OPEN');
    }
    if (seen.closesAt && seen.closesAt.getTime() <= Date.now()) {
      throw new PredictionError('Trading has closed for this market', 'CLOSED');
    }

    // The guard: a conditional write on OPEN, done before any money moves. It
    // row-locks the market until this trade commits, so a resolution racing it
    // either already flipped the status (count 0 — no shares bought on a
    // resolved market, which would debit and never pay) or waits for us and
    // then sees this position when it pays out. Concurrent trades serialise on
    // the same lock, and the re-read below prices against the current q.
    const locked = await tx.prediction.updateMany({
      where: { id: predictionId, status: 'OPEN' },
      data: { volume: { increment: amount } },
    });
    if (locked.count === 0) {
      throw new PredictionError('Market is not open for trading', 'NOT_OPEN');
    }
    const market = await tx.prediction.findUniqueOrThrow({ where: { id: predictionId } });

    await tx.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 },
      update: {},
    });

    const shares = sharesForBudget(market.qYes, market.qNo, market.b, side, amount);
    if (!Number.isFinite(shares) || shares <= 0) {
      throw new PredictionError('Trade too small', 'TRADE_TOO_SMALL');
    }
    if (minShares != null && shares < minShares) {
      throw new PredictionError('Price moved', 'PRICE_MOVED', 409, 'PREDICTION_PRICE_MOVED');
    }

    // Atomic conditional debit instead of writing an absolute precomputed balance:
    // `coins >= amount` in the WHERE clause serializes concurrent trades so they
    // cannot all deduct one stake yet each record a position (coin minting on
    // resolution). Prisma returns the updated row so we read the fresh balance.
    try {
      await debitCoins(userId, amount, {
        tx,
        type: 'WAGER',
        entityType: 'prediction',
        entityId: predictionId,
        note: `${side} position`,
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        throw new PredictionError('Insufficient coins', 'INSUFFICIENT_COINS');
      }
      throw err;
    }
    const newBalance = await getBalance(userId, tx);

    await tx.prediction.update({
      where: { id: predictionId },
      data: {
        qYes: side === 'YES' ? { increment: shares } : undefined,
        qNo: side === 'NO' ? { increment: shares } : undefined,
      },
    });

    // Forecast snapshot for season/calibration scoring: P(YES) right after this trade.
    const lastP = priceYes(
      market.qYes + (side === 'YES' ? shares : 0),
      market.qNo + (side === 'NO' ? shares : 0),
      market.b,
    );
    await tx.predictionPosition.upsert({
      where: { predictionId_userId: { predictionId, userId } },
      create: {
        lastP,
        predictionId,
        userId,
        yesShares: side === 'YES' ? shares : 0,
        noShares: side === 'NO' ? shares : 0,
        spent: amount,
      },
      update: {
        lastP,
        yesShares: side === 'YES' ? { increment: shares } : undefined,
        noShares: side === 'NO' ? { increment: shares } : undefined,
        spent: { increment: amount },
      },
    });

    const updated = await tx.prediction.findUniqueOrThrow({
      where: { id: predictionId },
      include: { creator: CREATOR_SELECT, positions: { where: { userId } } },
    });

    return {
      market: serializeMarket(updated, userId),
      sharesBought: shares,
      newBalance,
    };
  });
}

/** Fractional holdings: a sale may exceed the holding by this much and is clamped to it. */
const SHARE_EPSILON = 1e-9;

/**
 * Sell `shares` of `side` back to the market maker before it resolves. One
 * transaction, in this order: the member-scoped replay check (before any write),
 * the OPEN guard that row-locks the market, then the market's q and the member's
 * position read AFTER the lock, the proceeds (rounded down), and the writes —
 * the position's conditional decrement, the market's q lowered by the shares
 * sold, and the credit. Selling is not gated by the responsible-play checks.
 */
export async function sellShares(
  opts: {
    userId: string;
    predictionId: string;
    side: Side;
    shares: number;
    minProceeds: number;
    key: string;
  },
  db: Db = prisma,
): Promise<{
  market: SerializedMarket;
  sharesSold: number;
  proceeds: number;
  newBalance: number;
  replayed: boolean;
}> {
  const { userId, predictionId, side, shares: requested, minProceeds, key } = opts;
  if (!Number.isFinite(requested) || requested <= 0) throw new PredictionError('Invalid amount', 'INVALID_AMOUNT');
  const idempotencyKey = `prediction-sale:${predictionId}:${userId}:${key}`;

  return db.$transaction(async (tx) => {
    const view = () =>
      tx.prediction.findUniqueOrThrow({
        where: { id: predictionId },
        include: { creator: CREATOR_SELECT, positions: { where: { userId } } },
      });

    // 1. Replay: the key is scoped to the member and checked before anything is written.
    const replay = async () => {
      const prior = await tx.coinTransaction.findUnique({
        where: { idempotencyKey },
        select: { amount: true },
      });
      if (!prior) return null;
      return {
        market: serializeMarket(await view(), userId),
        sharesSold: 0,
        proceeds: Number(prior.amount),
        newBalance: await getBalance(userId, tx),
        replayed: true,
      };
    };
    const early = await replay();
    if (early) return early;

    // 2. The same guards and row lock as a trade.
    const seen = await tx.prediction.findUnique({ where: { id: predictionId } });
    if (!seen) throw new PredictionError('Market not found', 'NOT_FOUND', 404);
    if (seen.status !== 'OPEN') throw new PredictionError('Market is not open for trading', 'NOT_OPEN');
    if (seen.closesAt && seen.closesAt.getTime() <= Date.now()) {
      throw new PredictionError('Trading has closed for this market', 'CLOSED');
    }
    // The row lock: this write holds the market until the sale commits, so it queues behind every trade,
    // sale and resolution on it, and what is read next is current.
    const locked = await tx.prediction.updateMany({
      where: { id: predictionId, status: 'OPEN' },
      data: { volume: { increment: 0 } },
    });
    // A retry with the same key that queued behind the original: the original committed while this one
    // waited for the lock, so the check above missed it. Look again now — otherwise this sale would take
    // the shares a second time and the ledger, finding the key, would credit nothing for them.
    const late = await replay();
    if (late) return late;
    if (locked.count === 0) throw new PredictionError('Market is not open for trading', 'NOT_OPEN');

    // 3. q and the position are read only now, under the lock.
    const market = await tx.prediction.findUniqueOrThrow({ where: { id: predictionId } });
    const position = await tx.predictionPosition.findUnique({
      where: { predictionId_userId: { predictionId, userId } },
    });
    const held = position ? (side === 'YES' ? position.yesShares : position.noShares) : 0;
    if (!position || requested > held + SHARE_EPSILON) {
      throw new PredictionError('Not enough shares', 'NOT_ENOUGH_SHARES', 409, 'PREDICTION_NOT_ENOUGH_SHARES');
    }
    const shares = Math.min(requested, held);

    // 4. Proceeds, rounded down.
    const proceeds = proceedsForShares(market.qYes, market.qNo, market.b, side, shares);
    if (proceeds < 1) throw new PredictionError('Trade too small', 'TRADE_TOO_SMALL');
    if (proceeds < minProceeds) {
      throw new PredictionError('Price moved', 'PRICE_MOVED', 409, 'PREDICTION_PRICE_MOVED');
    }

    // 5. Writes. The position first, by a conditional decrement; zero rows means someone sold it already.
    const lastP = priceYes(
      market.qYes - (side === 'YES' ? shares : 0),
      market.qNo - (side === 'NO' ? shares : 0),
      market.b,
    );
    const moved = await tx.predictionPosition.updateMany({
      where: {
        id: position.id,
        ...(side === 'YES' ? { yesShares: { gte: shares } } : { noShares: { gte: shares } }),
      },
      data: {
        ...(side === 'YES' ? { yesShares: { decrement: shares } } : { noShares: { decrement: shares } }),
        received: { increment: proceeds },
        lastP,
      },
    });
    if (moved.count === 0) {
      throw new PredictionError('Not enough shares', 'NOT_ENOUGH_SHARES', 409, 'PREDICTION_NOT_ENOUGH_SHARES');
    }
    // The shares leave the market's books too; skipping this would pay the next seller for them again.
    await tx.prediction.update({
      where: { id: predictionId },
      data: side === 'YES' ? { qYes: { decrement: shares } } : { qNo: { decrement: shares } },
    });
    // A unique-key race on the credit rethrows here, inside this transaction, so the whole sale rolls back.
    const credit = await creditCoins(userId, proceeds, {
      tx,
      type: 'WAGER',
      entityType: 'prediction',
      entityId: predictionId,
      note: `${side} shares sold`,
      idempotencyKey,
    });
    // Inside a caller's transaction the ledger answers a key it already holds with `applied: false` and
    // credits nothing. The shares must not leave the position unpaid, so undo the whole sale.
    if (!credit.applied) throw new PredictionError('Sale already recorded', 'REPLAYED', 409);

    return {
      market: serializeMarket(await view(), userId),
      sharesSold: shares,
      proceeds,
      newBalance: await getBalance(userId, tx),
      replayed: false,
    };
  });
}

/** The member's positions for the account export: market title, shares, coins in and out, settled. */
export async function exportPredictionPositions(userId: string) {
  const rows = await prisma.predictionPosition.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { prediction: { select: { title: true, status: true } } },
  });
  return rows.map((r) => ({
    predictionId: r.predictionId,
    marketTitle: r.prediction.title,
    marketStatus: r.prediction.status,
    yesShares: r.yesShares,
    noShares: r.noShares,
    spent: r.spent,
    received: r.received,
    settled: r.settled,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Resolve a market to YES or NO and pay out. Idempotent — a no-op if the market
 * is already resolved. Each position's winning shares are credited back as
 * (rounded) coins; the losing side gets nothing.
 */
export async function resolvePrediction(
  opts: {
    predictionId: string;
    outcome: Side;
  },
  db: Db = prisma,
): Promise<{ resolved: boolean; payouts: number }> {
  const { predictionId, outcome } = opts;
  return db.$transaction(async (tx) => {
    const market = await tx.prediction.findUnique({ where: { id: predictionId } });
    if (!market) throw new PredictionError('Market not found', 'NOT_FOUND', 404);
    if (market.status === 'RESOLVED_YES' || market.status === 'RESOLVED_NO') {
      return { resolved: false, payouts: 0 };
    }
    if (market.status !== 'OPEN') {
      throw new PredictionError('Only open markets can be resolved', 'NOT_OPEN');
    }

    // Claim OPEN → RESOLVED_* first (CAS). Two racing resolutions (even YES vs
    // NO) cannot both pay: the loser sees count 0. A trade holding the row
    // lock commits first, and the positions read below — a fresh statement —
    // includes it.
    const claimed = await tx.prediction.updateMany({
      where: { id: predictionId, status: 'OPEN' },
      data: {
        status: outcome === 'YES' ? 'RESOLVED_YES' : 'RESOLVED_NO',
        resolvedAt: new Date(),
      },
    });
    if (claimed.count === 0) return { resolved: false, payouts: 0 };

    const positions = await tx.predictionPosition.findMany({ where: { predictionId } });
    let totalPayout = 0;
    for (const pos of positions) {
      const winningShares = outcome === 'YES' ? pos.yesShares : pos.noShares;
      const payout = Math.round(winningShares);
      if (payout > 0) {
        totalPayout += payout;
        // A market resolves once, so (position, outcome) is a stable dedupe
        // key — a retried resolution can never pay a winner twice.
        await creditCoins(pos.userId, payout, {
          tx,
          type: 'WAGER',
          entityType: 'prediction',
          entityId: predictionId,
          note: 'Prediction payout',
          idempotencyKey: `prediction-payout:${pos.id}`,
        });
      }
      await tx.predictionPosition.update({ where: { id: pos.id }, data: { settled: true } });
    }

    return { resolved: true, payouts: totalPayout };
  });
}

/** Approve (PENDING → OPEN) or deny (PENDING → DENIED) a submitted market. */
export async function moderatePrediction(opts: {
  predictionId: string;
  approve: boolean;
}): Promise<Prediction> {
  const market = await prisma.prediction.findUnique({ where: { id: opts.predictionId } });
  if (!market) throw new PredictionError('Market not found', 'NOT_FOUND', 404);
  if (market.status !== 'PENDING') {
    throw new PredictionError('Only pending markets can be moderated', 'NOT_PENDING');
  }
  const { count } = await prisma.prediction.updateMany({
    where: { id: opts.predictionId, status: 'PENDING' },
    data: { status: opts.approve ? 'OPEN' : 'DENIED' },
  });
  if (count === 0) {
    throw new PredictionError('Only pending markets can be moderated', 'NOT_PENDING');
  }
  return prisma.prediction.findUniqueOrThrow({ where: { id: opts.predictionId } });
}

/** Fetch + serialize a list of markets for the client. */
export async function listMarkets(opts: {
  statuses: PredictionStatus[];
  viewerId?: string;
  take?: number;
}): Promise<SerializedMarket[]> {
  const rows = await prisma.prediction.findMany({
    where: { status: { in: opts.statuses } },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 60,
    include: {
      creator: CREATOR_SELECT,
      positions: opts.viewerId ? { where: { userId: opts.viewerId } } : false,
    },
  });
  return rows.map((r) => serializeMarket(r, opts.viewerId));
}
