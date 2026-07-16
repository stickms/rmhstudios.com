import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';

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

/** Image upload via the developer API — starter and above. */
export function hasApiImageUpload(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK.starter;
}

/** Pro and above (incl. enterprise) get the profile badge. */
export function hasBadge(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK.pro;
}

// `getUserTier` runs on EVERY authenticated request — the Better Auth
// `customSession` plugin (lib/auth.ts) calls it on session resolution, so its
// two entitlement queries (subscription + giftMembership) land on essentially
// every authed API/loader call. Entitlements change only on Stripe subscription
// webhooks and gift/promo grants, so a short TTL keeps those queries off the hot
// path without meaningfully delaying a tier change: gift/promo paths call
// `invalidateUserTier()` for an instant refresh, and subscription changes settle
// within the TTL. Keyed per user in the shared in-process cache.
const TIER_TTL_MS = 60_000;
const tierCacheKey = (userId: string) => `entitlements:tier:${userId}`;

/**
 * Highest currently-active tier for a user, from synced Subscription rows plus
 * any active coin-funded gift memberships (#18). Cached for {@link TIER_TTL_MS};
 * call {@link invalidateUserTier} after a change that must reflect immediately.
 */
export async function getUserTier(userId: string): Promise<Tier> {
  const cached = apiCache.get<Tier>(tierCacheKey(userId));
  if (cached) return cached;

  const [subs, giftGrants] = await Promise.all([
    prisma.subscription.findMany({
      where: { referenceId: userId },
      select: { plan: true, status: true },
    }),
    prisma.giftMembership.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { tier: true },
    }),
  ]);
  let best: Tier = 'free';
  for (const sub of subs) {
    const tier = tierFromSubscription(sub);
    if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  for (const g of giftGrants) {
    const tier = mapPlanToTier(g.tier);
    if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }

  apiCache.set(tierCacheKey(userId), best, TIER_TTL_MS);
  return best;
}

/**
 * Drop a user's cached tier so the next {@link getUserTier} recomputes from the
 * DB. Call after granting/revoking a gift membership or otherwise changing a
 * user's entitlement so paid features unlock without waiting out the TTL.
 */
export function invalidateUserTier(userId: string): void {
  apiCache.invalidate(tierCacheKey(userId));
}
