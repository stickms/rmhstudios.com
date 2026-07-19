/**
 * Creator Studio — dashboard read model (platform-expansion §3).
 *
 * `getStudioOverview` assembles everything the /creator-studio Overview needs:
 * the derived earnings figures (reused verbatim from
 * `lib/creator/earnings.server.ts` — NOT reimplemented), a per-source split and
 * monthly breakdown over the recent window, the active supporter count, the
 * creator's tiers, and their most recent tips. Read-only; no ledger writes.
 */

import { prisma } from '@/lib/prisma.server';
import { getCreatorEarnings } from '@/lib/creator/earnings.server';
import { listTiers, type SerializedTier } from '@/lib/creator/tiers.server';

/** Months of history shown in the dashboard breakdown. */
const MONTHS = 6;

// "Sales" mirrors the earned-PURCHASE entity types in earnings.server.ts
// (storefront / paywalled-post / build unlocks). Kept in sync locally rather
// than importing that module's private constant.
const SALES_ENTITY_TYPES = ['storefront', 'rmhark', 'build'];

export interface MonthlyEarnings {
  /** `YYYY-MM` (UTC). */
  month: string;
  tips: number;
  memberships: number;
  sales: number;
  total: number;
}

export interface RecentTip {
  id: string;
  amount: number;
  note: string | null;
  createdAt: string;
  sender: { id: string; name: string | null; handle: string | null; image: string | null } | null;
}

export interface StudioOverview {
  earnings: {
    lifetimeEarned: number;
    redeemed: number;
    redeemable: number;
    spendable: number;
  };
  /** All-in totals over the window, by source. */
  bySource: { tips: number; memberships: number; sales: number };
  monthly: MonthlyEarnings[];
  supporterCount: number;
  tiers: SerializedTier[];
  recentTips: RecentTip[];
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getStudioOverview(creatorId: string): Promise<StudioOverview> {
  const now = new Date();
  // First day of the earliest month in the window (UTC).
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));

  const [earnings, tiers, supporterCount, windowTxns, recentTipRows] = await Promise.all([
    getCreatorEarnings(creatorId),
    listTiers(creatorId),
    prisma.creatorMembership.count({ where: { creatorId, expiresAt: { gt: now } } }),
    prisma.coinTransaction.findMany({
      where: {
        recipientId: creatorId,
        amount: { gt: 0 },
        createdAt: { gte: windowStart },
        OR: [
          { type: { in: ['TIP', 'MEMBERSHIP'] } },
          { type: 'PURCHASE', entityType: { in: SALES_ENTITY_TYPES } },
        ],
      },
      select: { amount: true, type: true, createdAt: true },
    }),
    prisma.coinTransaction.findMany({
      where: { recipientId: creatorId, type: 'TIP', amount: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        amount: true,
        note: true,
        createdAt: true,
        sender: { select: { id: true, name: true, handle: true, image: true } },
      },
    }),
  ]);

  // Seed one bucket per month so the chart is contiguous even in dry months.
  const buckets = new Map<string, MonthlyEarnings>();
  for (let i = 0; i < MONTHS; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1) + i, 1));
    const key = monthKey(d);
    buckets.set(key, { month: key, tips: 0, memberships: 0, sales: 0, total: 0 });
  }

  const bySource = { tips: 0, memberships: 0, sales: 0 };
  for (const tx of windowTxns) {
    const kind: keyof typeof bySource =
      tx.type === 'TIP' ? 'tips' : tx.type === 'MEMBERSHIP' ? 'memberships' : 'sales';
    bySource[kind] += tx.amount;
    const bucket = buckets.get(monthKey(tx.createdAt));
    if (bucket) {
      bucket[kind] += tx.amount;
      bucket.total += tx.amount;
    }
  }

  const recentTips: RecentTip[] = recentTipRows.map((r) => ({
    id: r.id,
    amount: r.amount,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    sender: r.sender
      ? { id: r.sender.id, name: r.sender.name, handle: r.sender.handle, image: r.sender.image }
      : null,
  }));

  return {
    earnings: {
      lifetimeEarned: earnings.lifetimeEarned,
      redeemed: earnings.redeemed,
      redeemable: earnings.redeemable,
      spendable: earnings.spendable,
    },
    bySource,
    monthly: Array.from(buckets.values()),
    supporterCount,
    tiers,
    recentTips,
  };
}
