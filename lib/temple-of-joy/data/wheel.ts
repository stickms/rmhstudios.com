import type { WheelUpgradeDef } from '@/lib/temple-of-joy/types';

export const WHEEL_UPGRADES: WheelUpgradeDef[] = [
  // ─── Tier 1 ───────────────────────────────────────────────────────────────

  {
    id: 'beginnersBliss',
    name: "Beginner's Bliss",
    description: 'Start each run with +50 HPS.',
    shardCost: 1,
    tier: 1,
  },
  {
    id: 'theSecondSmile',
    name: 'The Second Smile',
    description: '×2 base HPC.',
    shardCost: 1,
    tier: 1,
  },
  {
    id: 'emberOfMemory',
    name: 'Ember of Memory',
    description: 'Keep 5 upgrades of your choice on prestige.',
    shardCost: 2,
    tier: 1,
  },
  {
    id: 'karmicVessel',
    name: 'Karmic Vessel',
    description: 'Karma balance persists through prestige.',
    shardCost: 2,
    tier: 1,
  },
  {
    id: 'earlyWarmth',
    name: 'Early Warmth',
    description: 'Building costs reduced by 5%.',
    shardCost: 3,
    tier: 1,
  },
  {
    id: 'rememberedJoy',
    name: 'Remembered Joy',
    description: 'Start with 60 seconds of ×5 HPS.',
    shardCost: 1,
    tier: 1,
  },

  // ─── Tier 2 ───────────────────────────────────────────────────────────────

  {
    id: 'reincarnatedWealthier',
    name: 'Reincarnated Wealthier',
    description: "Start each run with 1% of peak HP from last run.",
    shardCost: 5,
    tier: 2,
    requires: ['beginnersBliss'],
  },
  {
    id: 'deepRoots',
    name: 'The Deep Roots',
    description: 'Buildings 1–5 start at 5 owned copies.',
    shardCost: 5,
    tier: 2,
    requires: ['beginnersBliss'],
  },
  {
    id: 'eternalReturn',
    name: 'The Eternal Return',
    description: 'Prestige shard formula ×1.25.',
    shardCost: 8,
    tier: 2,
    requires: ['theSecondSmile'],
  },
  {
    id: 'saintsPatience',
    name: "The Saint's Patience",
    description: 'Offline income cap raised to 16 hours.',
    shardCost: 10,
    tier: 2,
    requires: ['rememberedJoy'],
  },
  {
    id: 'samsarasGift',
    name: "Samsara's Gift",
    description: '+5% HPS per prestige completed (stacks, max ×20).',
    shardCost: 10,
    tier: 2,
    requires: ['earlyWarmth'],
  },
  {
    id: 'ritualMastery',
    name: 'Ritual Mastery',
    description: 'Ritual cooldown reduced 50%; trigger requires 5 clicks.',
    shardCost: 7,
    tier: 2,
    requires: ['theSecondSmile'],
  },

  // ─── Tier 3 ───────────────────────────────────────────────────────────────

  {
    id: 'theLongView',
    name: 'The Long View',
    description: 'Offline income uses sqrt formula (not linear cap).',
    shardCost: 20,
    tier: 3,
    requires: ['saintsPatience', 'reincarnatedWealthier', 'deepRoots'],
  },
  {
    id: 'enlightenedClicker',
    name: 'Enlightened Clicker',
    description: 'HPC ×(1 + 0.1 × prestige count).',
    shardCost: 25,
    tier: 3,
    requires: ['ritualMastery', 'eternalReturn', 'deepRoots'],
  },
  {
    id: 'theSecondComing',
    name: 'The Second Coming',
    description: 'First 10 minutes of each run ×10 HPS.',
    shardCost: 30,
    tier: 3,
    requires: ['rememberedJoy', 'saintsPatience', 'reincarnatedWealthier'],
  },
  {
    id: 'prophetsMemory',
    name: "The Prophet's Memory",
    description: 'Keep 20 upgrades on prestige.',
    shardCost: 35,
    tier: 3,
    requires: ['emberOfMemory', 'ritualMastery', 'eternalReturn'],
  },
  {
    id: 'heavensInfrastructure',
    name: "Heaven's Infrastructure",
    description: 'All buildings cost 10% less.',
    shardCost: 40,
    tier: 3,
    requires: ['earlyWarmth', 'samsarasGift', 'deepRoots'],
  },
  {
    id: 'karmicDividend',
    name: 'Karmic Dividend',
    description: 'Karma generates ×5 per second after prestige 3.',
    shardCost: 50,
    tier: 3,
    requires: ['karmicVessel', 'samsarasGift', 'saintsPatience'],
  },

  // ─── Tier 4 ───────────────────────────────────────────────────────────────

  {
    id: 'infiniteWheel',
    name: 'The Infinite Wheel',
    description: 'Shards earned formula uses 1.1× exponent.',
    shardCost: 100,
    tier: 4,
    requires: ['theLongView', 'enlightenedClicker', 'theSecondComing'],
  },
  {
    id: 'nirvanaBlueprint',
    name: "Nirvana's Blueprint",
    description: "All new runs start at 50% of previous run's peak HPS.",
    shardCost: 120,
    tier: 4,
    requires: ['theLongView', 'theSecondComing', 'prophetsMemory'],
  },
  {
    id: 'divineMemory',
    name: 'The Divine Memory',
    description: 'All upgrades retained on prestige.',
    shardCost: 150,
    tier: 4,
    requires: ['prophetsMemory', 'heavensInfrastructure', 'karmicDividend'],
  },
  {
    id: 'templeEternal',
    name: 'Temple Eternal',
    description: '×10 all HPS — stacks multiplicatively across prestige.',
    shardCost: 200,
    tier: 4,
    requires: ['enlightenedClicker', 'heavensInfrastructure', 'karmicDividend'],
  },
];

export const WHEEL_MAP: Record<string, WheelUpgradeDef> = Object.fromEntries(
  WHEEL_UPGRADES.map((w) => [w.id, w]),
);
