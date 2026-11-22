/**
 * Which colour step a profile's level badge takes. Steam recolours the badge
 * every ten levels; the CSS maps tier 0..10 to the ring colours. Pure and
 * client-safe.
 */

export const LEVEL_BADGE_TIERS = 10;

export function levelBadgeTier(level: number): number {
  if (!Number.isFinite(level) || level < 0) return 0;
  return Math.min(LEVEL_BADGE_TIERS, Math.floor(level / 10));
}
