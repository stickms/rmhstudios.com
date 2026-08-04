/**
 * The pure half of entitlements: tiers, their ordering, and the predicates
 * derived from them. No Prisma, no cache, no `.server` imports.
 *
 * `lib/entitlements.ts` re-exports everything here, so existing call sites are
 * unaffected and `@/lib/entitlements` remains the normal import. This module
 * exists because that file reaches for `lib/prisma.server` at module scope:
 * harmless in the browser (the Vite plugin stubs it) but fatal anywhere the
 * real module loads without a `DATABASE_URL` — which is to say, in tests.
 * Anything that only needs to know what a tier *means* should import from here
 * and stay testable.
 */

export type Tier = 'free' | 'starter' | 'pro' | 'enterprise';

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

/** Subscription statuses that grant entitlement. */
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

/** HARD-R (plan id `starter`) and above get programmatic RMH API access. */
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
