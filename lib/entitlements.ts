import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import {
  TIER_RANK,
  mapPlanToTier,
  tierFromSubscription,
  type Tier,
} from '@/lib/entitlements/tiers';

// The pure tier vocabulary lives in `lib/entitlements/tiers.ts` so it can be
// imported without dragging `lib/prisma.server` in (see that file's header).
// Re-exported here so `@/lib/entitlements` stays the normal import and no
// existing call site has to change.
export {
  TIER_RANK,
  mapPlanToTier,
  parseTier,
  tierFromSubscription,
  hasApiAccess,
  hasApiImageUpload,
  hasAdFree,
  hasBadge,
} from '@/lib/entitlements/tiers';
export type { Tier } from '@/lib/entitlements/tiers';

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
  return cached<Tier>(tierCacheKey(userId), TIER_TTL_MS, async () => {
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
    return best;
  });
}

/**
 * Drop a user's cached tier so the next {@link getUserTier} recomputes from the
 * DB. Call after granting/revoking a gift membership or otherwise changing a
 * user's entitlement so paid features unlock without waiting out the TTL.
 */
export function invalidateUserTier(userId: string): void {
  // Fire-and-forget: drops the local L1 copy synchronously and broadcasts the
  // drop to every instance over Redis pub/sub. Callers are all fire-and-forget,
  // so the signature stays `void`.
  void invalidateCached(tierCacheKey(userId));
}
