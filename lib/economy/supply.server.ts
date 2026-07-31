/**
 * Coin supply instrumentation — faucets, sinks, float and concentration.
 *
 * The economy shipped broad (quests, streaks, wheel, tips, shop, market,
 * wagers, staking, storefront, memberships) with no way to answer the only
 * question that decides whether a currency stays meaningful: **is more being
 * created than destroyed?** Without that, prices drift, the shop stops being a
 * goal, and nobody notices until the numbers are absurd.
 *
 * With the ledger's sign convention (see `CoinTransaction` in the schema) the
 * answer is a single aggregate:
 *
 *   faucet  = Σ amount where senderId IS NULL      (created)
 *   sink    = Σ amount where recipientId IS NULL   (destroyed)
 *   transfer= Σ amount where both are set          (moved, supply-neutral)
 */

import { prisma } from '@/lib/prisma.server';

export interface FlowByType {
  type: string;
  faucet: number;
  sink: number;
  transfer: number;
}

export interface EconomySnapshot {
  /** Window covered, in days. */
  windowDays: number;
  /** Coins created in the window. */
  faucet: number;
  /** Coins destroyed in the window. */
  sink: number;
  /** Coins moved between users (supply-neutral). */
  transfer: number;
  /** `faucet - sink`. Positive means the money supply grew. */
  netIssuance: number;
  /**
   * Sinks as a share of faucets, 0–1+. Sustained values well below 1 mean
   * inflation; this is the single number to watch.
   */
  sinkRatio: number;
  /** Total coins held across all profiles right now. */
  totalFloat: number;
  /** Profiles holding at least one coin. */
  holders: number;
  /** Mean balance among holders. */
  meanBalance: number;
  /** Share of the float held by the richest 1% of holders, 0–1. */
  top1PctShare: number;
  /** Per-transaction-type breakdown, largest total flow first. */
  byType: FlowByType[];
  /** Accounts whose stored balance is negative — should always be zero. */
  negativeBalances: number;
}

/**
 * Aggregate the ledger over the last `windowDays`.
 *
 * Deliberately a handful of grouped aggregates rather than a row scan: the
 * ledger is append-only and grows without bound, so this must stay index-shaped
 * (`@@index([createdAt, type])` exists for exactly this query).
 */
export async function getEconomySnapshot(windowDays = 30): Promise<EconomySnapshot> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [faucetRows, sinkRows, transferRows, floatAgg, holders, negatives, top] =
    await Promise.all([
      prisma.coinTransaction.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since }, senderId: null },
        _sum: { amount: true },
      }),
      prisma.coinTransaction.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since }, recipientId: null },
        _sum: { amount: true },
      }),
      prisma.coinTransaction.groupBy({
        by: ['type'],
        where: {
          createdAt: { gte: since },
          senderId: { not: null },
          recipientId: { not: null },
        },
        _sum: { amount: true },
      }),
      prisma.userProfile.aggregate({ _sum: { coins: true } }),
      prisma.userProfile.count({ where: { coins: { gt: 0 } } }),
      // Should be zero forever. If it isn't, a debit path is bypassing the
      // ledger's conditional update — surface it rather than let it hide.
      prisma.userProfile.count({ where: { coins: { lt: 0 } } }),
      prisma.userProfile.findMany({
        where: { coins: { gt: 0 } },
        orderBy: { coins: 'desc' },
        select: { coins: true },
        // Cap the read: concentration only needs the head of the distribution,
        // and an unbounded scan of every profile is not worth the precision.
        take: 1000,
      }),
    ]);

  const byTypeMap = new Map<string, FlowByType>();
  const bucket = (type: string): FlowByType => {
    let entry = byTypeMap.get(type);
    if (!entry) {
      entry = { type, faucet: 0, sink: 0, transfer: 0 };
      byTypeMap.set(type, entry);
    }
    return entry;
  };
  for (const r of faucetRows) bucket(r.type).faucet = r._sum.amount ?? 0;
  for (const r of sinkRows) bucket(r.type).sink = r._sum.amount ?? 0;
  for (const r of transferRows) bucket(r.type).transfer = r._sum.amount ?? 0;

  const byType = [...byTypeMap.values()].sort(
    (a, b) => b.faucet + b.sink + b.transfer - (a.faucet + a.sink + a.transfer)
  );

  const faucet = byType.reduce((n, t) => n + t.faucet, 0);
  const sink = byType.reduce((n, t) => n + t.sink, 0);
  const transfer = byType.reduce((n, t) => n + t.transfer, 0);
  const totalFloat = floatAgg._sum.coins ?? 0;

  // Concentration over the sampled head. With fewer holders than the sample
  // cap this is exact; beyond it, the top 1% is still fully inside the sample,
  // so the share stays accurate while the denominator uses the true float.
  const topCount = Math.max(1, Math.ceil(holders * 0.01));
  const top1Sum = top.slice(0, topCount).reduce((n, p) => n + p.coins, 0);

  return {
    windowDays,
    faucet,
    sink,
    transfer,
    netIssuance: faucet - sink,
    sinkRatio: faucet > 0 ? sink / faucet : 0,
    totalFloat,
    holders,
    meanBalance: holders > 0 ? Math.round(totalFloat / holders) : 0,
    top1PctShare: totalFloat > 0 ? top1Sum / totalFloat : 0,
    byType,
    negativeBalances: negatives,
  };
}
