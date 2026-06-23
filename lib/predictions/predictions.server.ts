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
import { priceYes, sharesForBudget, costToBuyShares, type Side } from './lmsr';

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
  yesPercent: number; // 1..99 implied probability
  volume: number;
  closesAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  creator: { id: string; name: string | null; handle: string | null; image: string | null } | null;
  // Present only when a viewer is supplied and holds a position.
  position: { yesShares: number; noShares: number; spent: number; settled: boolean } | null;
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
    yesPercent: Math.min(99, Math.max(1, Math.round(priceYes(p.qYes, p.qNo, p.b) * 100))),
    volume: p.volume,
    closesAt: p.closesAt?.toISOString() ?? null,
    resolvedAt: p.resolvedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    creator: p.creator ?? null,
    position: pos
      ? { yesShares: pos.yesShares, noShares: pos.noShares, spent: pos.spent, settled: pos.settled }
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
  },
  db: Db = prisma,
): Promise<{ market: SerializedMarket; sharesBought: number; newBalance: number }> {
  const { userId, predictionId, side, amount } = opts;
  if (amount <= 0) throw new PredictionError('Invalid amount', 'INVALID_AMOUNT');

  return db.$transaction(async (tx) => {
    const market = await tx.prediction.findUnique({ where: { id: predictionId } });
    if (!market) throw new PredictionError('Market not found', 'NOT_FOUND', 404);
    if (market.status !== 'OPEN') {
      throw new PredictionError('Market is not open for trading', 'NOT_OPEN');
    }
    if (market.closesAt && market.closesAt.getTime() <= Date.now()) {
      throw new PredictionError('Trading has closed for this market', 'CLOSED');
    }

    const profile = await tx.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 },
      update: {},
      select: { coins: true },
    });
    if (profile.coins < amount) {
      throw new PredictionError('Insufficient coins', 'INSUFFICIENT_COINS');
    }

    const shares = sharesForBudget(market.qYes, market.qNo, market.b, side, amount);
    if (!Number.isFinite(shares) || shares <= 0) {
      throw new PredictionError('Trade too small', 'TRADE_TOO_SMALL');
    }

    const newBalance = profile.coins - amount;
    await tx.userProfile.update({ where: { userId }, data: { coins: newBalance } });

    await tx.prediction.update({
      where: { id: predictionId },
      data: {
        qYes: side === 'YES' ? { increment: shares } : undefined,
        qNo: side === 'NO' ? { increment: shares } : undefined,
        volume: { increment: amount },
      },
    });

    await tx.predictionPosition.upsert({
      where: { predictionId_userId: { predictionId, userId } },
      create: {
        predictionId,
        userId,
        yesShares: side === 'YES' ? shares : 0,
        noShares: side === 'NO' ? shares : 0,
        spent: amount,
      },
      update: {
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

/** Estimate (without trading) how a coin `amount` would land on a market. */
export function quoteTrade(market: Pick<Prediction, 'qYes' | 'qNo' | 'b'>, side: Side, amount: number) {
  const shares = sharesForBudget(market.qYes, market.qNo, market.b, side, amount);
  const cost = costToBuyShares(market.qYes, market.qNo, market.b, side, shares);
  return { shares, cost };
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

    const positions = await tx.predictionPosition.findMany({ where: { predictionId } });
    let totalPayout = 0;
    for (const pos of positions) {
      const winningShares = outcome === 'YES' ? pos.yesShares : pos.noShares;
      const payout = Math.round(winningShares);
      if (payout > 0) {
        totalPayout += payout;
        await tx.userProfile.upsert({
          where: { userId: pos.userId },
          create: { userId: pos.userId, coins: 10 + payout },
          update: { coins: { increment: payout } },
        });
      }
      await tx.predictionPosition.update({ where: { id: pos.id }, data: { settled: true } });
    }

    await tx.prediction.update({
      where: { id: predictionId },
      data: {
        status: outcome === 'YES' ? 'RESOLVED_YES' : 'RESOLVED_NO',
        resolvedAt: new Date(),
      },
    });

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
  return prisma.prediction.update({
    where: { id: opts.predictionId },
    data: { status: opts.approve ? 'OPEN' : 'DENIED' },
  });
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
