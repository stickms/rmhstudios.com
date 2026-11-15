// =============================================================================
// ALTAIR -- Meta-Progression & Permanent Upgrades (v1.3 Meta Store Overhaul)
// =============================================================================
// All upgrades are purchased with persistent coins. Upgrades apply to all
// future runs. 20 upgrades across offense, defense, utility, and progression.
// Total cost to fully upgrade: ~34,440 coins.
// =============================================================================

export interface MetaUpgradeDef {
  id: string;
  name: string;
  maxLevel: number;
  costs: number[];
  effectPerLevel: Record<string, number>;
  description: string;
}

export const META_UPGRADES: readonly MetaUpgradeDef[] = [
  // ---------------------------------------------------------------------------
  // 1–8: Core stat upgrades (5 levels each)
  // ---------------------------------------------------------------------------
  {
    id: 'meta_max_hp',
    name: 'Vitality',
    maxLevel: 5,
    costs: [60, 120, 220, 380, 550],
    effectPerLevel: { maxHpPercent: 10 },
    description: '+10% Max HP per level.',
  },
  {
    id: 'meta_hp_regen',
    name: 'Regeneration',
    maxLevel: 5,
    costs: [80, 160, 280, 440, 650],
    effectPerLevel: { hpRegen: 0.3 },
    description: '+0.3 HP/s per level.',
  },
  {
    id: 'meta_might',
    name: 'Might',
    maxLevel: 5,
    costs: [120, 240, 400, 600, 850],
    effectPerLevel: { mightPercent: 4 },
    description: '+4% Might per level.',
  },
  {
    id: 'meta_move_speed',
    name: 'Swiftness',
    maxLevel: 5,
    costs: [60, 120, 180, 280, 420],
    effectPerLevel: { moveSpeedPercent: 5 },
    description: '+5% Move Speed per level.',
  },
  {
    id: 'meta_pickup_range',
    name: 'Magnetism',
    maxLevel: 5,
    costs: [30, 60, 110, 170, 230],
    effectPerLevel: { pickupRange: 20 },
    description: '+20px Pickup Range per level.',
  },
  {
    id: 'meta_growth',
    name: 'Wisdom',
    maxLevel: 5,
    costs: [120, 240, 400, 600, 850],
    effectPerLevel: { growthPercent: 6 },
    description: '+6% Growth per level.',
  },
  {
    id: 'meta_greed',
    name: 'Greed',
    maxLevel: 5,
    costs: [180, 350, 580, 850, 1200],
    effectPerLevel: { coinGainPercent: 10 },
    description: '+10% Coin Gain per level.',
  },
  {
    id: 'meta_luck',
    name: 'Fortune',
    maxLevel: 5,
    costs: [120, 240, 400, 600, 850],
    effectPerLevel: { luckPercent: 10 },
    description: '+10% Luck per level.',
  },

  // ---------------------------------------------------------------------------
  // 9: Armor (3 levels)
  // ---------------------------------------------------------------------------
  {
    id: 'meta_armor',
    name: 'Toughness',
    maxLevel: 3,
    costs: [250, 450, 800],
    effectPerLevel: { armor: 1 },
    description: '+1 Armor per level.',
  },

  // ---------------------------------------------------------------------------
  // 10–11: Reroll & Banish (3 levels each)
  // ---------------------------------------------------------------------------
  {
    id: 'meta_reroll',
    name: 'Reroll',
    maxLevel: 3,
    costs: [120, 280, 550],
    effectPerLevel: { rerollsPerRun: 1 },
    description: '+1 Reroll per run.',
  },
  {
    id: 'meta_banish',
    name: 'Banish',
    maxLevel: 3,
    costs: [120, 280, 550],
    effectPerLevel: { banishesPerRun: 1 },
    description: '+1 Banish per run.',
  },

  // ---------------------------------------------------------------------------
  // 12: Revival (2 levels)
  // ---------------------------------------------------------------------------
  {
    id: 'meta_revival',
    name: 'Revival',
    maxLevel: 2,
    costs: [800, 1500],
    effectPerLevel: { revival: 1 },
    description: '+1 Revival per run.',
  },

  // ---------------------------------------------------------------------------
  // 13: Extra Choice (1 level)
  // ---------------------------------------------------------------------------
  {
    id: 'meta_extra_choice',
    name: 'Extra Choice',
    maxLevel: 1,
    costs: [2500],
    effectPerLevel: { levelUpChoices: 1 },
    description: '+1 level-up option (3→4).',
  },

  // ---------------------------------------------------------------------------
  // 14–20: New v1.3 upgrades
  // ---------------------------------------------------------------------------
  {
    id: 'meta_piercing',
    name: 'Piercing',
    maxLevel: 3,
    costs: [300, 600, 1000],
    effectPerLevel: { pierce: 1 },
    description: '+1 Pierce (global).',
  },
  {
    id: 'meta_haste',
    name: 'Haste',
    maxLevel: 5,
    costs: [100, 200, 350, 550, 800],
    effectPerLevel: { attackSpeedPercent: 4 },
    description: '+4% Attack Speed per level.',
  },
  {
    id: 'meta_tenacity',
    name: 'Tenacity',
    maxLevel: 3,
    costs: [200, 400, 700],
    effectPerLevel: { tenacity: 15 },
    description: '-15% CC duration per level.',
  },
  {
    id: 'meta_scavenger',
    name: 'Scavenger',
    maxLevel: 3,
    costs: [150, 350, 600],
    effectPerLevel: { scavengerFoodHealPct: 5, scavengerCoinChancePct: 5 },
    description: '+5% food heal and +5% coin chance per level.',
  },
  {
    id: 'meta_catalyst_affinity',
    name: 'Catalyst Affinity',
    maxLevel: 2,
    costs: [500, 1200],
    effectPerLevel: { catalystFreqPct: 15 },
    description:
      '+15% catalyst frequency in level-up per level; at max, catalysts start at lv2.',
  },
  {
    id: 'meta_endurance',
    name: 'Endurance',
    maxLevel: 3,
    costs: [400, 700, 1100],
    effectPerLevel: { enduranceDrPct: 3 },
    description:
      '+3% DR after min 10 per level; after min 15, additional +2% per level.',
  },
  {
    id: 'meta_arsenal',
    name: 'Arsenal',
    maxLevel: 3,
    costs: [250, 500, 900],
    effectPerLevel: { arsenalWeaponLvl: 1 },
    description: 'Starting weapon begins at +1 level per Arsenal level.',
  },
] as const;
