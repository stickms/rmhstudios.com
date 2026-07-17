/**
 * Coin-funded gift memberships (#18). A user spends coins to grant another
 * user a membership tier for N months. These are independent of Stripe billing
 * and folded into getUserTier via an active-grant lookup.
 */

import { prisma } from '@/lib/prisma.server';
import { invalidateUserTier, type Tier } from '@/lib/entitlements';

export type GiftableTier = 'starter' | 'pro';

// Coins per month per tier.
export const GIFT_PRICES: Record<GiftableTier, number> = {
  starter: 600,
  pro: 1800,
};

export const GIFT_TIER_LABELS: Record<GiftableTier, string> = {
  starter: 'Starter',
  pro: 'Pro',
};

export class GiftError extends Error {}

/** Highest active gifted tier for a user (expiresAt in the future), or null. */
export async function activeGiftTier(userId: string): Promise<Tier | null> {
  const grants = await prisma.giftMembership.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    select: { tier: true },
  });
  let best: Tier | null = null;
  for (const g of grants) {
    if (g.tier === 'pro') return 'pro';
    if (g.tier === 'starter') best = 'starter';
  }
  return best;
}

/**
 * Gift `months` of `tier` to `recipientId`, charging the gifter coins. Extends
 * an existing active grant of the same tier rather than stacking.
 */
export async function giftMembership(params: {
  gifterId: string;
  recipientId: string;
  tier: GiftableTier;
  months: number;
}): Promise<{ expiresAt: Date; cost: number }> {
  const { gifterId, recipientId, tier, months } = params;
  if (gifterId === recipientId) throw new GiftError('SELF');
  const cost = GIFT_PRICES[tier] * months;

  const result = await prisma.$transaction(async (tx) => {
    await tx.userProfile.upsert({
      where: { userId: gifterId },
      create: { userId: gifterId, coins: 10 },
      update: {},
    });
    // Atomic conditional debit — `coins >= cost` in the WHERE clause prevents
    // concurrent gifts from overdrafting a stale balance.
    const debit = await tx.userProfile.updateMany({
      where: { userId: gifterId, coins: { gte: cost } },
      data: { coins: { decrement: cost } },
    });
    if (debit.count === 0) throw new GiftError('INSUFFICIENT_COINS');

    // Extend an existing future grant of the same tier, else start from now.
    const existing = await tx.giftMembership.findFirst({
      where: { userId: recipientId, tier, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });
    const base = existing ? existing.expiresAt : new Date();
    const expiresAt = new Date(base.getTime() + months * 30 * 24 * 60 * 60 * 1000);

    if (existing) {
      await tx.giftMembership.update({ where: { id: existing.id }, data: { expiresAt, gifterId } });
    } else {
      await tx.giftMembership.create({ data: { userId: recipientId, gifterId, tier, expiresAt } });
    }

    await tx.coinTransaction.create({
      data: { senderId: gifterId, recipientId, amount: cost, type: 'GIFT', entityType: 'membership', entityId: tier, note: `Gifted ${months}mo ${tier}` },
    });

    return { expiresAt, cost };
  });

  // The recipient's entitlement just changed — drop their cached tier so the
  // gifted membership unlocks immediately instead of within the TTL.
  invalidateUserTier(recipientId);
  return result;
}
