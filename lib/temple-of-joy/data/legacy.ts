/**
 * The Ladder — what you buy with Grace.
 *
 * Grace is Cookie Clicker's heavenly chips: `floor((lifetimeJoy / 1e12) ^ 1/3)`,
 * permanent, never reset. The five **Communion** rungs are its heavenly-chip
 * tiers, and they matter more than anything else on this page: until you buy
 * them, your Grace is a number with no effect. After all five, every point of
 * Grace is +1% to everything, forever.
 *
 * That is the shape of the whole meta-game. The first ascension feels like a
 * loss; the fifth feels like the only sensible move; the fiftieth takes twenty
 * minutes and triples your ceiling.
 */
import type { LegacyDef } from '../types';

export const LEGACY: LegacyDef[] = [
  // ── Tier 0: the door ──
  {
    id: 'ladder',
    name: 'The Ladder',
    description:
      'See what was always there: a way up, resting on the ground, reaching further than you can follow.',
    icon: '🪜',
    cost: 1,
    tier: 0,
  },

  // ── Tier 1: Communion — turning Grace into rate ──
  {
    id: 'communion_1',
    name: 'First Communion',
    description: 'A twentieth of your Grace becomes a permanent multiplier. +1% joy per Grace, at 5% strength.',
    icon: '🍷',
    cost: 11,
    tier: 1,
    requires: ['ladder'],
    graceShare: 0.05,
  },
  {
    id: 'communion_2',
    name: 'Second Communion',
    description: 'A quarter of your Grace now counts.',
    icon: '🍷',
    cost: 1_111,
    tier: 1,
    requires: ['communion_1'],
    graceShare: 0.2,
  },
  {
    id: 'communion_3',
    name: 'Third Communion',
    description: 'Half of it counts.',
    icon: '🍷',
    cost: 111_111,
    tier: 1,
    requires: ['communion_2'],
    graceShare: 0.25,
  },
  {
    id: 'communion_4',
    name: 'Fourth Communion',
    description: 'Three quarters.',
    icon: '🍷',
    cost: 11_111_111,
    tier: 1,
    requires: ['communion_3'],
    graceShare: 0.25,
  },
  {
    id: 'communion_5',
    name: 'Last Communion',
    description: 'All of it. Every point of Grace, +1% to everything, for as long as this save exists.',
    icon: '🍷',
    cost: 1_111_111_111,
    tier: 1,
    requires: ['communion_4'],
    graceShare: 0.25,
  },

  // ── Tier 2: keeping what you had ──
  {
    id: 'memory_1',
    name: 'Ember of Memory',
    description: 'Carry three blessings through the ascension. Choose them before you go.',
    icon: '🕯️',
    cost: 100,
    tier: 2,
    requires: ['ladder'],
    keptBlessings: 3,
  },
  {
    id: 'memory_2',
    name: 'The Longer Memory',
    description: 'Carry ten blessings instead of three.',
    icon: '🕯️',
    cost: 40_000,
    tier: 2,
    requires: ['memory_1'],
    keptBlessings: 7,
  },
  {
    id: 'memory_3',
    name: 'Nothing Is Forgotten',
    description: 'Carry twenty-five blessings.',
    icon: '🕯️',
    cost: 8_000_000,
    tier: 2,
    requires: ['memory_2'],
    keptBlessings: 15,
  },
  {
    id: 'inheritance_1',
    name: 'Inheritance',
    description: 'Begin each run holding a day of joy at your first ascension\'s rate, and ten Acolytes.',
    icon: '🎁',
    cost: 300,
    tier: 2,
    requires: ['ladder'],
    startingJoy: 1e7,
    startingAcolytes: 10,
  },
  {
    id: 'inheritance_2',
    name: 'A Generous Will',
    description: 'Begin with considerably more, and fifty Acolytes.',
    icon: '🎁',
    cost: 250_000,
    tier: 2,
    requires: ['inheritance_1'],
    startingJoy: 1e13,
    startingAcolytes: 40,
  },
  {
    id: 'inheritance_3',
    name: 'The Estate',
    description: 'Begin most of the way to where you last stood.',
    icon: '🎁',
    cost: 90_000_000,
    tier: 2,
    requires: ['inheritance_2'],
    startingJoy: 1e20,
    startingAcolytes: 150,
  },

  // ── Tier 3: the vigil — what happens while you are gone ──
  {
    id: 'gates_1',
    name: 'The Twin Gates',
    description: 'The temple keeps a third of its rate while you are away, for up to eight hours.',
    icon: '🚪',
    cost: 55,
    tier: 3,
    requires: ['ladder'],
    vigilEfficiency: 0.15,
    vigilHours: 5,
  },
  {
    id: 'gates_2',
    name: 'The Gates Stand Open',
    description: 'More of it, for longer. A full day now counts.',
    icon: '🚪',
    cost: 22_000,
    tier: 3,
    requires: ['gates_1'],
    vigilEfficiency: 0.2,
    vigilHours: 16,
  },
  {
    id: 'gates_3',
    name: 'No Door At All',
    description: 'The temple works at full rate, indefinitely, whether or not anyone is watching.',
    icon: '🚪',
    cost: 6_000_000,
    tier: 3,
    requires: ['gates_2'],
    vigilEfficiency: 0.35,
    vigilHours: 96,
  },
  {
    id: 'keepsake',
    name: 'The Garden Remembers',
    description:
      'The garden, the choir, the exchange and the book survive an ascension. Everything you planted is still there when you come back.',
    icon: '🌿',
    cost: 15_000,
    tier: 3,
    requires: ['gates_1'],
    keepsMinigames: true,
  },

  // ── Tier 4: the slow resource ──
  {
    id: 'manna_haste_1',
    name: 'Morning Dew',
    description: 'Manna ripens a fifth faster.',
    icon: '🍞',
    cost: 2_000,
    tier: 4,
    requires: ['ladder'],
    mannaSpeed: 1.2,
  },
  {
    id: 'manna_haste_2',
    name: 'A Double Portion',
    description: 'Manna ripens half again as fast.',
    icon: '🍞',
    cost: 1_500_000,
    tier: 4,
    requires: ['manna_haste_1'],
    mannaSpeed: 1.5,
  },
  {
    id: 'manna_haste_3',
    name: 'Bread Before You Wake',
    description: 'Manna ripens twice as fast.',
    icon: '🍞',
    cost: 400_000_000,
    tier: 4,
    requires: ['manna_haste_2'],
    mannaSpeed: 2,
  },

  // ── Tier 5: providence ──
  {
    id: 'providence_1',
    name: 'A Watchful Providence',
    description: 'Halos come half again as often.',
    icon: '🌟',
    cost: 1_000,
    tier: 5,
    requires: ['ladder'],
    haloFrequency: 1.5,
  },
  {
    id: 'providence_2',
    name: 'Unmistakable Favour',
    description: 'Halo blessings are twice as strong.',
    icon: '🌟',
    cost: 500_000,
    tier: 5,
    requires: ['providence_1'],
    haloPotency: 2,
  },
  {
    id: 'providence_3',
    name: 'It Was Never Chance',
    description: 'Halos come twice as often, and are twice as strong again.',
    icon: '🌟',
    cost: 200_000_000,
    tier: 5,
    requires: ['providence_2'],
    haloFrequency: 2,
    haloPotency: 2,
  },

  // ── Tier 6: raw multipliers, and the price of the next climb ──
  {
    id: 'glory_1',
    name: 'Glory',
    description: 'Everything, doubled. No conditions.',
    icon: '☀️',
    cost: 5_000,
    tier: 6,
    requires: ['communion_2'],
    globalMultiplier: 2,
  },
  {
    id: 'glory_2',
    name: 'Greater Glory',
    description: 'Everything, tripled.',
    icon: '☀️',
    cost: 5_000_000,
    tier: 6,
    requires: ['glory_1'],
    globalMultiplier: 3,
  },
  {
    id: 'glory_3',
    name: 'Glory Without End',
    description: 'Everything, times ten.',
    icon: '☀️',
    cost: 5_000_000_000,
    tier: 6,
    requires: ['glory_2'],
    globalMultiplier: 10,
  },
  {
    id: 'hands_1',
    name: 'Hands of Light',
    description: 'Every offering counts for ten times as much.',
    icon: '🤲',
    cost: 7_500,
    tier: 6,
    requires: ['communion_2'],
    touchMultiplier: 10,
  },
  {
    id: 'hands_2',
    name: 'Hands of Morning',
    description: 'A hundred times as much.',
    icon: '🤲',
    cost: 7_500_000,
    tier: 6,
    requires: ['hands_1'],
    touchMultiplier: 10,
  },
  // ── Tier 5: Orbit — the globes that survive the fall ──
  /**
   * Everything a run buys with joy is given back on ascension, globes included.
   * These three rungs are the only exception, and they are priced against the
   * Inheritance line rather than the Communions: keeping a globe is worth about
   * what a starting gift is worth, because it *is* one — it starts the next run
   * at ×1.5 instead of ×1.
   */
  {
    id: 'orbit_1',
    name: 'A Globe Remembered',
    description: 'One globe past the first stays in the sanctum through an ascension.',
    icon: '🔮',
    cost: 500,
    tier: 5,
    requires: ['communion_2'],
    keptGlobes: 1,
  },
  {
    id: 'orbit_2',
    name: 'Two Kept Turning',
    description: 'A second globe survives the fall.',
    icon: '🔮',
    cost: 250_000,
    tier: 5,
    requires: ['orbit_1'],
    keptGlobes: 1,
  },
  {
    id: 'orbit_3',
    name: 'The Constellation Holds',
    description: 'A third globe survives, and none of the three ever needs buying again.',
    icon: '🔮',
    cost: 500_000_000,
    tier: 5,
    requires: ['orbit_2'],
    keptGlobes: 1,
  },

  {
    id: 'reckoning_1',
    name: 'The Kinder Reckoning',
    description: 'Ascensions grant half again as much Grace.',
    icon: '⚖️',
    cost: 100_000,
    tier: 6,
    requires: ['communion_3'],
    graceGain: 1.5,
  },
  {
    id: 'reckoning_2',
    name: 'Counted Generously',
    description: 'Ascensions grant twice as much Grace again.',
    icon: '⚖️',
    cost: 100_000_000,
    tier: 6,
    requires: ['reckoning_1'],
    graceGain: 2,
  },
];

export const LEGACY_MAP: Record<string, LegacyDef> = Object.fromEntries(
  LEGACY.map((l) => [l.id, l]),
);

/**
 * Joy required for one point of Grace. Cookie Clicker's 1e12, unchanged —
 * `grace = floor((lifetimeJoy / GRACE_DIVISOR) ^ (1/3))`, which is what makes
 * the first ascension take hours and the hundredth take twenty minutes.
 */
export const GRACE_DIVISOR = 1e12;

/**
 * Ascending below this much run-joy would hand back nothing and cost a run, so
 * the button stays shut until it is at least arguably a good idea.
 */
export const MIN_ASCEND_JOY = 1e12;
