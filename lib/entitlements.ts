import { prisma } from '@/lib/prisma.server';

export type Tier = 'free' | 'starter' | 'pro' | 'enterprise';

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

// Subscription statuses that grant entitlement.
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** Map a Stripe/Prisma plan name to a tier. Unknown -> free. */
export function mapPlanToTier(plan: string | null | undefined): Tier {
  switch (plan) {
    case 'starter':
      return 'starter';
    case 'pro':
      return 'pro';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'free';
  }
}

/** Resolve the entitled tier for a single subscription record. Fails closed to free. */
export function tierFromSubscription(
  sub: { plan?: string | null; status?: string | null } | null | undefined,
): Tier {
  if (!sub || !sub.status || !ACTIVE_STATUSES.has(sub.status)) return 'free';
  return mapPlanToTier(sub.plan);
}

/** Starter and above get programmatic RMH API access. */
export function hasApiAccess(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK.starter;
}

/** Pro and above (incl. enterprise) get the profile badge. */
export function hasBadge(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK.pro;
}

/** Highest currently-active tier for a user, read from synced Subscription rows. */
export async function getUserTier(userId: string): Promise<Tier> {
  const subs = await prisma.subscription.findMany({
    where: { referenceId: userId },
    select: { plan: true, status: true },
  });
  let best: Tier = 'free';
  for (const sub of subs) {
    const tier = tierFromSubscription(sub);
    if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best;
}
