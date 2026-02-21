/**
 * Temple of Joy — Core TypeScript Types
 */

// ─── IDs ─────────────────────────────────────────────────────────────────────

export type SourceId =
  | 'moodCandle' | 'napPod' | 'snackBar' | 'sweetTreat' | 'hotTub'
  | 'massageStudio' | 'retailTherapy' | 'gratitudeJournal' | 'goonCave' | 'joyCult'
  | 'spaSanctum' | 'soundBath' | 'therapy' | 'pleasurePalace' | 'dopamineLab'
  | 'artGallery' | 'hedonistMonastery' | 'feastHall' | 'nirvanaResort'
  | 'eternalParty' | 'heavenOnEarth' | 'blissSingularity'
  | 'zenGarden' | 'euphoriaSprings' | 'serenityEngine'
  | 'raptureCathedral' | 'cosmicJacuzzi' | 'omniscientSpa';

export type UpgradePath =
  | 'carnal' | 'social' | 'mind' | 'spirit' | 'indulgence' | 'philosophy' | 'offering' | 'synergy';

export type RelicId =
  | 'epicurusRing' | 'laurelCrown' | 'incenseOfAncients' | 'stuffedPillow'
  | 'goldenFork' | 'confessionBooth' | 'vibeCrystal' | 'philosophersStone'
  | 'warmBlanket' | 'sacredLedger' | 'hymnalOfExcess' | 'eternalNap'
  | 'karmaResonator' | 'lighthouseOfJoy' | 'temporalComfort' | 'infiniteGratitude'
  | 'bubbleTeaCard' | 'cozyPlaylist' | 'zenBell' | 'nappingCat';

export type EventType = 'blessing' | 'choice' | 'philosophical';

export type WheelTier = 1 | 2 | 3 | 4 | 5;

// ─── Data Definitions ────────────────────────────────────────────────────────

export interface SourceDef {
  id: SourceId;
  name: string;
  tagline: string;
  icon: string;
  baseCost: number;
  baseHPS: number;
  /** Cost multiplier per additional copy (default 1.15) */
  costMultiplier?: number;
  /** Minimum lifetime HP required to unlock (optional secondary gate) */
  lifetimeHPUnlock?: number;
  /** Minimum prestige count required to unlock */
  requiresPrestige?: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  flavor: string;
  path: UpgradePath;
  cost: number;
  /** Which sources' HPS this boosts (undefined = all) */
  targetSources?: SourceId[];
  /** Multiplier applied to targetSources HPS */
  sourceMultiplier?: number;
  /** Flat HPC addition */
  hpcBonus?: number;
  /** HPC multiplier */
  hpcMultiplier?: number;
  /** Global HPS multiplier */
  globalHPSMultiplier?: number;
  /** HPS multiplier applied only when idle (no click in last 10s) */
  idleHPSMultiplier?: number;
  /** Karma bonus (flat, one-time) */
  karmaBonus?: number;
  /** Karma per second multiplier */
  karmaRateMultiplier?: number;
  /** Requires this many of a source to unlock */
  requiresSource?: Partial<Record<SourceId, number>>;
  /** Requires prestige count >= value */
  requiresPrestige?: number;
  /** Requires specific upgrade purchased first */
  requiresUpgrade?: string;
  /** Only visible / purchasable after first prestige */
  postPrestige?: boolean;
}

export interface SynergyDef {
  id: string;
  name: string;
  flavor: string;
  requirements: Partial<Record<SourceId, number>>;
  targetSources: SourceId[];
  multiplier: number;
}

export interface RelicDef {
  id: RelicId;
  name: string;
  description: string;
  flavorText: string;
  karmaCost: number;
}

export interface EventChoice {
  label: string;
  effect: EventEffect;
}

export interface EventEffect {
  happinessBonus?: number;          // flat HP bonus
  hpsMultiplierDuration?: number;   // seconds
  hpsMultiplier?: number;
  karmaBonus?: number;
  permanentHPSPercent?: number;     // e.g. 0.05 = +5% permanent
  permanentHPCPercent?: number;
}

export interface GameEventDef {
  id: string;
  type: EventType;
  title: string;
  body: string;
  choices?: EventChoice[];          // choice / philosophical events
  effect?: EventEffect;             // blessing events
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  flavor: string;
  hidden?: boolean;
}

export interface MilestoneDef {
  id: string;
  /** Lifetime HP threshold */
  threshold: number;
  label: string;
  /** Flat HPS bonus */
  hpsBonus?: number;
  /** Global HPS multiplier */
  hpsMultiplier?: number;
}

export interface WheelUpgradeDef {
  id: string;
  name: string;
  description: string;
  shardCost: number;
  tier: WheelTier;
  /** IDs of any Tier N-1 upgrades required */
  requires?: string[];
}

// ─── Runtime Active Buffs ─────────────────────────────────────────────────────

export interface TimedBuff {
  id: string;
  hpsMultiplier: number;
  remainingSeconds: number;
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  // ── Currencies ──
  happiness: number;
  lifetimeHappiness: number;       // total earned this run (for transcendence threshold)
  peakHappiness: number;           // highest happiness reached this run
  peakKarma: number;               // highest karma reached (sticky unlock tracking)
  karma: number;
  blissShards: number;

  // ── Sources ──
  sources: Record<SourceId, number>;

  // ── Upgrades (purchased IDs) ──
  upgrades: Set<string>;

  // ── Relics ──
  activeRelics: RelicId[];
  maxRelicSlots: number;
  equippedRelicsHistory: RelicId[]; // tracking for `allRelics` achievement

  // ── Prestige ──
  prestigeCount: number;
  wheelPurchased: Set<string>;
  /** HPS % bonus from Samsara's Gift: +5% per prestige, up to 20 stacks */
  samsaraGiftStacks: number;

  // ── Meta ──
  lastSaved: number;               // Unix ms timestamp
  lastTickTime: number;            // Unix ms timestamp of most recent tick
  totalPlaytime: number;           // seconds
  totalClicks: number;             // total button clicks (for achievements)
  totalPilgrimages: number;        // total pilgrimages completed
  totalVibeChecks: number;         // total vibe checks passed
  totalEventsResolved: number;     // total events resolved
  achievements: Set<string>;
  milestones: Set<string>;
  pilgrimageStreak: number;        // consecutive pilgrimages without clicking
  epicurusApprovedCount: number;   // number of frugal philosophical choices made

  // ── Hedonic Treadmill ──
  baselineHappiness: number;

  // ── Special Mechanics ──
  vibeCheckTimer: number;          // seconds until next vibe check
  vibeBuff: TimedBuff | null;      // active vibe buff
  pilgrimageActive: boolean;
  pilgrimageTimer: number;         // countdown seconds
  pilgrimageCooldown: number;      // remaining cooldown seconds
  ritualCooldown: number;          // remaining ritual cooldown seconds
  recentClickTimes: number[];      // timestamps (ms) of last 7 clicks for ritual detection
  eventTimer: number;              // seconds until next random event
  pendingEvent: string | null;     // ID of event waiting to be shown
  autoBuyTimer: number;            // seconds until next auto-buy attempt
  lastEventEffect: {               // effect from last resolved event (for display)
    title: string;
    summary: string[];             // lines describing what happened
    expiresAt: number;             // ms timestamp when to hide
  } | null;

  // ── Timed Buffs ──
  activeBuffs: TimedBuff[];

  // ── Permanent per-run multipliers (from Choice events etc.) ──
  permanentHPSBonus: number;       // additive %, e.g. 0.05 = +5%
  permanentHPCBonus: number;

  // ── Idle tracking ──
  lastClickTime: number;           // ms timestamp

  // ── Sacred Ledger Relic tracking ──
  pageOpenTime: number;            // ms timestamp when page was opened

  // ── Offline Modal ──
  offlineHappinessOnLoad: number;
  offlineSecondsOnLoad: number;

  // ── Settings ──
  theme: 'light' | 'dark';
  numberFormat: 'abbreviated' | 'scientific';
  soundEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  autoBuyEnabled: boolean;

  // ── UI ──
  activeTab: 'temple' | 'sources' | 'upgrades' | 'relics' | 'wheel' | 'achievements' | 'settings';
  upgradePathFilter: UpgradePath | 'all';
  sourceBuyQty: 1 | 10 | 100 | 'max';
  showTranscendenceModal: boolean;
  showOfflineModal: boolean;
  showEventModal: boolean;
  gameInitialized: boolean;
}

// ─── Save Data (serialisable) ─────────────────────────────────────────────────

export interface SaveData {
  version: number;
  happiness: number;
  lifetimeHappiness: number;
  peakHappiness: number;
  peakKarma: number;
  karma: number;
  blissShards: number;
  sources: Record<SourceId, number>;
  upgrades: string[];
  activeRelics: RelicId[];
  maxRelicSlots: number;
  equippedRelicsHistory: RelicId[];
  prestigeCount: number;
  wheelPurchased: string[];
  samsaraGiftStacks: number;
  lastSaved: number;
  totalPlaytime: number;
  totalClicks: number;
  totalPilgrimages: number;
  totalVibeChecks: number;
  totalEventsResolved: number;
  achievements: string[];
  milestones: string[];
  pilgrimageStreak: number;
  epicurusApprovedCount: number;
  baselineHappiness: number;
  pilgrimageCooldown: number;
  pilgrimageActive: boolean;
  pilgrimageTimer: number;
  autoBuyTimer: number;
  permanentHPSBonus: number;
  permanentHPCBonus: number;
  theme: 'light' | 'dark';
  numberFormat: 'abbreviated' | 'scientific';
  sourceBuyQty: 1 | 10 | 100 | 'max';
  soundEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  autoBuyEnabled: boolean;

  // Deprecated fields (backwards compat with old saves)
  /** @deprecated Use sources instead */
  buildings?: Record<SourceId, number>;
  /** @deprecated Use musicVolume/sfxVolume instead */
  soundVolume?: number;
  /** @deprecated Use sourceBuyQty instead */
  buildingBuyQty?: 1 | 10 | 100 | 'max';
}
