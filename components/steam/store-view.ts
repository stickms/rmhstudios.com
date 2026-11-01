import { TIER_RANK, type Tier } from '@/lib/entitlements/tiers';

/** Whole hours and minutes from `now` until `iso` (zero once it has passed). */
export function timeUntil(iso: string, now: Date): { hours: number; minutes: number } {
  const ms = Math.max(0, new Date(iso).getTime() - now.getTime());
  const total = Math.floor(ms / 60_000);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export type PlanAction = 'signin' | 'current' | 'included' | 'subscribe' | 'upgrade' | 'contact';

/**
 * What a plan card's button does for this viewer (`current` = null when signed out).
 * Mirrors the main-site MembershipPanel: the plan you are on is marked, plans below
 * it are "included", a paying member moving up is an "upgrade", and Enterprise is
 * always a contact link.
 */
export function planAction(
  plan: Tier,
  cta: 'current' | 'subscribe' | 'contact',
  current: Tier | null,
): PlanAction {
  if (cta === 'contact') return 'contact';
  if (current === null) return 'signin';
  if (current === plan) return 'current';
  if (TIER_RANK[current] > TIER_RANK[plan]) return 'included';
  if (cta === 'current') return 'included';
  return current === 'free' ? 'subscribe' : 'upgrade';
}
