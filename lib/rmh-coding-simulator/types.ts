/**
 * RMH Coding Simulator — shared types.
 *
 * A two-layer-prestige incremental ("clicker") game where you write Lines of
 * Code, hire automated developers, ship products to earn Reputation, and
 * eventually IPO your studio for Equity. The economy curve mirrors Cookie
 * Clicker / AdVenture Capitalist (×1.15 per-building cost growth, cube-root
 * prestige scaling) so the long tail stretches into the hundreds of hours.
 */

export type GeneratorId = string;
export type UpgradeId = string;
export type SkillId = string;
export type PerkId = string;
export type AchievementId = string;

export type NumberFormat = 'short' | 'scientific';
export type BuyQty = 1 | 10 | 100 | 'max';
export type TabId = 'studio' | 'upgrades' | 'prestige' | 'archlab' | 'stats';

/** A static generator definition (an "auto-coder" you hire). */
export interface GeneratorDef {
  id: GeneratorId;
  name: string;
  emoji: string;
  blurb: string;
  baseCost: number;
  /** Lines of Code per second produced by ONE unit, before any multipliers. */
  baseCps: number;
}

/**
 * Effects a purchasable (upgrade / skill / perk) can apply. The engine reads
 * these off every owned item and folds them into the production math, so adding
 * content is purely data — no engine changes.
 */
export interface Effects {
  /** Multiply a single generator's per-unit output. */
  genMult?: { genId: GeneratorId; factor: number };
  /** Multiply EVERY generator's output (global tier). */
  globalMult?: number;
  /** Multiply click power. */
  clickMult?: number;
  /** Add a flat amount to each click. */
  clickFlat?: number;
  /** Add this fraction of total CpS to every click (cursor-style synergy). */
  clickFromCps?: number;
  /** Multiply how often golden commits spawn (>1 = more frequent). */
  goldenFreqMult?: number;
  /** Multiply golden-commit reward payouts. */
  goldenPowerMult?: number;
  /** Add hours to the offline-earnings cap. */
  offlineHours?: number;
  /** Multiply offline earning efficiency. */
  offlineEffMult?: number;
  /** Lines of Code granted immediately at the start of each new run. */
  startingLoc?: number;
}

export interface UpgradeDef extends Effects {
  id: UpgradeId;
  name: string;
  emoji: string;
  desc: string;
  cost: number;
  /** Optional gate: which generator must reach `count` before this unlocks. */
  requiresGen?: { genId: GeneratorId; count: number };
  /** Optional gate: total lifetime LoC (this run) before this unlocks. */
  requiresLifetime?: number;
}

export interface SkillDef extends Effects {
  id: SkillId;
  name: string;
  emoji: string;
  desc: string;
  /** Cost in Reputation stars. */
  cost: number;
  /** Other skills that must be owned first. */
  requires?: SkillId[];
  /** Display column for the tree layout. */
  tier: number;
}

export interface PerkDef extends Effects {
  id: PerkId;
  name: string;
  emoji: string;
  desc: string;
  /** Cost in Equity. */
  cost: number;
  requires?: PerkId[];
}

export interface AchievementDef {
  id: AchievementId;
  name: string;
  emoji: string;
  desc: string;
  /** Returns true when the player has earned it. */
  check: (s: GameState) => boolean;
  /** Hidden until earned (shows as "???"). */
  secret?: boolean;
}

/** A temporary multiplier currently in effect. */
export interface ActiveBuff {
  uid: string;
  name: string;
  emoji: string;
  cpsMult: number;
  clickMult: number;
  /** Seconds left. */
  remaining: number;
  duration: number;
}

/** Reward kinds a clicked golden commit can roll. */
export type GoldenKind = 'lucky' | 'frenzy' | 'clickFrenzy' | 'codeStorm' | 'buildFail';

/** A golden commit currently floating on screen, awaiting a click. */
export interface GoldenCommit {
  uid: string;
  /** Position as viewport percentages. */
  x: number;
  y: number;
  /** Seconds before it despawns. */
  life: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Client timestamp (ms). */
  at: number;
}

export interface GameState {
  // ── Currencies ──
  loc: number;
  lifetimeLoc: number; // resets each run; drives Reputation gain
  totalLoc: number; // all-time, never resets (achievements / stats)
  reputation: number; // spendable Reputation stars
  reputationEarned: number; // total stars earned this ascension → +% production
  equity: number; // spendable Equity
  equityEarned: number; // total Equity earned → +% production

  // ── Holdings ──
  generators: Record<GeneratorId, number>;
  upgrades: string[];
  skills: string[];
  perks: string[];
  achievements: string[];

  // ── Counters ──
  totalClicks: number;
  handmadeLoc: number; // LoC produced by clicking (not generators)
  shipCount: number; // "Ship It" prestiges this ascension
  ascensionCount: number; // total IPOs
  goldenClicks: number;
  aiCalls: number;

  // ── Live systems ──
  activeBuffs: ActiveBuff[];
  golden: GoldenCommit | null;
  goldenTimer: number; // seconds to next golden spawn

  // ── AI Architect ──
  chat: ChatMessage[];

  // ── Time ──
  lastTick: number;
  lastSaved: number;
  playtime: number; // seconds, all-time
  startedAt: number;

  // ── Offline catch-up (populated on load, shown once) ──
  offlineLocOnLoad: number;
  offlineSecondsOnLoad: number;

  // ── UI / settings ──
  numberFormat: NumberFormat;
  activeTab: TabId;
  buyQty: BuyQty;
  soundEnabled: boolean;
}

/** Serialised save payload (localStorage / export string). */
export interface SaveData {
  version: number;
  loc: number;
  lifetimeLoc: number;
  totalLoc: number;
  reputation: number;
  reputationEarned: number;
  equity: number;
  equityEarned: number;
  generators: Record<GeneratorId, number>;
  upgrades: string[];
  skills: string[];
  perks: string[];
  achievements: string[];
  totalClicks: number;
  handmadeLoc: number;
  shipCount: number;
  ascensionCount: number;
  goldenClicks: number;
  aiCalls: number;
  playtime: number;
  startedAt: number;
  lastSaved: number;
  numberFormat: NumberFormat;
  buyQty: BuyQty;
  soundEnabled: boolean;
}
