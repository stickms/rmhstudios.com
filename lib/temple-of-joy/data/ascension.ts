import type { AscensionUpgradeDef } from '@/lib/temple-of-joy/types';

/**
 * Ascension — the meta-prestige layer above Transcendence.
 *
 * The player accumulates many prestiges, then Ascends: everything below the
 * meta-layer resets, but they keep their Ascension upgrades and earn Radiance,
 * a permanent currency that buys deep, compounding bonuses. This is the primary
 * driver of very-long-term (1000h+) progression — each Ascension makes the next
 * run dramatically faster, pushing the player toward ever-higher prestige walls.
 */
export const ASCENSION_UPGRADES: AscensionUpgradeDef[] = [
  // ── Tier 1 — foundations ──
  { id: 'firstLight',      name: 'First Light',       description: '+50% global HPS, permanently.',                 cost: 1,   tier: 1, globalHPSMultiplier: 1.5 },
  { id: 'radiantTouch',    name: 'Radiant Touch',     description: '×2 happiness per click, permanently.',          cost: 2,   tier: 1, hpcMultiplier: 2 },
  { id: 'brighterDawn',    name: 'Brighter Dawn',     description: 'Earn +50% more Radiance from Ascensions.',      cost: 3,   tier: 1, radianceGainMultiplier: 1.5 },
  { id: 'keptRelics',      name: 'Kept Relics',       description: 'Start every run with +2 relic slots.',          cost: 3,   tier: 1, bonusRelicSlots: 2 },

  // ── Tier 2 — momentum ──
  { id: 'gildedSun',       name: 'Gilded Sun',        description: '×3 global HPS.',                                cost: 6,   tier: 2, requires: ['firstLight'], globalHPSMultiplier: 3 },
  { id: 'eternalRest',     name: 'Eternal Rest',      description: '+40% offline efficiency.',                      cost: 6,   tier: 2, offlineEfficiencyBonus: 0.4 },
  { id: 'seedOfBliss',     name: 'Seed of Bliss',     description: 'Start each run with 50 bliss shards.',          cost: 8,   tier: 2, requires: ['brighterDawn'], startingShards: 50 },
  { id: 'swiftSamsara',    name: 'Swift Samsara',     description: 'Next Ascension needs 20% less prestige.',       cost: 10,  tier: 2, ascensionDiscount: 0.2 },

  // ── Tier 3 — compounding ──
  { id: 'solarCrown',      name: 'Solar Crown',       description: '×5 global HPS.',                                cost: 18,  tier: 3, requires: ['gildedSun'], globalHPSMultiplier: 5 },
  { id: 'goldenHands',     name: 'Golden Hands',      description: '×5 happiness per click.',                       cost: 18,  tier: 3, requires: ['radiantTouch'], hpcMultiplier: 5 },
  { id: 'radianceWell',    name: 'Radiance Well',     description: '×2 Radiance gain.',                             cost: 24,  tier: 3, requires: ['brighterDawn'], radianceGainMultiplier: 2 },
  { id: 'deepRelics',      name: 'Deep Relics',       description: 'Start every run with +3 relic slots.',          cost: 24,  tier: 3, requires: ['keptRelics'], bonusRelicSlots: 3 },

  // ── Tier 4 — radiant ──
  { id: 'supernova',       name: 'Supernova',         description: '×10 global HPS.',                               cost: 60,  tier: 4, requires: ['solarCrown'], globalHPSMultiplier: 10 },
  { id: 'eternalSeed',     name: 'Eternal Seed',      description: 'Start each run with 500 bliss shards.',         cost: 60,  tier: 4, requires: ['seedOfBliss'], startingShards: 500 },
  { id: 'timeUnbound',     name: 'Time Unbound',      description: '+60% offline efficiency.',                      cost: 70,  tier: 4, requires: ['eternalRest'], offlineEfficiencyBonus: 0.6 },
  { id: 'fastReturn',      name: 'Fast Return',       description: 'Next Ascension needs 30% less prestige.',       cost: 80,  tier: 4, requires: ['swiftSamsara'], ascensionDiscount: 0.3 },

  // ── Tier 5 — cosmic ──
  { id: 'galacticCore',    name: 'Galactic Core',     description: '×25 global HPS.',                               cost: 200, tier: 5, requires: ['supernova'], globalHPSMultiplier: 25 },
  { id: 'divineHands',     name: 'Divine Hands',      description: '×25 happiness per click.',                      cost: 200, tier: 5, requires: ['goldenHands'], hpcMultiplier: 25 },
  { id: 'radianceCascade', name: 'Radiance Cascade',  description: '×3 Radiance gain.',                             cost: 250, tier: 5, requires: ['radianceWell'], radianceGainMultiplier: 3 },

  // ── Tier 6 — transcendent ──
  { id: 'theBrightOne',    name: 'The Bright One',    description: '×100 global HPS.',                              cost: 800, tier: 6, requires: ['galacticCore'], globalHPSMultiplier: 100 },
  { id: 'handsOfCreation', name: 'Hands of Creation', description: '×100 happiness per click.',                     cost: 800, tier: 6, requires: ['divineHands'], hpcMultiplier: 100 },
  { id: 'foreverDawn',     name: 'Forever Dawn',      description: 'Next Ascension needs 40% less prestige.',       cost: 1000, tier: 6, requires: ['fastReturn'], ascensionDiscount: 0.4 },

  // ── Tier 7 — apex ──
  { id: 'theInfinite',     name: 'The Infinite',      description: '×1,000 global HPS.',                            cost: 5000, tier: 7, requires: ['theBrightOne', 'handsOfCreation'], globalHPSMultiplier: 1000 },
];

export const ASCENSION_MAP: Record<string, AscensionUpgradeDef> = Object.fromEntries(
  ASCENSION_UPGRADES.map((u) => [u.id, u]),
);
