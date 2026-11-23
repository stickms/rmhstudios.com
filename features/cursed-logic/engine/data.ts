/**
 * Every number in Cursed Logic, in one place (plan Task 5, "numbers live in one data file").
 *
 * The balance claims these numbers are held to are asserted by `__tests__/balance.test.ts` (a seeded simulation) and
 * written up for the owner in `docs/cursed-logic/balance.md`. Change a number here, re-run the test, and update the
 * table there.
 */
import type {
  PactId,
  PlayerAction,
  ProtocolAction,
  ProtocolId,
  RoundModifier,
  RunUpgradeId,
  ShopItemId,
  Stance,
} from './types';

// ── The player ──────────────────────────────────────────────────────────────────────────────────────────────────

export const PLAYER = {
  /** Integrity at the start of a run; it carries from duel to duel. */
  maxIntegrity: 15,
  /** Ceiling the Hull ware can raise max Integrity to. */
  integrityCeiling: 23,
  /** Charge at the start of each duel. */
  startCharge: 2,
  chargeCap: 5,
  /** Charge gained at the start of every round after the first. */
  chargeRegen: 1,
  /** Integrity restored between two duels (a field patch). */
  patchBetweenDuels: 2,
} as const;

/** What an action costs in Charge. Acting without the Charge is an overdraw: you act and take `DAMAGE.overdraw`. */
export const ACTION_COST: Record<PlayerAction, number> = {
  Strike: 1,
  Block: 1,
  Prepare: 0,
  Probe: 1,
};

/** Reinforcing an action costs this much more Charge. */
export const REINFORCE_COST = 1;

export const DAMAGE = {
  strike: 2,
  /** A Protocol's Strike: they hit harder than you, so reading them matters more than racing them. */
  protocolStrike: 3,
  /** Added to a Strike made while primed (after a Prepare that held). */
  primedBonus: 2,
  /** A Strike into a Block deals this much (chip). */
  chip: 1,
  /** Striking someone who is Preparing interrupts them for this much extra. */
  interruptBonus: 1,
  /** Overdraw penalty. */
  overdraw: 1,
  /** A reinforced Strike deals this much more; a reinforced Block takes no chip and reflects `reinforceReflect`. */
  reinforceStrike: 1,
  reinforceReflect: 1,
  /** Conditions: Exposed/LockedIn take this much more when hit; Shaken/Overextended take this much more chip. */
  condition: 1,
} as const;

// ── Stances ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The twelve stances (the old game had eighteen; six were duplicates of another's effect — Break was Pressure,
 * Deflect was Guard, Endure was Resist, Bulk and Focus were Counter and Harvest at half strength, and Steady only
 * mattered on an overdraw — and were folded in). Each round offers `STANCE_OFFER` of them.
 */
export const STANCES: readonly Stance[] = [
  'Commit',
  'Guard',
  'Read',
  'Pressure',
  'Counter',
  'Recover',
  'Scan',
  'Harvest',
  'Resist',
  'Reckless',
  'Surge',
  'Bastion',
];

export const STANCE_OFFER = 3;

/** Per-stance numbers (what "+1" means for each). Tuned by the stance simulation. */
export const STANCE_NUMBERS = {
  /** Commit: Strike damage bonus. */
  commitStrike: 2,
  /** Pressure: chip dealt when you Strike into a Block (and you are not Overextended after). */
  pressureChip: 3,
  /** Counter: damage reflected when you Block a Strike. */
  counterReflect: 2,
  /** Recover: heal on a Prepare that holds. */
  recoverHeal: 2,
  /** Reckless: Strike damage bonus, and extra damage you take when hit. */
  recklessStrike: 3,
  recklessPenalty: 1,
  /** Surge: heal when one clash deals at least `surgeThreshold` damage, unless you were primed (no double dip). */
  surgeHeal: 1,
  surgeThreshold: 3,
  /** Bastion: damage the Protocol takes when you take damage. */
  bastionThorns: 1,
  /** Resist: damage you take this round is reduced by this, and so is your Strike. */
  resistReduce: 1,
  /** Scan: Charge a Probe made in Scan gives back. */
  scanCharge: 1,
  /** Harvest: Charge gained when you deal damage. */
  harvestCharge: 1,
  /** Read: a Prepare holds even when struck, and the hit is reduced by this. */
  readReduce: 1,
  /** Read: Charge a Prepare made in Read gives back when it holds. */
  readCharge: 1,
} as const;

// ── Round modifiers ─────────────────────────────────────────────────────────────────────────────────────────────

export const MODIFIERS: readonly RoundModifier[] = ['Overcharge', 'NoBlock', 'Chaos', 'ChargeDrain', 'Reveal', 'Static'];
/** Chance a round is mutated; doubled by the Chaos Run pact. NULL//ROOT forces one every `bossMutationEvery` rounds. */
export const MUTATION_CHANCE = 0.18;
export const BOSS_MUTATION_EVERY = 3;

// ── Protocols (the opponents) ───────────────────────────────────────────────────────────────────────────────────

export type ProtocolTrait =
  | 'bulwark' // Warden: Striking into its Block reflects 1 back
  | 'mirror' // Mimic: often copies your last action
  | 'overclock' // Berserk: Strikes +1 at or below half health
  | 'forked' // Liar: its tells are mostly lies
  | 'siphon' // Leech: a Strike that lands heals it 1
  | 'predict' // Oracle: counters your habit over the last three rounds
  | 'corrupt' // NULL//ROOT: two phases, forces mutations
  | 'scripted'; // Trainer: the tutorial's scripted opponent

export interface ProtocolDef {
  id: ProtocolId;
  /** Health before the sector bonus. */
  health: number;
  /** Base weights for its action. */
  weights: Record<ProtocolAction, number>;
  /** Chance its tell shows the action it really chose (the rest are bluffs). */
  honesty: number;
  /** Chance its chosen action is replaced at random after the tell (a glitch). */
  glitch: number;
  /** Chance it Strikes when primed. */
  primedStrike: number;
  /** Weight added toward the counter of your last action ("it learns"). */
  adapt: number;
  trait: ProtocolTrait;
  /** Strength of the trait (mirror/predict chance, overclock/siphon amount). */
  traitPower: number;
}

export const PROTOCOLS: Record<ProtocolId, ProtocolDef> = {
  trainer: {
    id: 'trainer',
    health: 6,
    weights: { Strike: 30, Block: 30, Prepare: 20, Idle: 20 },
    honesty: 1,
    glitch: 0,
    primedStrike: 1,
    adapt: 0,
    trait: 'scripted',
    traitPower: 0,
  },
  warden: {
    id: 'warden',
    health: 13,
    weights: { Strike: 26, Block: 42, Prepare: 14, Idle: 18 },
    honesty: 0.85,
    glitch: 0.05,
    primedStrike: 0.7,
    adapt: 10,
    trait: 'bulwark',
    traitPower: 1,
  },
  mimic: {
    id: 'mimic',
    health: 14,
    weights: { Strike: 32, Block: 30, Prepare: 20, Idle: 18 },
    honesty: 0.75,
    glitch: 0.08,
    primedStrike: 0.8,
    adapt: 0,
    trait: 'mirror',
    traitPower: 0.5,
  },
  berserk: {
    id: 'berserk',
    health: 14,
    weights: { Strike: 50, Block: 18, Prepare: 20, Idle: 12 },
    honesty: 0.8,
    glitch: 0.06,
    primedStrike: 0.95,
    adapt: 6,
    trait: 'overclock',
    traitPower: 1,
  },
  liar: {
    id: 'liar',
    health: 14,
    weights: { Strike: 36, Block: 30, Prepare: 18, Idle: 16 },
    honesty: 0.15,
    glitch: 0.06,
    primedStrike: 0.85,
    adapt: 10,
    trait: 'forked',
    traitPower: 0,
  },
  leech: {
    id: 'leech',
    health: 15,
    weights: { Strike: 34, Block: 24, Prepare: 30, Idle: 12 },
    honesty: 0.7,
    glitch: 0.06,
    primedStrike: 0.9,
    adapt: 10,
    trait: 'siphon',
    traitPower: 1,
  },
  oracle: {
    id: 'oracle',
    health: 15,
    weights: { Strike: 32, Block: 32, Prepare: 20, Idle: 16 },
    honesty: 0.6,
    glitch: 0.04,
    primedStrike: 0.85,
    adapt: 0,
    trait: 'predict',
    traitPower: 0.45,
  },
  nullroot: {
    id: 'nullroot',
    health: 24,
    weights: { Strike: 36, Block: 30, Prepare: 22, Idle: 12 },
    honesty: 0.55,
    glitch: 0.08,
    primedStrike: 0.9,
    adapt: 12,
    trait: 'corrupt',
    traitPower: 0.4,
  },
};

// ── The run ladder ──────────────────────────────────────────────────────────────────────────────────────────────

export interface SectorDef {
  /** 1-based. */
  index: number;
  /** Duels in this sector. */
  duels: number;
  /** Protocols that can be drawn here (no repeats within a run while others remain). */
  pool: readonly ProtocolId[];
  /** Health added to every Protocol in this sector. */
  healthBonus: number;
  /** Strike damage added to every Protocol in this sector. */
  strikeBonus: number;
  /** A milestone shop opens after the sector's last duel. */
  shop: boolean;
}

export const SECTORS: readonly SectorDef[] = [
  { index: 1, duels: 2, pool: ['warden', 'mimic'], healthBonus: 0, strikeBonus: 0, shop: true },
  { index: 2, duels: 2, pool: ['mimic', 'berserk', 'leech'], healthBonus: 1, strikeBonus: 0, shop: true },
  { index: 3, duels: 2, pool: ['berserk', 'liar', 'leech'], healthBonus: 2, strikeBonus: 0, shop: true },
  { index: 4, duels: 2, pool: ['liar', 'oracle', 'leech'], healthBonus: 3, strikeBonus: 1, shop: true },
  { index: 5, duels: 1, pool: ['nullroot'], healthBonus: 2, strikeBonus: 1, shop: false },
];

export const TOTAL_DUELS = SECTORS.reduce((n, s) => n + s.duels, 0);

// ── Fragments, the shop and the milestone pick ──────────────────────────────────────────────────────────────────

export const FRAGMENTS = {
  /** Earned for winning a duel: base + per sector. */
  duelBase: 3,
  duelPerSector: 1,
  /** Bonus for a duel won without losing Integrity. */
  flawless: 2,
} as const;

/** Wares offered at a milestone shop. `patch` is always on the shelf; `SHOP_SHELF` others are drawn. */
export const SHOP_PRICES: Record<ShopItemId, number> = {
  patch: 4,
  hull: 7,
  capacitor: 6,
  decoder: 5,
  strikePlus1: 10,
  blockReflect: 8,
  probeReveals2: 5,
  prepareHeal: 6,
  chargeOnHit: 6,
};

export const SHOP_SHELF = 3;

export const SHOP_NUMBERS = {
  /** Patch heals this much. */
  patchHeal: 5,
  /** Hull raises max Integrity by this much and heals the same. */
  hullMax: 2,
  /** Capacitor raises the Charge cap and the duel-start Charge by this much. */
  capacitorCharge: 1,
  /** Decoder: uses per duel of "is this tell true?". */
  decoderUses: 1,
} as const;

export const RUN_UPGRADES: readonly RunUpgradeId[] = [
  'strikePlus1',
  'blockReflect',
  'probeReveals2',
  'prepareHeal',
  'chargeOnHit',
];

// ── Pacts ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Pact score bonuses; they add (all four: x2.25). */
export const PACTS: Record<PactId, { bonus: number }> = {
  chaosRun: { bonus: 0.25 }, // mutations twice as often, Protocols glitch twice as often
  glassCannon: { bonus: 0.5 }, // max Integrity 8, your Strikes +1
  doubleDown: { bonus: 0.2 }, // every Strike on both sides +1
  blackout: { bonus: 0.3 }, // no tell on even rounds
};

export const GLASS_CANNON_INTEGRITY = 8;

// ── Score ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const SCORE = {
  /** Per duel won, times the sector. */
  duelPerSector: 1000,
  /** Per point of Integrity left when a duel is won. */
  perIntegrity: 60,
  /** Per sector, for a duel won without losing Integrity. */
  flawlessPerSector: 400,
  /** A duel won in fewer rounds than `parRounds` earns `perRoundUnderPar` per round saved. */
  parRounds: 10,
  perRoundUnderPar: 75,
  /** Beating NULL//ROOT. */
  runVictory: 8000,
} as const;

/** Chance the simulation's player wins a minigame (the UI lets a player turn minigames off: no adjustment). */
export const SIM_MINIGAME_SUCCESS = 0.6;
