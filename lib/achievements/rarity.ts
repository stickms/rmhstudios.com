/**
 * Achievement rarity tiers (F7). Client-safe and pure.
 *
 * `UserAchievement` and `/achievements` already list what someone has earned.
 * What was missing is the only number that makes a badge worth displaying: how
 * many other people hold it. An achievement 0.4% of players have is a thing you
 * put on your profile; one 90% have is wallpaper. Without rarity every badge
 * reads the same, so the wall of them reads as noise.
 *
 * The tier thresholds are deliberately coarse. Showing "0.37%" invites people
 * to grind the number; showing "Legendary" communicates the same thing and
 * ages better as the population grows.
 */

export type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * Lower bound (inclusive) of the holder fraction for each tier, most common
 * first. `pct` is 0–1, not 0–100 — the column stores a fraction.
 */
const TIERS: readonly { tier: RarityTier; minPct: number }[] = [
  { tier: 'common', minPct: 0.25 },
  { tier: 'uncommon', minPct: 0.1 },
  { tier: 'rare', minPct: 0.02 },
  { tier: 'epic', minPct: 0.005 },
  { tier: 'legendary', minPct: 0 },
] as const;

export function rarityTier(pct: number): RarityTier {
  // A nonsense input must not silently become "legendary" — an achievement
  // nobody has computed yet would then outrank every real one on the profile.
  if (!Number.isFinite(pct) || pct < 0) return 'common';
  return TIERS.find((t) => pct >= t.minPct)?.tier ?? 'legendary';
}

/**
 * The glass elevation class a badge at this tier renders with.
 *
 * Returned as a class name rather than a colour because the design system is
 * CI-enforced: `lib/__tests__/design-consistency.test.ts` rejects raw palette
 * values, and a rarity treatment built from custom colours would fail the build
 * (and look wrong in the light and high-contrast themes besides).
 */
export function rarityClass(tier: RarityTier): string {
  switch (tier) {
    case 'legendary':
    case 'epic':
      // Floating-feeling treatment for the two tiers worth drawing the eye.
      return 'glass-overlay';
    case 'rare':
      return 'glass-pane';
    default:
      return 'glass-fill';
  }
}

/** i18n key for a tier label. Lives in the `common` namespace. */
export function rarityLabelKey(tier: RarityTier): string {
  return `rarity-${tier}`;
}

/**
 * Format a holder fraction for display next to the tier.
 *
 * Sub-0.1% collapses to "<0.1%" rather than "0.04%": at that scale the extra
 * digit is noise, and it changes every night as the population moves.
 */
export function formatRarity(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return '—';
  const percent = pct * 100;
  if (percent < 0.1) return '<0.1%';
  if (percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

/** How many badges a member may pin. An ungoverned wall of them is noise. */
export const MAX_SHOWCASED_BADGES = 6;

export interface RarityRow {
  achievementId: string;
  holders: number;
  pct: number;
}

/**
 * Sort earned achievements for the showcase: rarest first, then most holders as
 * a stable tiebreak so equal-rarity badges do not reshuffle between renders.
 */
export function sortByRarity<T extends { achievementId: string }>(
  earned: readonly T[],
  rarity: ReadonlyMap<string, RarityRow>,
): T[] {
  return [...earned].sort((a, b) => {
    const ra = rarity.get(a.achievementId)?.pct ?? 1;
    const rb = rarity.get(b.achievementId)?.pct ?? 1;
    if (ra !== rb) return ra - rb;
    return a.achievementId < b.achievementId ? -1 : 1;
  });
}
