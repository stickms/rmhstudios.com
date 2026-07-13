/**
 * Ranked tiers/divisions derived from an ELO rating (pure, client-safe).
 *
 * Raw ELO is a hard number to feel progress against; visible tiers
 * (Bronze → Master) give players a coarse, motivating ladder the way
 * Chess.com / League ranks do. This is a *derivation* over the existing
 * `EloRating.rating` — no schema, no stored state. Everyone starts at
 * `BASE_RATING` (1000 = Silver) and moves as they win/lose.
 *
 * Thresholds are tuned for K-factor 32 around a 1000 base (see
 * `lib/ranked/elo.ts`): a few good runs reach Gold; sustained dominance
 * reaches Master.
 */

export interface RankTier {
  /** Stable key for lookups/styling. */
  key: string;
  /** Display label. */
  label: string;
  /** Inclusive lower bound on rating for this tier. */
  min: number;
  /** Accent color for the tier badge (rendered as an inline tint, like cosmetics). */
  color: string;
}

/** Tiers ordered high → low so `tierForRating` can pick the first match. */
export const RANK_TIERS: readonly RankTier[] = [
  { key: 'master', label: 'Master', min: 1500, color: '#a855f7' },
  { key: 'diamond', label: 'Diamond', min: 1350, color: '#60a5fa' },
  { key: 'platinum', label: 'Platinum', min: 1200, color: '#22d3ee' },
  { key: 'gold', label: 'Gold', min: 1050, color: '#eab308' },
  { key: 'silver', label: 'Silver', min: 900, color: '#9ca3af' },
  { key: 'bronze', label: 'Bronze', min: 0, color: '#cd7f32' },
] as const;

/** The tier a given rating falls into. Always returns a tier (Bronze is the floor). */
export function tierForRating(rating: number): RankTier {
  return RANK_TIERS.find((t) => rating >= t.min) ?? RANK_TIERS[RANK_TIERS.length - 1];
}
