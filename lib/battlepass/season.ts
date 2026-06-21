/**
 * Battle pass season definition (code-driven). One active season at a time;
 * tiers are reached by earning season XP. Each tier has a free reward and a
 * premium reward (premium track unlocked with RMH coins).
 */

export interface PassReward {
  type: 'coins' | 'item' | 'xp' | 'badge';
  amount?: number;
  itemId?: string; // shop item id for 'item'
  label: string;
}

export interface PassTier {
  tier: number;
  xpRequired: number; // cumulative season XP to reach this tier
  free: PassReward | null;
  premium: PassReward | null;
}

export interface Season {
  id: string;
  name: string;
  endsAt: string; // ISO
  premiumPrice: number; // coins to unlock the premium track
  xpPerTier: number;
  tiers: PassTier[];
}

const XP_PER_TIER = 500;
const TIER_COUNT = 20;

function buildTiers(): PassTier[] {
  const tiers: PassTier[] = [];
  for (let t = 1; t <= TIER_COUNT; t++) {
    const free: PassReward | null =
      t % 2 === 0 ? { type: 'coins', amount: 50, label: '50 coins' } : { type: 'xp', amount: 100, label: '100 XP' };
    let premium: PassReward | null = { type: 'coins', amount: 100, label: '100 coins' };
    if (t === 5) premium = { type: 'item', itemId: 'badge.bolt', label: 'Bolt badge' };
    if (t === 10) premium = { type: 'item', itemId: 'frame.neon', label: 'Neon avatar frame' };
    if (t === 15) premium = { type: 'item', itemId: 'color.gold', label: 'Gold name color' };
    if (t === 20) premium = { type: 'item', itemId: 'frame.rainbow', label: 'Prism avatar frame' };
    tiers.push({ tier: t, xpRequired: t * XP_PER_TIER, free, premium });
  }
  return tiers;
}

// The currently active season. Bump the id + dates to start a new season.
export const CURRENT_SEASON: Season = {
  id: 'S1',
  name: 'Season 1: Genesis',
  endsAt: '2026-09-01T00:00:00Z',
  premiumPrice: 1000,
  xpPerTier: XP_PER_TIER,
  tiers: buildTiers(),
};

export function tierForXp(seasonXp: number): number {
  let tier = 0;
  for (const t of CURRENT_SEASON.tiers) {
    if (seasonXp >= t.xpRequired) tier = t.tier;
    else break;
  }
  return tier;
}
