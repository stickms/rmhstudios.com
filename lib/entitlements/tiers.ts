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

/**
 * Narrow an arbitrary string to a {@link Tier}, or `null` if it isn't one.
 *
 * The session's `tier` arrives at the client as a plain string (it crosses a
 * JSON boundary, and `CachedSessionUser` in `components/Providers` persists it
 * to `localStorage`), so anything reading it back has to decide what an
 * unrecognised value means rather than assume it can't happen — a stale
 * snapshot from an older build is exactly such a value. Callers get `null` and
 * choose; they must not silently treat it as `free`.
 */
export function parseTier(value: string | null | undefined): Tier | null {
  // `hasOwn`, not `in`: `'toString' in TIER_RANK` is true via the prototype
  // chain, which would hand back a "tier" whose rank is `undefined` and make
  // every rank comparison downstream quietly false.
  return value && Object.hasOwn(TIER_RANK, value) ? (value as Tier) : null;
}

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

/**
 * Ad-free browsing — HARD-R (plan id `starter`) and above.
 *
 * Ads are what the free tier is paid with, so a membership of any kind turns
 * them off; there is no half-measure tier that sees fewer of them. Coin-funded
 * gift memberships come along for the ride, because `getUserTier()` folds them
 * into the same value before anything asks this question.
 *
 * Stated as a rank comparison rather than a set of tier names on purpose: a
 * tier added above `starter` inherits ad-free automatically, where a set would
 * have to be remembered — and forgetting it means a paying member sees ads,
 * which is the failure nobody notices until they complain.
 */
export function hasAdFree(tier: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK.starter;
}
