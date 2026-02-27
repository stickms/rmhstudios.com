// =============================================================================
// ALTAIR -- Meta-Progression & Permanent Upgrades (GDD Section 5)
// =============================================================================
// All upgrades are purchased with persistent coins. Upgrades apply to all
// future runs. Total cost to fully upgrade: ~16,700 coins.
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
  {
    id: 'meta_max_hp',
    name: 'Max HP Up',
    maxLevel: 5,
    costs: [50, 100, 200, 350, 500],
    effectPerLevel: { maxHpPercent: 10 },
    description: '+10% Max HP per level.',
  },
  {
    id: 'meta_hp_regen',
    name: 'HP Regen',
    maxLevel: 5,
    costs: [75, 150, 250, 400, 600],
    effectPerLevel: { hpRegen: 0.2 },
    description: '+0.2 HP/s per level.',
  },
  {
    id: 'meta_might',
    name: 'Might Up',
    maxLevel: 5,
    costs: [100, 200, 350, 500, 750],
    effectPerLevel: { mightPercent: 4 },
    description: '+4% Might per level.',
  },
  {
    id: 'meta_move_speed',
    name: 'Move Speed Up',
    maxLevel: 5,
    costs: [50, 100, 150, 250, 400],
    effectPerLevel: { moveSpeedPercent: 5 },
    description: '+5% Move Speed per level.',
  },
  {
    id: 'meta_pickup_range',
    name: 'Pickup Range Up',
    maxLevel: 5,
    costs: [25, 50, 100, 150, 200],
    effectPerLevel: { pickupRange: 20 },
    description: '+20px Pickup Range per level.',
  },
  {
    id: 'meta_growth',
    name: 'Growth Up',
    maxLevel: 5,
    costs: [100, 200, 350, 500, 750],
    effectPerLevel: { growthPercent: 6 },
    description: '+6% Growth per level.',
  },
  {
    id: 'meta_greed',
    name: 'Greed',
    maxLevel: 5,
    costs: [150, 300, 500, 750, 1000],
    effectPerLevel: { coinGainPercent: 10 },
    description: '+10% coin gain per level.',
  },
  {
    id: 'meta_luck',
    name: 'Luck Up',
    maxLevel: 5,
    costs: [100, 200, 350, 500, 750],
    effectPerLevel: { luckPercent: 10 },
    description: '+10% Luck per level.',
  },
  {
    id: 'meta_armor',
    name: 'Armor Up',
    maxLevel: 3,
    costs: [200, 400, 700],
    effectPerLevel: { armor: 1 },
    description: '+1 Armor per level.',
  },
  {
    id: 'meta_revival',
    name: 'Revival',
    maxLevel: 1,
    costs: [1000],
    effectPerLevel: { revival: 1 },
    description: '+1 Revival.',
  },
  {
    id: 'meta_reroll',
    name: 'Reroll',
    maxLevel: 3,
    costs: [100, 250, 500],
    effectPerLevel: { rerollsPerRun: 1 },
    description: '+1 Reroll per run.',
  },
  {
    id: 'meta_banish',
    name: 'Banish',
    maxLevel: 3,
    costs: [100, 250, 500],
    effectPerLevel: { banishesPerRun: 1 },
    description: '+1 Banish per run.',
  },
  {
    id: 'meta_extra_choice',
    name: 'Extra Choice',
    maxLevel: 1,
    costs: [2000],
    effectPerLevel: { levelUpChoices: 1 },
    description: '+1 level-up option (3 -> 4).',
  },
] as const;
