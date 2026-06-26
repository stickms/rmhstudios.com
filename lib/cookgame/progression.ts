export const XP_PER_RECIPE = 25;
export const XP_PER_PRODUCTION = 10;

export function xpForSale(saleValue: number): number {
  return Math.max(1, Math.round(saleValue / 4));
}
export function xpForRecipe(): number { return XP_PER_RECIPE; }
export function xpForProduction(): number { return XP_PER_PRODUCTION; }

export interface Perk { priceMult: number; heatMult: number; cooldownMult: number; }
export interface Rank { rank: number; name: string; xpThreshold: number; perk: Perk; }

export const RANKS: Rank[] = [
  { rank: 0, name: 'Nobody',     xpThreshold: 0,    perk: { priceMult: 1.00, heatMult: 1.00, cooldownMult: 1.00 } },
  { rank: 1, name: 'Corner Kid', xpThreshold: 100,  perk: { priceMult: 1.02, heatMult: 0.98, cooldownMult: 0.98 } },
  { rank: 2, name: 'Runner',     xpThreshold: 300,  perk: { priceMult: 1.05, heatMult: 0.95, cooldownMult: 0.95 } },
  { rank: 3, name: 'Dealer',     xpThreshold: 700,  perk: { priceMult: 1.08, heatMult: 0.92, cooldownMult: 0.92 } },
  { rank: 4, name: 'Supplier',   xpThreshold: 1500, perk: { priceMult: 1.12, heatMult: 0.88, cooldownMult: 0.88 } },
  { rank: 5, name: 'Kingpin',    xpThreshold: 3000, perk: { priceMult: 1.16, heatMult: 0.84, cooldownMult: 0.85 } },
  { rank: 6, name: 'Legend',     xpThreshold: 6000, perk: { priceMult: 1.20, heatMult: 0.80, cooldownMult: 0.82 } },
];

export function rankForXp(xp: number): Rank {
  let result = RANKS[0];
  // RANKS is sorted ascending by xpThreshold (asserted in tests); break on first miss.
  for (const r of RANKS) {
    if (xp >= r.xpThreshold) result = r;
    else break;
  }
  return result;
}

export function xpToNextRank(xp: number): number {
  const current = rankForXp(xp);
  const next = RANKS[current.rank + 1];
  return next ? next.xpThreshold - xp : 0;
}

export function perksAtRank(rank: number): Perk {
  const i = Math.max(0, Math.min(RANKS.length - 1, rank));
  return RANKS[i].perk;
}
