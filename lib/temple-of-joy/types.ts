/**
 * Temple of Joy — the type of the whole game.
 *
 * The economy is modelled directly on Cookie Clicker's, because that curve is
 * the best-tested one in the genre: 24 sources on a ×1.15 price ladder,
 * doubling tier upgrades, an achievement-scaled global multiplier, a cube-root
 * prestige, and a ~20-hour resource that gates the deepest layer. The numbers
 * in `data/` are that game's numbers; the flavour is ours.
 *
 * Everything here is plain data. No class carries behaviour, no field is a
 * function, and the whole state serialises — which is what lets the tick be a
 * pure `state -> state` and the save be `JSON.stringify`.
 */

// ─── Sources ─────────────────────────────────────────────────────────────────

/**
 * The twenty-four things that make joy for you, cheapest first. The first
 * twenty mirror Cookie Clicker's building ladder one-for-one; the last four
 * continue it at the same ratios so the late game doesn't simply stop.
 */
export type SourceId =
  | 'acolyte'
  | 'devotee'
  | 'grove'
  | 'quarry'
  | 'chrismworks'
  | 'almshouse'
  | 'sanctuary'
  | 'scriptorium'
  | 'pilgrimFleet'
  | 'reliquary'
  | 'heavensGate'
  | 'hourglass'
  | 'raptureEngine'
  | 'prism'
  | 'fatebinder'
  | 'mandala'
  | 'apocrypha'
  | 'paradise'
  | 'oversoul'
  | 'beloved'
  | 'seraphim'
  | 'empyrean'
  | 'feast'
  | 'vision';

export interface SourceDef {
  id: SourceId;
  name: string;
  /** One line of flavour, shown under the name. */
  tagline: string;
  /** What the source says it is doing, in the ledger. */
  verb: string;
  icon: string;
  /** Price of the first copy. Every copy after costs ×1.15 the last. */
  baseCost: number;
  /** Joy per second, per copy, before any multiplier. */
  baseJps: number;
  /**
   * Levelling this source with Manna opens a minigame. Level 1 is the unlock;
   * further levels only add the standard +1% output.
   */
  minigame?: MinigameId;
}

// ─── Blessings (the upgrade layer) ───────────────────────────────────────────

/**
 * Why a blessing exists. Used for the filter rail and for deciding which ones a
 * newly-started run should re-offer first.
 */
export type BlessingKind =
  | 'source' // doubles one source
  | 'touch' // the click line
  | 'cherub' // multiplies everything, scaled by Devotion
  | 'synergy' // one source boosted by how many of another you own
  | 'halo' // golden-halo frequency, duration, potency
  | 'rapture' // the Rapture chain, and the Sinners it brings
  | 'grace' // unlocks a share of your Grace as a multiplier
  | 'rite'; // everything else: manna speed, offline, minigames

export interface BlessingUnlock {
  /** Owning this many of a source. */
  source?: { id: SourceId; count: number };
  /** Reaching this much joy this run. */
  joy?: number;
  /** Earning this much joy across all time. */
  lifetimeJoy?: number;
  /** Holding this many trophies. */
  trophies?: number;
  /** Offering this many times by hand. */
  touches?: number;
  /** Having bought another blessing first. */
  requires?: string;
  /** Being this deep into the Rapture. */
  rapture?: number;
  /** Having ascended this many times. */
  ascensions?: number;
  /** Holding this many Manna-levels across all sources. */
  sourceLevels?: number;
}

export interface BlessingDef {
  id: string;
  name: string;
  flavor: string;
  icon: string;
  kind: BlessingKind;
  cost: number;
  unlock: BlessingUnlock;

  // ── Effects. All optional; a blessing may carry several. ──
  /** Multiply one source's output. */
  sourceMultiplier?: { id: SourceId; factor: number };
  /** Multiply every source's output. */
  globalMultiplier?: number;
  /** Add flat joy to a hand-offering. */
  touchFlat?: number;
  /** Multiply the hand-offering. */
  touchMultiplier?: number;
  /** Add this share of joy-per-second to every hand-offering. */
  touchShareOfJps?: number;
  /** Each non-acolyte source copy adds this much JpS to every Acolyte. */
  acolyteFromCongregation?: number;
  /** Multiply everything by `1 + devotion × factor`. The Cherub line. */
  devotionFactor?: number;
  /** `boosted` gains `factor` of its own output per copy of `from` owned. */
  synergy?: { boosted: SourceId; from: SourceId; factor: number };
  /** Multiply how strong halo blessings are. */
  haloPotency?: number;
  /** Divide the wait between halos. */
  haloFrequency?: number;
  /** Multiply how long a halo lingers before it fades. */
  haloPatience?: number;
  /** Multiply what a Sinner pays out when struck. */
  sinnerYield?: number;
  /** Multiply how fast Sinners eat (and therefore how fast they fatten). */
  sinnerAppetite?: number;
  /** Advance the Rapture to this stage when bought. */
  raptureStage?: number;
  /** Divide the time a Manna seed needs to ripen. */
  mannaSpeed?: number;
  /** Add to the share of your rate that accrues while the temple is shut. */
  vigilEfficiency?: number;
  /** Add to how many hours the temple keeps working while shut. */
  vigilHours?: number;
  /** Unlock this share of your Grace as a permanent multiplier. */
  graceShare?: number;
}

// ─── Legacy (the prestige tree, bought with Grace) ───────────────────────────

export interface LegacyDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Price in Grace. */
  cost: number;
  /** Which ring of the ladder it sits on, for layout. */
  tier: number;
  /** Legacy IDs that must be owned first. */
  requires?: string[];

  globalMultiplier?: number;
  touchMultiplier?: number;
  /** Unlock this share of Grace as a permanent multiplier (stacks additively). */
  graceShare?: number;
  /** Keep this many blessings through an ascension. */
  keptBlessings?: number;
  /** Start each run holding this much joy. */
  startingJoy?: number;
  /** Start each run owning this many of the cheapest source. */
  startingAcolytes?: number;
  /** Add to the share of your rate earned while the temple is shut. */
  vigilEfficiency?: number;
  /** Add to how many hours the temple works while shut. */
  vigilHours?: number;
  /** Divide the Manna ripening time. */
  mannaSpeed?: number;
  /** Divide the wait between halos. */
  haloFrequency?: number;
  /** Multiply how strong halo blessings are. */
  haloPotency?: number;
  /** Keep the garden, choir, exchange and hours through an ascension. */
  keepsMinigames?: boolean;
  /** Multiply the Grace earned by future ascensions. */
  graceGain?: number;
}

// ─── Trophies ────────────────────────────────────────────────────────────────

export interface TrophyDef {
  id: string;
  name: string;
  description: string;
  flavor: string;
  /** Shown only once earned. */
  secret?: boolean;
  /**
   * Trophies marked `shadow` are excluded from Devotion, exactly as Cookie
   * Clicker's shadow achievements are excluded from milk: they mark showing
   * off, and showing off shouldn't multiply your income.
   */
  shadow?: boolean;
}

// ─── Halos (the golden-cookie layer) ─────────────────────────────────────────

export type HaloKind =
  | 'gilded' // the ordinary one: Lucky / Frenzy / Blessing / Click Frenzy
  | 'sable' // the Rapture's own: Sinner-flavoured, riskier, richer
  | 'seraphic'; // rare; only in deep Rapture. The big ones.

export interface Halo {
  /** Monotonic id, so React can key it and the tick can tell two apart. */
  id: number;
  kind: HaloKind;
  /** Position as a share of the sanctum, 0..1. */
  x: number;
  y: number;
  /** Seconds before it fades on its own. */
  life: number;
  /** Seconds it started with, for the fade. */
  maxLife: number;
}

/** A blessing currently multiplying your rate or your touch. */
export interface Buff {
  id: string;
  name: string;
  icon: string;
  /** Multiplies joy per second. */
  jpsMultiplier: number;
  /** Multiplies joy per offering. */
  touchMultiplier: number;
  remaining: number;
  duration: number;
}

// ─── Sinners (the wrinkler layer) ────────────────────────────────────────────

/**
 * They arrive with the Rapture, latch onto the temple, and drink. Every one of
 * them costs you 5% of your rate — and hands back everything it drank, times a
 * multiplier, the moment you strike it. Leaving them to feed while the temple
 * is shut is the single best thing you can do with a night's absence.
 */
export interface Sinner {
  id: number;
  /** How much joy it is holding. */
  swallowed: number;
  /** 0..1, how far into arriving it is. Fully latched at 1. */
  arrival: number;
  /** Position around the temple, in degrees. */
  angle: number;
  /** The rare golden one: pays triple and never shrinks the others' share. */
  penitent: boolean;
}

// ─── Manna (the sugar-lump layer) ────────────────────────────────────────────

export type MannaKind = 'plain' | 'twin' | 'gilded' | 'rich' | 'bitter';

export interface MannaState {
  /** Ripe manna in hand. */
  held: number;
  /** All-time manna gathered. */
  gathered: number;
  /** ms of ripening accrued toward the next one. */
  ripening: number;
  /** What the currently-ripening one will be. Decided when the last was taken. */
  kind: MannaKind;
  /** Whether the player has been shown the mechanic. */
  revealed: boolean;
}

// ─── Minigames ───────────────────────────────────────────────────────────────

export type MinigameId = 'garden' | 'choir' | 'exchange' | 'hours';

/* ── Garden of Eden ── */

export type SeedId =
  | 'wheat' // the starter
  | 'vine'
  | 'olive'
  | 'fig'
  | 'myrrh'
  | 'lily'
  | 'pomegranate'
  | 'cedar'
  | 'hyssop'
  | 'nard'
  | 'mandrake'
  | 'goldenBough'
  | 'thorn' // weeds, mostly
  | 'wormwood'
  | 'nightbloom'
  | 'tree'; // the Tree of Life. The whole point.

export interface SeedDef {
  id: SeedId;
  name: string;
  icon: string;
  description: string;
  /** Seconds per growth stage; a plant needs three to mature. */
  tickSeconds: number;
  /** Cost to sow, as a number of seconds of your current rate. */
  costSeconds: number;
  /** Seconds of your rate returned when harvested ripe. */
  yieldSeconds: number;
  /** What it does while it stands, if anything. */
  effect?: {
    jpsMultiplier?: number;
    touchMultiplier?: number;
    haloFrequency?: number;
    mannaSpeed?: number;
    sinnerYield?: number;
  };
  /** Pairs that can produce this seed when planted adjacent, plus the odds. */
  crossbreed?: { from: SeedId[]; chance: number }[];
  /** Available from the start, without crossbreeding. */
  starter?: boolean;
  /** Actively bad to leave standing. */
  bane?: boolean;
}

export interface Plot {
  seed: SeedId | null;
  /** 0..100. Mature at 100. */
  growth: number;
  /** Age in seconds; past maturity a plant starts to wither. */
  age: number;
}

export interface GardenState {
  unlocked: boolean;
  /** 6×6, row-major. Beds open as the Grove levels up. */
  plots: Plot[];
  /** Seeds discovered so far. */
  known: SeedId[];
  /** Currently held for sowing. */
  selected: SeedId | null;
  /** ms of growth not yet applied — the garden ticks on a coarse cadence. */
  carry: number;
  /** Soil changes how fast plants grow and how often they cross. */
  soil: SoilId;
  /** ms until the soil may be changed again. */
  soilCooldown: number;
}

export type SoilId = 'dirt' | 'sand' | 'clay' | 'ash' | 'glass' | 'grace';

export interface SoilDef {
  id: SoilId;
  name: string;
  description: string;
  icon: string;
  /** Multiplies growth speed. */
  speed: number;
  /** Multiplies crossbreed odds. */
  fertility: number;
  /** Multiplies harvest yield. */
  yield: number;
  /** Levels of the Grove needed. */
  requiresLevel: number;
}

/* ── Choir of Saints ── */

export type SaintId =
  | 'perpetua'
  | 'anselm'
  | 'lucia'
  | 'thomas'
  | 'hildegard'
  | 'benedict'
  | 'clare'
  | 'jerome'
  | 'cecilia'
  | 'francis'
  | 'catherine'
  | 'augustine';

export interface SaintDef {
  id: SaintId;
  name: string;
  epithet: string;
  icon: string;
  /** Effect at each of the three stalls: nave, transept, apse. Best first. */
  effects: [SaintEffect, SaintEffect, SaintEffect];
}

export interface SaintEffect {
  description: string;
  jpsMultiplier?: number;
  touchMultiplier?: number;
  haloFrequency?: number;
  haloPotency?: number;
  mannaSpeed?: number;
  sinnerYield?: number;
  gardenSpeed?: number;
  graceGain?: number;
  /** A cost, not a gift. Some saints ask for something. */
  jpsPenalty?: number;
}

export interface ChoirState {
  unlocked: boolean;
  /** Nave (strongest), transept, apse. `null` = empty stall. */
  stalls: [SaintId | null, SaintId | null, SaintId | null];
  /** Seconds until the choir may be re-seated. Swapping is meant to hurt. */
  cooldown: number;
  /** How many times the choir has been re-seated, for the cooldown curve. */
  swaps: number;
}

/* ── Indulgence Exchange ── */

export type GoodId =
  | 'incense'
  | 'oil'
  | 'linen'
  | 'wine'
  | 'gold'
  | 'ivory'
  | 'myrrhResin'
  | 'relics'
  | 'psalms'
  | 'absolution';

export interface GoodDef {
  id: GoodId;
  name: string;
  symbol: string;
  /** Which source's levels raise this good's ceiling. */
  source: SourceId;
  /** Starting price. */
  basePrice: number;
}

export interface GoodState {
  price: number;
  /** Units held. */
  held: number;
  /** Drift term — the slow trend the price is currently under. */
  drift: number;
  /** Last 32 prices, oldest first, for the sparkline. */
  history: number[];
}

export interface ExchangeState {
  unlocked: boolean;
  goods: Record<GoodId, GoodState>;
  /** ms not yet applied; the market moves on a fixed 60s beat. */
  carry: number;
  /** Cash on the desk, in joy. Profit is withdrawn to the temple. */
  ledger: number;
  /** All-time profit, for the trophies. */
  lifetimeProfit: number;
  /** Which good the panel is showing in detail. */
  focus: GoodId;
}

/* ── Book of Hours ── */

export type PrayerId =
  | 'conjureJoy'
  | 'forceTheHand'
  | 'raiseTheFallen'
  | 'buildInAnInstant'
  | 'stretchTime'
  | 'gatherManna'
  | 'diviningRod';

export interface PrayerDef {
  id: PrayerId;
  name: string;
  icon: string;
  description: string;
  /** Mana cost as `flat + share × maxMana`. */
  costFlat: number;
  costShare: number;
  /** Base odds the prayer goes wrong, before Book upgrades. */
  backfire: number;
  /** Levels of the Scriptorium required. */
  requiresLevel: number;
}

export interface HoursState {
  unlocked: boolean;
  mana: number;
  maxMana: number;
  /** ms not yet applied. Mana refills on a coarse beat, like everything else. */
  carry: number;
  /** Prayers said, all-time. Raises max mana. */
  said: number;
  /** Prayers that went wrong, all-time. Some trophies want this. */
  backfired: number;
  /** The last thing that happened, for the panel. */
  last: { prayer: PrayerId; outcome: string; good: boolean } | null;
}

// ─── The whole state ─────────────────────────────────────────────────────────

export type TabId =
  | 'temple'
  | 'sources'
  | 'blessings'
  | 'garden'
  | 'choir'
  | 'exchange'
  | 'hours'
  | 'legacy'
  | 'trophies'
  | 'settings';

export type BuyQty = 1 | 10 | 100 | 'max';

export interface GameState {
  // ── Joy ──
  joy: number;
  /** Earned this run. The ascension threshold reads this. */
  runJoy: number;
  /** Earned across every run. Prestige reads this, and it never resets. */
  lifetimeJoy: number;
  /** Highest joy held this run — makes blessing reveals sticky. */
  peakJoy: number;

  // ── Sources ──
  sources: Record<SourceId, number>;
  /** Manna levels. +1% output each; level 1 opens a minigame on some sources. */
  sourceLevels: Record<SourceId, number>;
  /** Joy each source has produced this run, for the ledger. */
  sourceEarnings: Record<SourceId, number>;

  // ── Blessings & trophies ──
  blessings: Set<string>;
  trophies: Set<string>;

  // ── Prestige ──
  /** Spendable Grace. */
  grace: number;
  /** Grace spent on the Ladder, ever. */
  graceSpent: number;
  /** Grace this save has been credited, ever. `grace + graceSpent`, tracked. */
  graceEarned: number;
  legacy: Set<string>;
  ascensions: number;
  /** Blessings the player picked to carry through the next ascension. */
  keepsakes: string[];

  // ── Manna ──
  manna: MannaState;

  // ── Touch ──
  totalTouches: number;
  /** ms timestamps of recent offerings — drives the fervour bonus. */
  recentTouches: number[];
  /** Touch count when the page opened. Only the "sat with it" trophy reads it. */
  touchesAtOpen: number;

  // ── Halos ──
  halos: Halo[];
  /** Seconds until the next halo appears. */
  haloTimer: number;
  halosCaught: number;
  buffs: Buff[];
  /** Consecutive halos caught without missing one. */
  haloStreak: number;

  // ── Rapture ──
  /** 0 = at peace. 1–3 = progressively unwell, and progressively rich. */
  rapture: number;
  sinners: Sinner[];
  sinnersStruck: number;
  /** All-time joy reclaimed from Sinners. */
  sinnerHarvest: number;

  // ── Minigames ──
  garden: GardenState;
  choir: ChoirState;
  exchange: ExchangeState;
  hours: HoursState;

  // ── Book-keeping ──
  /** ms. */
  lastTick: number;
  lastSaved: number;
  /** ms, when this page was opened. The vigil report reads it. */
  openedAt: number;
  playtime: number;
  runPlaytime: number;

  // ── The vigil (offline) report ──
  vigil: {
    seconds: number;
    joy: number;
    sinnerJoy: number;
    manna: number;
    /** Whether the report is still worth showing. */
    pending: boolean;
  };

  // ── Settings ──
  theme: 'dawn' | 'vespers';
  numberFormat: 'named' | 'scientific';
  soundEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  /** Spend spare joy automatically on whatever is best. */
  stewardEnabled: boolean;
  stewardTimer: number;
  /** Ask before an ascension resets the run. */
  confirmAscend: boolean;
  reducedFlourish: boolean;

  // ── UI ──
  tab: TabId;
  blessingFilter: BlessingKind | 'all';
  buyQty: BuyQty;
  /** True while the player is spending Manna rather than buying copies. */
  levelMode: boolean;
  showAscendDialog: boolean;
  showVigilDialog: boolean;
  showMannaDialog: boolean;
  initialized: boolean;
  /** Transient notes for the toast rail. */
  notices: Notice[];
}

export interface Notice {
  id: number;
  icon: string;
  title: string;
  body?: string;
  kind: 'gift' | 'trophy' | 'warn';
}

// ─── Save ────────────────────────────────────────────────────────────────────

/** Everything above, minus the parts that are only true while the tab is open. */
export interface SaveData {
  version: 2;
  joy: number;
  runJoy: number;
  lifetimeJoy: number;
  peakJoy: number;
  sources: Partial<Record<SourceId, number>>;
  sourceLevels: Partial<Record<SourceId, number>>;
  sourceEarnings: Partial<Record<SourceId, number>>;
  blessings: string[];
  trophies: string[];
  grace: number;
  graceSpent: number;
  graceEarned: number;
  legacy: string[];
  ascensions: number;
  keepsakes: string[];
  manna: MannaState;
  totalTouches: number;
  halosCaught: number;
  haloStreak: number;
  rapture: number;
  sinners: Sinner[];
  sinnersStruck: number;
  sinnerHarvest: number;
  buffs: Buff[];
  garden: GardenState;
  choir: ChoirState;
  exchange: ExchangeState;
  hours: HoursState;
  lastSaved: number;
  playtime: number;
  runPlaytime: number;
  theme: GameState['theme'];
  numberFormat: GameState['numberFormat'];
  soundEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  stewardEnabled: boolean;
  confirmAscend: boolean;
  reducedFlourish: boolean;
  buyQty: BuyQty;
}

/**
 * The shape of a v1 save, as far as the migration cares. The old game had a
 * different set of sources, three separate prestige currencies and no
 * minigames, so nothing transfers structurally — but the time someone put in
 * does, and that is what `migrateV1` reads.
 */
export interface LegacySaveV1 {
  version?: number;
  lifetimeHappiness?: number;
  prestigeCount?: number;
  ascensionCount?: number;
  totalPlaytime?: number;
  totalClicks?: number;
  achievements?: string[];
  theme?: 'light' | 'dark';
  numberFormat?: 'abbreviated' | 'scientific';
  soundEnabled?: boolean;
  musicVolume?: number;
  sfxVolume?: number;
}
