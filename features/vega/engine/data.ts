/**
 * Project Vega: every number the game plays by, in one place.
 *
 * The balance reasoning behind these values is in `docs/vega/balance.md`, and the claims it makes are asserted
 * by the seeded simulation in `features/vega/engine/__tests__/balance.test.ts`. Change a number here, re-run that
 * test, and update the table in the doc. Client-safe and pure: no DOM, no store.
 */

// ── The board ────────────────────────────────────────────────────────────────

export const BOARD = {
  /** Logical size of the playfield; the canvas scales it to fit. */
  WIDTH: 1200,
  HEIGHT: 780,
  CELL: 60,
  COLS: 20,
  ROWS: 13,
} as const;

/** Fixed simulation step, seconds. The host accumulates real time and steps in these. */
export const STEP_S = 1 / 60;

// ── Instruments (towers) ─────────────────────────────────────────────────────

export type TowerType =
  | 'SYNAPSE'
  | 'SUPPRESSOR'
  | 'LOBOTOMIZER'
  | 'ECHO'
  | 'CAUTERY'
  | 'CENTRIFUGE'
  | 'DEFIBRILLATOR'
  | 'BIOBANK';

export type DamageKind = 'kinetic' | 'chemical' | 'thermal' | 'electric';

export type TargetMode = 'first' | 'strong' | 'last';

/** One tier of an instrument. Ranges are in cells, intervals in seconds, damage per hit (or per second for beams/auras). */
export interface TowerTier {
  /** Price of this tier: the build cost for tier I, the upgrade cost for II and III. */
  cost: number;
  range: number;
  damage: number;
  interval: number;
  /** Targets hit per volley (Synapse III fires at two). */
  targets?: number;
  /** Fraction of speed removed while inside the field (Suppressor) or after a hit (Centrifuge III). */
  slow?: number;
  slowTime?: number;
  /** Damage taken is multiplied by 1 + vulnerable while inside the field. */
  vulnerable?: number;
  /** Burn applied by the beam: damage per second for burnTime seconds; burning stops regeneration. */
  burnDps?: number;
  burnTime?: number;
  /** Splash radius in cells (Centrifuge). */
  splash?: number;
  /** Extra jumps after the first target (Defibrillator). */
  chains?: number;
  /** Stun on hit, seconds. */
  stun?: number;
  /** Echo's aura: damage and fire-rate bonus to instruments in range. */
  buffDamage?: number;
  buffRate?: number;
  /** Reveals cloaked specimens within range (Echo II+, every Defibrillator). */
  reveal?: boolean;
  /** Lobotomizer III: a hit that leaves a non-boss below this fraction of max HP kills it. */
  execute?: number;
  /** Biobank: serum paid when a wave is cleared. */
  income?: number;
}

export interface TowerDef {
  type: TowerType;
  kind: DamageKind | null;
  /** How the instrument delivers damage. */
  attack: 'pulse' | 'aura' | 'precision' | 'support' | 'beam' | 'splash' | 'chain' | 'income';
  /** Armour does not reduce this instrument's hits. */
  pierce?: boolean;
  /** Hits cloaked specimens without a reveal (splash). */
  hitsCloaked?: boolean;
  defaultTarget: TargetMode;
  tiers: readonly [TowerTier, TowerTier, TowerTier];
}

export const TOWER_ORDER: readonly TowerType[] = [
  'SYNAPSE',
  'SUPPRESSOR',
  'CAUTERY',
  'CENTRIFUGE',
  'DEFIBRILLATOR',
  'LOBOTOMIZER',
  'ECHO',
  'BIOBANK',
];

export const TOWERS: Record<TowerType, TowerDef> = {
  SYNAPSE: {
    type: 'SYNAPSE',
    kind: 'kinetic',
    attack: 'pulse',
    defaultTarget: 'first',
    tiers: [
      { cost: 60, range: 2.3, damage: 10, interval: 0.6 },
      { cost: 80, range: 2.6, damage: 18, interval: 0.5 },
      { cost: 170, range: 2.9, damage: 30, interval: 0.42, targets: 2 },
    ],
  },
  SUPPRESSOR: {
    type: 'SUPPRESSOR',
    kind: 'chemical',
    attack: 'aura',
    defaultTarget: 'first',
    tiers: [
      { cost: 90, range: 1.8, damage: 4, interval: 0, slow: 0.3 },
      { cost: 100, range: 2.0, damage: 8, interval: 0, slow: 0.38 },
      { cost: 200, range: 2.3, damage: 14, interval: 0, slow: 0.45, vulnerable: 0.2 },
    ],
  },
  CAUTERY: {
    type: 'CAUTERY',
    kind: 'thermal',
    attack: 'beam',
    pierce: true,
    defaultTarget: 'first',
    tiers: [
      { cost: 110, range: 1.8, damage: 26, interval: 0, burnDps: 6, burnTime: 2 },
      { cost: 130, range: 2.0, damage: 48, interval: 0, burnDps: 12, burnTime: 2.5 },
      { cost: 260, range: 2.2, damage: 84, interval: 0, burnDps: 22, burnTime: 3 },
    ],
  },
  CENTRIFUGE: {
    type: 'CENTRIFUGE',
    kind: 'chemical',
    attack: 'splash',
    hitsCloaked: true,
    defaultTarget: 'first',
    tiers: [
      { cost: 140, range: 3.2, damage: 24, interval: 1.6, splash: 0.95 },
      { cost: 150, range: 3.6, damage: 44, interval: 1.4, splash: 1.1 },
      { cost: 290, range: 4.0, damage: 78, interval: 1.2, splash: 1.3, slow: 0.25, slowTime: 1 },
    ],
  },
  DEFIBRILLATOR: {
    type: 'DEFIBRILLATOR',
    kind: 'electric',
    attack: 'chain',
    defaultTarget: 'first',
    tiers: [
      { cost: 150, range: 2.6, damage: 18, interval: 1.3, chains: 2, reveal: true },
      { cost: 160, range: 2.9, damage: 30, interval: 1.1, chains: 3, reveal: true },
      { cost: 300, range: 3.2, damage: 52, interval: 0.9, chains: 5, stun: 0.25, reveal: true },
    ],
  },
  LOBOTOMIZER: {
    type: 'LOBOTOMIZER',
    kind: 'kinetic',
    attack: 'precision',
    pierce: true,
    defaultTarget: 'strong',
    tiers: [
      { cost: 170, range: 5, damage: 80, interval: 2.4 },
      { cost: 190, range: 6, damage: 160, interval: 2.1 },
      { cost: 340, range: 7, damage: 290, interval: 1.8, execute: 0.12 },
    ],
  },
  ECHO: {
    type: 'ECHO',
    kind: null,
    attack: 'support',
    defaultTarget: 'first',
    tiers: [
      { cost: 120, range: 1.6, damage: 0, interval: 0, buffDamage: 0.15, buffRate: 0.1 },
      { cost: 140, range: 1.9, damage: 0, interval: 0, buffDamage: 0.25, buffRate: 0.15, reveal: true },
      { cost: 260, range: 2.2, damage: 0, interval: 0, buffDamage: 0.35, buffRate: 0.2, reveal: true },
    ],
  },
  BIOBANK: {
    type: 'BIOBANK',
    kind: null,
    attack: 'income',
    defaultTarget: 'first',
    tiers: [
      { cost: 120, range: 0, damage: 0, interval: 0, income: 24 },
      { cost: 150, range: 0, damage: 0, interval: 0, income: 44 },
      { cost: 240, range: 0, damage: 0, interval: 0, income: 70 },
    ],
  },
};

/** Refund on sale, as a fraction of everything spent on the instrument. */
export const SELL_REFUND = 0.7;

// ── Specimens (enemies) ──────────────────────────────────────────────────────

export type EnemyType =
  | 'ANXIETY'
  | 'GUILT'
  | 'FRAGMENT'
  | 'DEPRESSION'
  | 'MANIC'
  | 'DOUBT'
  | 'OBSESSION'
  | 'PARANOIA'
  | 'DREAD'
  | 'PATIENT'
  | 'SURGEON'
  | 'SPECIMEN';

export interface EnemyDef {
  type: EnemyType;
  /** Base HP at wave 1 (scaled by `hpScale`). */
  hp: number;
  /** Cells per second. */
  speed: number;
  /** Flat reduction per hit, after vulnerability; pierce and burn ignore it. Never below 1 damage. */
  armor: number;
  bounty: number;
  /** Integrity lost if it reaches the exit. */
  leak: number;
  /** Cost against a wave's threat budget. */
  threat: number;
  /** Shield HP as a fraction of max HP; absorbs damage first, electric does triple to it. */
  shield?: number;
  /** Regenerates this fraction of max HP per second unless burning. */
  regen?: number;
  cloaked?: boolean;
  /** Heals specimens within `radius` cells by `pct` of their max HP every `every` seconds. */
  heal?: { radius: number; pct: number; every: number };
  /** On death, releases `count` of `type` at the same place on the path. */
  split?: { type: EnemyType; count: number };
  /** Alternates between slow and fast every `period` seconds (speed is the average). */
  burst?: { period: number; ratio: number };
  boss?: boolean;
  /** Boss: releases `count` of `type` each time another `every` of its HP is lost. */
  brood?: { type: EnemyType; count: number; every: number };
  /** Boss: stuns instruments within `radius` cells for `time` seconds every `every` seconds. */
  sever?: { radius: number; time: number; every: number };
  /** Boss: below half HP the shell comes off and it moves this much faster. */
  shed?: { speedMul: number };
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  ANXIETY: { type: 'ANXIETY', hp: 26, speed: 1.6, armor: 0, bounty: 4, leak: 1, threat: 1 },
  GUILT: {
    type: 'GUILT',
    hp: 48,
    speed: 1.2,
    armor: 0,
    bounty: 5,
    leak: 1,
    threat: 2,
    split: { type: 'FRAGMENT', count: 2 },
  },
  FRAGMENT: { type: 'FRAGMENT', hp: 14, speed: 1.9, armor: 0, bounty: 1, leak: 1, threat: 0 },
  DEPRESSION: { type: 'DEPRESSION', hp: 170, speed: 0.7, armor: 7, bounty: 13, leak: 2, threat: 5 },
  MANIC: {
    type: 'MANIC',
    hp: 44,
    speed: 2.1,
    armor: 0,
    bounty: 6,
    leak: 1,
    threat: 2,
    burst: { period: 1, ratio: 3 },
  },
  DOUBT: { type: 'DOUBT', hp: 80, speed: 1.1, armor: 0, bounty: 9, leak: 1, threat: 4, shield: 0.75 },
  OBSESSION: { type: 'OBSESSION', hp: 120, speed: 0.9, armor: 0, bounty: 10, leak: 1, threat: 4, regen: 0.035 },
  PARANOIA: { type: 'PARANOIA', hp: 72, speed: 1.3, armor: 0, bounty: 11, leak: 1, threat: 4, cloaked: true },
  DREAD: {
    type: 'DREAD',
    hp: 110,
    speed: 0.9,
    armor: 2,
    bounty: 13,
    leak: 2,
    threat: 5,
    heal: { radius: 1.5, pct: 0.08, every: 2 },
  },
  PATIENT: {
    type: 'PATIENT',
    hp: 700,
    speed: 0.45,
    armor: 3,
    bounty: 120,
    leak: 8,
    threat: 0,
    boss: true,
    brood: { type: 'ANXIETY', count: 4, every: 0.25 },
  },
  SURGEON: {
    type: 'SURGEON',
    hp: 850,
    speed: 0.6,
    armor: 4,
    bounty: 150,
    leak: 8,
    threat: 0,
    boss: true,
    sever: { radius: 1.5, time: 1.5, every: 5 },
  },
  SPECIMEN: {
    type: 'SPECIMEN',
    hp: 1000,
    speed: 0.5,
    armor: 2,
    bounty: 180,
    leak: 9,
    threat: 0,
    boss: true,
    shield: 0.35,
    regen: 0.01,
    shed: { speedMul: 1.7 },
  },
};

/** The wave each specimen is first catalogued (and the dossier shown before it). */
export const INTRODUCED_AT: Partial<Record<EnemyType, number>> = {
  ANXIETY: 1,
  GUILT: 3,
  DEPRESSION: 4,
  PATIENT: 5,
  MANIC: 6,
  DOUBT: 7,
  OBSESSION: 8,
  PARANOIA: 9,
  SURGEON: 10,
  DREAD: 11,
  SPECIMEN: 15,
};

export const BOSS_CYCLE: readonly EnemyType[] = ['PATIENT', 'SURGEON', 'SPECIMEN'];
export const BOSS_EVERY = 5;

// ── Waves ────────────────────────────────────────────────────────────────────

export const WAVES = {
  /** Clearing this wave is containment: the victory screen, then optional overtime. */
  GOAL: 40,
  /** The run ends, complete, when this wave is cleared. */
  CAP: 100,
  /** Threat budget of wave w: BASE + PER_WAVE * w. */
  BUDGET_BASE: 8,
  BUDGET_PER_WAVE: 3.1,
  /** Seconds between spawns inside a group, and between groups. */
  GAP: 0.85,
  GROUP_GAP: 1.6,
};

/** HP multiplier for wave w: quadratic through the campaign, then compounding in overtime. */
export function hpScale(wave: number): number {
  const n = wave - 1;
  const base = (1 + 0.1 * n) * Math.pow(1.075, n);
  const over = wave > WAVES.GOAL ? Math.pow(1.045, wave - WAVES.GOAL) : 1;
  return base * over;
}

/** Bounty multiplier for wave w (bounties grow slower than HP: income is linear, threat is not). */
export function bountyScale(wave: number): number {
  return 1 + 0.005 * (wave - 1);
}

// ── Economy ──────────────────────────────────────────────────────────────────

export const ECONOMY = {
  START_SERUM: 260,
  START_INTEGRITY: 20,
  /** Paid when a wave is cleared: BASE + PER_WAVE * w. */
  CLEAR_BASE: 25,
  CLEAR_PER_WAVE: 3,
  /** Paid for calling a wave early: BASE + PER_WAVE * w. */
  EARLY_BASE: 10,
  EARLY_PER_WAVE: 1,
};

// ── Maps ─────────────────────────────────────────────────────────────────────

export type MapId = 'intake' | 'vault' | 'theatre';

export interface MapDef {
  id: MapId;
  /** 13 rows of 20: '.' bench (buildable), '#' corridor, 'S' entry, 'E' exit, 'x' fixture (blocked). */
  layout: readonly string[];
  /** Specimen HP multiplier on this map. */
  hp: number;
  /** Score multiplier on this map. */
  scoreMul: number;
}

export const MAPS: Record<MapId, MapDef> = {
  // A serpentine corridor through the intake ward: the teaching map.
  intake: {
    id: 'intake',
    hp: 1,
    scoreMul: 1,
    layout: [
      '....................',
      'S######.....x.......',
      '......#.............',
      '..x...#..#########..',
      '......#..#.......#..',
      '......#..#...x...#..',
      '......####.......#..',
      '.................#..',
      '...#######.......#..',
      '...#.....#########..',
      '...#...........x....',
      '...################E',
      '....................',
    ],
  },
  // A long spiral into the vault's centre: twice the corridor, much tougher specimens.
  vault: {
    id: 'vault',
    hp: 0.7,
    scoreMul: 1.25,
    layout: [
      'S##################.',
      '..................#.',
      '.################.#.',
      '.#..............#.#.',
      '.#.############.#.#.',
      '.#.#..........#.#.#.',
      '.#.#.###E.....#.#.#.',
      '.#.#.#........#.#.#.',
      '.#.#.##########.#.#.',
      '.#.#............#.#.',
      '.#.##############.#.',
      '.#................#.',
      '.##################.',
    ],
  },
  // Two streams from both doors of the theatre that merge mid-floor and wind out through the gallery.
  theatre: {
    id: 'theatre',
    hp: 1.0,
    scoreMul: 1.5,
    layout: [
      'S###................',
      '...#.........x......',
      '...#####........###.',
      '.......#........#.#.',
      '..x....#####....#.#.',
      '...........#....#.#.',
      '...........######.#.',
      '...........#......#.',
      '.......#####......#.',
      '.......#.....x....#.',
      '...#####..........#.',
      '...#..........#####.',
      'S###..........E.....',
    ],
  },
};

export const MAP_ORDER: readonly MapId[] = ['intake', 'vault', 'theatre'];

// ── Score ────────────────────────────────────────────────────────────────────

export const SCORE = {
  /** A cleared wave w is worth PER_WAVE * w, times the map, perfect and early multipliers. */
  PER_WAVE: 40,
  /** No integrity lost to that wave's specimens. */
  PERFECT_MUL: 1.2,
  /** The wave was called while the previous one was still on the board. */
  EARLY_MUL: 1.25,
  /** On containment (wave GOAL cleared): this much per point of integrity left, times the map. */
  INTEGRITY_BONUS: 250,
};
