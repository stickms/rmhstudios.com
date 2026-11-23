/**
 * Signal Forge, engine types (v2 rework, 2026-11-23).
 *
 * Every piece of state is plain JSON (no classes, no Date ids, no Math.random): a run serialises with
 * `JSON.stringify`, reloads with `JSON.parse`, and the same seed and the same inputs give the same run. That
 * is what lets `__tests__/balance.test.ts` simulate thousands of runs and what keeps a cloud save honest.
 */

/** The four waveforms a card can carry. `Any` (a wildcard) matches whatever slot it is played into. */
export type Waveform = 'pulse' | 'sine' | 'saw' | 'noise';
export const WAVEFORMS: readonly Waveform[] = ['pulse', 'sine', 'saw', 'noise'];

export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'glitch';

/** How a card was played against the beat. `steady` is the non-timed mode: every on-phrase play counts as `good`. */
export type Timing = 'perfect' | 'good' | 'late' | 'steady';

export type RhythmMode = 'timed' | 'steady';

/** What a card does. Every field is optional; the engine applies them in the order listed. */
export interface CardEffect {
  /** Damage per hit to the target (or to every enemy with `aoe`). */
  dmg?: number;
  hits?: number;
  aoe?: boolean;
  block?: number;
  draw?: number;
  energy?: number;
  /** Heat added (on top of the heat an on-phrase play earns). */
  heat?: number;
  bleed?: number;
  weak?: number;
  vuln?: number;
  /** Cancels the target's next move (a boss loses only its block and buffs). */
  jam?: boolean;
  /** Player strength gained (adds to every hit). */
  strength?: number;
  /** Removes this much Static. */
  cool?: number;
  /** Adds Static (risky cards). */
  static?: number;
  heal?: number;
  selfDmg?: number;
  /** Adds N Glitch cards to the discard pile. */
  glitch?: number;
  /** Removes N Glitch cards from hand and discard. */
  purge?: number;
  /** Extra damage per point of Heat you hold when played. */
  dmgPerHeat?: number;
  /** Extra block per point of Heat you hold when played. */
  blockPerHeat?: number;
  /** Spends all Heat after resolving. */
  spendHeat?: boolean;
  /** Extra damage per Static you hold. */
  dmgPerStatic?: number;
  /** Extra damage per card already played this turn. */
  dmgPerPlayed?: number;
  /** Deals damage equal to your current Block (once, to the target or all with aoe). */
  blockAsDmg?: boolean;
  /** Fills one extra phrase slot (the next one) when it lands on the phrase. */
  skipSlot?: boolean;
  /** Doubles the target's Bleed. */
  doubleBleed?: boolean;
  /** Gains block equal to the damage you took last enemy turn (at least the card's block). */
  blockFromHurt?: boolean;
  /** Next phrase completion this combat deals this much more Burst damage. */
  burstBonus?: number;
}

export interface CardDef extends CardEffect {
  id: string;
  /** English name; the UI reads it through t(`card.<id>.name`) with this as the default. */
  name: string;
  rarity: Rarity;
  wave: Waveform | 'any';
  cost: number;
  /** Removed from the combat when played. */
  exhaust?: boolean;
  /** Stays in hand at end of turn. */
  retain?: boolean;
  /** Exhausts if still in hand at end of turn. */
  ethereal?: boolean;
  /** Always in the opening hand. */
  innate?: boolean;
  /** Cannot be played (Glitch, curses). */
  unplayable?: boolean;
  /** Optional upgrade override: the upgraded card's cost. Otherwise numbers grow (see balance.upgradeNumber). */
  upCost?: number;
  /** A special rule line (English default for t(`card.<id>.rule`)) shown beneath the generated text. */
  rule?: string;
}

/** A card in a deck or pile. `uid` is unique within a run; `up` marks the tempered (upgraded) version. */
export interface CardInst {
  uid: number;
  id: string;
  up?: boolean;
}

export type StatusKey = 'weak' | 'vuln' | 'bleed' | 'strength' | 'frail' | 'jam';
export type Statuses = Partial<Record<StatusKey, number>>;

export type IntentKind = 'attack' | 'defend' | 'buff' | 'debuff' | 'disrupt' | 'summon' | 'charge';

/** One enemy move. Resolved when the enemy acts. */
export interface EnemyMove {
  id: string;
  name: string;
  kind: IntentKind;
  dmg?: number;
  hits?: number;
  block?: number;
  /** Block given to every other living enemy. */
  blockAll?: number;
  strength?: number;
  /** Strength given to every other living enemy. */
  strengthAll?: number;
  heal?: number;
  weak?: number;
  vuln?: number;
  frail?: number;
  /** Glitch cards shuffled into the player's discard. */
  glitch?: number;
  /** Static added to the player. */
  static?: number;
  /** Scrambles the player's next phrase (one slot becomes a waveform the player holds least). */
  scramble?: boolean;
  /** Spawns enemies by def id (only while fewer than 4 are alive). */
  summon?: string[];
}

export type EnemyTier = 'normal' | 'elite' | 'boss' | 'minion';

/** The visual family an enemy is drawn from (ui/art/enemies.tsx). */
export type EnemyShape =
  | 'drone'
  | 'crawler'
  | 'coil'
  | 'press'
  | 'wraith'
  | 'sentinel'
  | 'core'
  | 'hound'
  | 'anvil'
  | 'furnace'
  | 'arc';

export interface EnemyPassives {
  /** Flat reduction of each incoming hit. */
  armor?: number;
  /** Damage dealt back to the player per hit taken. */
  thorns?: number;
  /** HP regained at the end of each enemy turn. */
  regen?: number;
  /** Block gained at the start of combat. */
  startBlock?: number;
  /** Takes half damage from off-phrase cards. */
  phased?: boolean;
  /** Strength gained each time it is hit by a Forge Burst. */
  burstHardened?: number;
  /** Below half HP: +N strength once. */
  enrage?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  act: 1 | 2 | 3;
  tier: EnemyTier;
  hp: [number, number];
  shape: EnemyShape;
  /** Moves; `pattern` lists indexes into it and loops (`loopFrom` marks where the loop restarts). */
  moves: EnemyMove[];
  pattern: number[];
  loopFrom?: number;
  passives?: EnemyPassives;
  /** Bosses: at or below half HP the pattern switches to this one (indexes into `moves`) and these passives add. */
  phase2?: { pattern: number[]; passives?: EnemyPassives };
  /** One line of flavour, English default for t(`enemy.<id>.lore`). */
  lore: string;
}

export interface EnemyState {
  uid: number;
  id: string;
  hp: number;
  maxHp: number;
  block: number;
  statuses: Statuses;
  /** Position in the pattern. */
  step: number;
  phase: 1 | 2;
  enraged?: boolean;
  /** Index into def.moves of the move it will make (shown as its intent). */
  intent: number;
}

/** Relic triggers. A relic is data: a trigger plus a small effect, or a passive modifier. */
export type RelicTrigger =
  | 'combatStart'
  | 'turnStart'
  | 'firstTurn'
  | 'burst'
  | 'perfect'
  | 'phraseHit'
  | 'offPhrase'
  | 'exhaust'
  | 'kill'
  | 'turnEnd'
  | 'combatWin'
  | 'glitchAdded'
  | 'vent'
  | 'pickup';

export interface RelicEffect {
  block?: number;
  heat?: number;
  energy?: number;
  draw?: number;
  heal?: number;
  strength?: number;
  dmgAll?: number;
  gold?: number;
  maxHp?: number;
  cool?: number;
  weakAll?: number;
  vulnAll?: number;
  bleedAll?: number;
  /** Static added to the player (a drawback). */
  static?: number;
}

export interface RelicPassive {
  maxEnergy?: number;
  handSize?: number;
  /** Added to the Forge Burst's base damage. */
  burstDmg?: number;
  /** Added to the per-Heat Burst damage. */
  burstPerHeat?: number;
  /** Static threshold change (positive = more forgiving). */
  staticThreshold?: number;
  /** Vent gives this much more block per Heat. */
  ventPerHeat?: number;
  heatCap?: number;
  /** Multiplies the timing window (timed mode) — e.g. 1.25 widens it by a quarter. */
  windowScale?: number;
  shopDiscount?: number;
  restHeal?: number;
  /** Card reward screens show one more choice. */
  rewardChoices?: number;
  /** Block is not lost at the start of your turn (up to this much carries over). */
  blockCarry?: number;
  /** Extra damage on every hit from a card played on the phrase. */
  phraseDmg?: number;
  /** Wildcard: the first slot of every phrase accepts any waveform. */
  firstSlotWild?: boolean;
  goldBonus?: number;
}

export interface RelicDef {
  id: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'boss' | 'starter' | 'event';
  /** English default for t(`relic.<id>.text`). */
  text: string;
  trigger?: RelicTrigger;
  effect?: RelicEffect;
  passive?: RelicPassive;
  /** For counters: trigger every Nth time. */
  every?: number;
  /** Only means something with the beat (timed mode); never offered in Steady mode. */
  timedOnly?: boolean;
}

/** Event outcomes: a tiny effect language the run resolves. */
export interface EventOutcome {
  hp?: number;
  /** Fraction of max HP healed (0.25 = a quarter). */
  healPct?: number;
  maxHp?: number;
  gold?: number;
  card?: string | 'random-common' | 'random-uncommon' | 'random-rare';
  relic?: string | 'random';
  curse?: string;
  /** Opens a pick: remove, temper (upgrade) or transform a card. */
  pick?: 'remove' | 'temper' | 'transform' | 'duplicate';
  temperRandom?: number;
  /** Starts a fight with this encounter (by enemy ids). */
  fight?: string[];
  /** Chance (0..1) the `alt` outcome is used instead. */
  risk?: number;
  alt?: Omit<EventOutcome, 'risk' | 'alt'>;
}

export interface EventChoice {
  id: string;
  /** English default for t(`event.<event>.<choice>`). */
  label: string;
  outcome: EventOutcome;
  /** Gold needed to pick it. */
  costGold?: number;
  /** Max HP needed (the choice is greyed out when the player would die). */
  costHp?: number;
}

export interface EventDef {
  id: string;
  title: string;
  body: string;
  acts: Array<1 | 2 | 3>;
  choices: EventChoice[];
}

export type NodeKind = 'combat' | 'elite' | 'event' | 'shop' | 'rest' | 'boss' | 'treasure';

export interface MapNode {
  row: number;
  lane: number;
  kind: NodeKind;
  /** Lanes in the next row this node leads to. */
  next: number[];
}

export interface CombatState {
  enemies: EnemyState[];
  hand: CardInst[];
  draw: CardInst[];
  discard: CardInst[];
  exhausted: CardInst[];
  energy: number;
  block: number;
  statuses: Statuses;
  heat: number;
  static: number;
  phrase: Waveform[];
  /** How many phrase slots are filled this turn. */
  phraseAt: number;
  turn: number;
  playedThisTurn: number;
  hurtLastTurn: number;
  /** Damage queued by `burstBonus` cards for the next Burst. */
  burstBonus: number;
  ventedThisTurn: boolean;
  /** Next phrase is scrambled by an enemy. */
  scrambleNext: boolean;
  /** Per-relic counters for `every` relics. */
  counters: Record<string, number>;
  kind: 'combat' | 'elite' | 'boss';
  /** Per-combat stats (feed achievements and score). */
  stats: { perfects: number; bursts: number; dmgDealt: number; maxHit: number };
  log: LogEntry[];
}

/** A combat log line: a key plus numbers; the UI renders it through t(). */
export interface LogEntry {
  k: string;
  n?: number;
  s?: string;
}

export type RunPhase =
  | 'map'
  | 'combat'
  | 'reward'
  | 'shop'
  | 'rest'
  | 'event'
  | 'pick'
  | 'treasure'
  | 'boss-reward'
  | 'victory'
  | 'defeat';

export interface RewardState {
  gold: number;
  cards: string[];
  relic?: string;
  /** Boss relic choices. */
  relics?: string[];
  cardTaken?: boolean;
  goldTaken?: boolean;
  relicTaken?: boolean;
}

export interface ShopState {
  cards: Array<{ id: string; price: number; sold?: boolean }>;
  relics: Array<{ id: string; price: number; sold?: boolean }>;
  removePrice: number;
  removed?: boolean;
}

export interface RunStats {
  perfects: number;
  bursts: number;
  combatsWon: number;
  elitesWon: number;
  bossesWon: number;
  maxHit: number;
  dmgDealt: number;
  cardsPlayed: number;
  vents: number;
  steadyPlays: number;
  timedPlays: number;
}

export interface RunState {
  /** Save format version (see save.ts). */
  v: 2;
  seed: number;
  /** RNG state, advanced by every random draw. */
  rng: number;
  ascension: number;
  mode: RhythmMode;
  act: 1 | 2 | 3;
  /** Row on the current act's map (-1 before the first pick). */
  row: number;
  lane: number;
  /** The lane taken on each row of the current act (lights the route on the map). */
  trail?: number[];
  map: MapNode[][];
  hp: number;
  maxHp: number;
  gold: number;
  deck: CardInst[];
  relics: string[];
  nextUid: number;
  phase: RunPhase;
  combat?: CombatState;
  reward?: RewardState;
  shop?: ShopState;
  event?: { id: string; resolved?: string };
  pick?: { kind: 'remove' | 'temper' | 'transform' | 'duplicate'; then: RunPhase; price?: number; cancel?: RunPhase };
  score: number;
  stats: RunStats;
  /** Wall-clock ms the run has been played (the UI adds to it); sent with the score. */
  playMs: number;
  /** True when this run is the scripted tutorial (never saved, never scored). */
  tutorial?: boolean;
  /** Relic counters that persist across combats. */
  relicState: Record<string, number>;
}
