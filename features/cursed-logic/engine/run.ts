/**
 * A run: a ladder of duels across five sectors, with a milestone (one free upgrade) and a shop after each of the
 * first four, ending at NULL//ROOT. Pure functions over plain, serialisable state: every function takes the state
 * and an `Rng` and returns a new state, so the UI store, the saved run and the balance simulation all drive the same
 * code. Numbers: `data.ts`.
 *
 * A round: `beginRound` (regen, mutation, stance offer, the Protocol's intent and tell) → `chooseStance` →
 * `commitAction` (pays, applies Chaos and the glitch, resolves the clash; may ask for a minigame) →
 * `finishRound` (applies the minigame and the result, ends the duel when someone is at 0).
 */
import {
  ACTION_COST,
  BOSS_MUTATION_EVERY,
  FRAGMENTS,
  GLASS_CANNON_INTEGRITY,
  MODIFIERS,
  MUTATION_CHANCE,
  PLAYER,
  PROTOCOLS,
  REINFORCE_COST,
  RUN_UPGRADES,
  SECTORS,
  SHOP_NUMBERS,
  STANCE_OFFER,
  STANCES,
  type SectorDef,
} from './data';
import { applyMinigameAdjustment, getMinigameForRound, type MinigameTrigger } from './minigame';
import { applyGlitch, chooseProtocolAction, makeTell, type ProtocolView } from './protocol';
import { resolveClash, type ClashResult } from './resolution';
import { pick, randInt, shuffled, type Rng } from './rng';
import { runScore, scoreDuel } from './score';
import { stockShelf } from './shopState';
import {
  PLAYER_ACTIONS,
  PROTOCOL_ACTIONS,
  type PactId,
  type PlayerAction,
  type PlayerCondition,
  type ProtocolAction,
  type ProtocolCondition,
  type ProtocolId,
  type RoundModifier,
  type RunUpgradeId,
  type ShopItemId,
  type Stance,
} from './types';

/** Duels end in a loss for the player if they run this long (a stalemate is the Protocol's win). */
export const MAX_ROUNDS = 30;

export interface DuelState {
  protocolId: ProtocolId;
  protocolHealth: number;
  protocolMax: number;
  round: number;
  charge: number;
  chargeCap: number;
  playerPrimed: boolean;
  protocolPrimed: boolean;
  playerCondition: PlayerCondition;
  protocolCondition: ProtocolCondition;
  /** Your actions, newest first (the Protocol reads them). */
  history: PlayerAction[];
  modifier: RoundModifier | null;
  /** Mutation rolled last round that touches this round's start (Charge Drain). */
  drainNext: boolean;
  /** The Protocol's intended action this round (secret until the reveal). */
  intended: ProtocolAction;
  /** The tell shown to you; null when hidden (Static, Blackout). */
  tell: ProtocolAction | null;
  /** True when the tell is guaranteed (Reveal, or your Probe last round). */
  tellTrue: boolean;
  /** Rounds left whose tell is guaranteed and cannot glitch (from Probe). */
  lockedRounds: number;
  stanceOffer: Stance[];
  stance: Stance | null;
  /** Decoder uses left this duel, and this round's verdict once used. */
  decoderLeft: number;
  decoderVerdict: boolean | null;
  damageTaken: number;
  log: ClashResult[];
  result: 'win' | 'lose' | null;
}

export type Stage = 'duel' | 'intermission' | 'milestone' | 'shop' | 'over';

export interface DuelRecord {
  protocolId: ProtocolId;
  sector: number;
  rounds: number;
  won: boolean;
  flawless: boolean;
  points: number;
}

export interface RunState {
  mode: 'run' | 'tutorial';
  seed: number;
  pacts: PactId[];
  integrity: number;
  maxIntegrity: number;
  fragments: number;
  upgrades: RunUpgradeId[];
  /** Capacitor wares bought. */
  capacitors: number;
  /** Decoder uses granted per duel. */
  decoders: number;
  /** 1-based sector and 0-based duel within it. */
  sector: number;
  duelInSector: number;
  duelsWon: number;
  usedProtocols: ProtocolId[];
  stage: Stage;
  duel: DuelState | null;
  /** Raw duel points before the multiplier; the score is `runScore(raw, victory, pacts)`. */
  rawPoints: number;
  score: number;
  records: DuelRecord[];
  victory: boolean;
  milestoneChoices: RunUpgradeId[] | null;
  shelf: ShopItemId[];
  /** Integrity never dropped to half or below this run. */
  neverBelowHalf: boolean;
  /** The tutorial's scripted rounds (round N uses entry N-1). */
  script?: RoundOverride[];
}

export function sectorDef(index: number): SectorDef {
  return SECTORS[Math.max(0, Math.min(SECTORS.length - 1, index - 1))] as SectorDef;
}

export function chargeCapFor(run: Pick<RunState, 'capacitors'>): number {
  return PLAYER.chargeCap + run.capacitors * SHOP_NUMBERS.capacitorCharge;
}

// ── Run setup ───────────────────────────────────────────────────────────────────────────────────────────────────

export function newRun(seed: number, pacts: readonly PactId[], rng: Rng): RunState {
  const unique = [...new Set(pacts)];
  const max = unique.includes('glassCannon') ? GLASS_CANNON_INTEGRITY : PLAYER.maxIntegrity;
  const run: RunState = {
    mode: 'run',
    seed,
    pacts: unique,
    integrity: max,
    maxIntegrity: max,
    fragments: 0,
    upgrades: [],
    capacitors: 0,
    decoders: 0,
    sector: 1,
    duelInSector: 0,
    duelsWon: 0,
    usedProtocols: [],
    stage: 'duel',
    duel: null,
    rawPoints: 0,
    score: 0,
    records: [],
    victory: false,
    milestoneChoices: null,
    shelf: [],
    neverBelowHalf: true,
  };
  return startDuel(run, rng);
}

/** Draw the next Protocol for the current sector: one not met yet this run if the pool has one. */
export function drawProtocol(run: Pick<RunState, 'sector' | 'usedProtocols'>, rng: Rng): ProtocolId {
  const pool = sectorDef(run.sector).pool;
  const fresh = pool.filter((p) => !run.usedProtocols.includes(p));
  return pick(rng, fresh.length > 0 ? fresh : pool);
}

export function protocolMaxHealth(id: ProtocolId, sector: number): number {
  return PROTOCOLS[id].health + (id === 'trainer' ? 0 : sectorDef(sector).healthBonus);
}

export function startDuel(run: RunState, rng: Rng, forced?: ProtocolId): RunState {
  const id = forced ?? drawProtocol(run, rng);
  const max = protocolMaxHealth(id, run.sector);
  const cap = chargeCapFor(run);
  const duel: DuelState = {
    protocolId: id,
    protocolHealth: max,
    protocolMax: max,
    round: 0,
    charge: Math.min(cap, PLAYER.startCharge + run.capacitors * SHOP_NUMBERS.capacitorCharge),
    chargeCap: cap,
    playerPrimed: false,
    protocolPrimed: false,
    playerCondition: null,
    protocolCondition: null,
    history: [],
    modifier: null,
    drainNext: false,
    intended: 'Idle',
    tell: null,
    tellTrue: false,
    lockedRounds: 0,
    stanceOffer: [],
    stance: null,
    decoderLeft: run.decoders * SHOP_NUMBERS.decoderUses,
    decoderVerdict: null,
    damageTaken: 0,
    log: [],
    result: null,
  };
  const next: RunState = {
    ...run,
    stage: 'duel',
    duel,
    usedProtocols: run.usedProtocols.includes(id) ? run.usedProtocols : [...run.usedProtocols, id],
  };
  return beginRound(next, rng);
}

// ── Rounds ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function protocolView(duel: DuelState): ProtocolView {
  return {
    def: PROTOCOLS[duel.protocolId],
    health: duel.protocolHealth,
    maxHealth: duel.protocolMax,
    primed: duel.protocolPrimed,
    history: duel.history,
  };
}

export interface RoundOverride {
  intent?: ProtocolAction;
  stances?: Stance[];
  /** Force the round's modifier (null = none). */
  modifier?: RoundModifier | null;
}

function rollModifier(run: RunState, duel: DuelState, round: number, rng: Rng): RoundModifier | null {
  if (run.mode === 'tutorial') return null;
  const boss = PROTOCOLS[duel.protocolId].trait === 'corrupt';
  if (boss && round % BOSS_MUTATION_EVERY === 0) return pick(rng, MODIFIERS);
  const chance = MUTATION_CHANCE * (run.pacts.includes('chaosRun') ? 2 : 1);
  return rng.next() < chance ? pick(rng, MODIFIERS) : null;
}

export function beginRound(run: RunState, rng: Rng, explicit?: RoundOverride): RunState {
  const prev = run.duel;
  if (!prev || prev.result) return run;
  const round = prev.round + 1;
  const override: RoundOverride = explicit ?? run.script?.[round - 1] ?? {};
  const regen = prev.round === 0 || prev.drainNext ? 0 : PLAYER.chargeRegen;
  const duel: DuelState = { ...prev, round, charge: Math.min(prev.chargeCap, prev.charge + regen), drainNext: false };

  const modifier = override.modifier !== undefined ? override.modifier : rollModifier(run, duel, round, rng);
  const stanceOffer = override.stances ?? shuffled(rng, STANCES).slice(0, STANCE_OFFER);
  const intended = override.intent ?? chooseProtocolAction(protocolView(duel), rng);
  const locked = duel.lockedRounds > 0;
  const blackout = run.pacts.includes('blackout') && round % 2 === 0;
  const hidden = !locked && (modifier === 'Static' || blackout);
  const tellTrue = locked || modifier === 'Reveal' || run.mode === 'tutorial';
  const tell = hidden ? null : tellTrue ? intended : makeTell(PROTOCOLS[duel.protocolId], intended, rng);

  return {
    ...run,
    duel: {
      ...duel,
      modifier,
      stanceOffer,
      stance: null,
      intended,
      tell,
      tellTrue,
      decoderVerdict: null,
    },
  };
}

export function chooseStance(run: RunState, stance: Stance): RunState {
  const duel = run.duel;
  if (!duel || duel.result || duel.stance || !duel.stanceOffer.includes(stance)) return run;
  return { ...run, duel: { ...duel, stance } };
}

/** Spend a Decoder use: learn whether this round's tell is the truth. */
export function applyDecoder(run: RunState): RunState {
  const duel = run.duel;
  if (!duel || duel.result || duel.decoderLeft <= 0 || duel.tell === null || duel.decoderVerdict !== null) return run;
  return { ...run, duel: { ...duel, decoderLeft: duel.decoderLeft - 1, decoderVerdict: duel.tell === duel.intended } };
}

export function actionCost(duel: Pick<DuelState, 'stance'>, run: Pick<RunState, 'upgrades'>, action: PlayerAction): number {
  if (action === 'Probe' && duel.stance === 'Scan') return 0;
  return ACTION_COST[action];
}

/** Whether a reinforced `action` is affordable this round. */
export function canReinforce(run: RunState, action: PlayerAction): boolean {
  const duel = run.duel;
  if (!duel) return false;
  return duel.charge >= actionCost(duel, run, action) + REINFORCE_COST;
}

export interface PendingClash {
  clash: ClashResult;
  minigame: MinigameTrigger | null;
  /** Probe depth to lock in for the coming rounds. */
  probeDepth: number;
  /** Charge left after paying. */
  chargeAfter: number;
  chaosHit: 'player' | 'protocol' | null;
}

/** Pay, apply Chaos and the glitch, resolve. Returns the pending result; nothing is applied to the run yet. */
export function commitAction(run: RunState, rng: Rng, chosen: PlayerAction, reinforceWanted: boolean): PendingClash | null {
  const duel = run.duel;
  if (!duel || duel.result || !duel.stance) return null;
  const base = actionCost(duel, run, chosen);
  const reinforced = reinforceWanted && duel.charge >= base + REINFORCE_COST;
  const cost = base + (reinforced ? REINFORCE_COST : 0);
  const overdraw = duel.charge < cost;
  const chargeAfter = Math.max(0, duel.charge - cost);

  const def = PROTOCOLS[duel.protocolId];
  const locked = duel.lockedRounds > 0 || run.mode === 'tutorial';
  const glitchMult = run.pacts.includes('chaosRun') ? 2 : 1;
  let protocol: ProtocolAction = locked ? duel.intended : applyGlitch(def, duel.intended, rng, glitchMult);
  let player = chosen;
  let chaosHit: PendingClash['chaosHit'] = null;
  if (duel.modifier === 'Chaos') {
    if (rng.next() < 0.5) {
      player = PLAYER_ACTIONS[randInt(rng, PLAYER_ACTIONS.length)] as PlayerAction;
      chaosHit = 'player';
    } else {
      protocol = PROTOCOL_ACTIONS[randInt(rng, PROTOCOL_ACTIONS.length)] as ProtocolAction;
      chaosHit = 'protocol';
    }
  }

  const overclock = def.trait === 'overclock' && duel.protocolHealth * 2 <= duel.protocolMax ? def.traitPower : 0;
  const doubleDown = run.pacts.includes('doubleDown') ? 1 : 0;
  const clash = resolveClash({
    player,
    protocol,
    playerPrimed: duel.playerPrimed,
    protocolPrimed: duel.protocolPrimed,
    stance: duel.stance,
    reinforced,
    overdraw,
    modifier: duel.modifier,
    playerCondition: duel.playerCondition,
    protocolCondition: duel.protocolCondition,
    upgrades: run.upgrades,
    playerStrikeBonus: (run.pacts.includes('glassCannon') ? 1 : 0) + doubleDown,
    protocolStrikeBonus: (run.mode === 'tutorial' ? 0 : sectorDef(run.sector).strikeBonus) + doubleDown + overclock,
    trait: def.trait,
    traitPower: def.traitPower,
  });
  const probeDepth =
    player === 'Probe' ? (duel.stance === 'Scan' || run.upgrades.includes('probeReveals2') ? 2 : 1) : 0;
  const minigame = getMinigameForRound(
    clash.playerAction,
    clash.protocolAction,
    duel.modifier,
    clash.playerDamage,
    clash.protocolDamage,
  );
  return { clash, minigame, probeDepth, chargeAfter, chaosHit };
}

/**
 * Apply a clash. `minigame` is true/false for a played minigame, or null when none was played (no trigger, or the
 * player turned minigames off): then the clash stands as resolved.
 */
export function finishRound(run: RunState, rng: Rng, pending: PendingClash, minigame: boolean | null): RunState {
  const duel = run.duel;
  if (!duel || duel.result) return run;
  let clash = pending.clash;
  let nextPlayerCondition = clash.nextPlayerCondition;
  if (pending.minigame && minigame !== null) {
    const adj = applyMinigameAdjustment(clash, minigame, pending.minigame.kind, pending.minigame.chaosDistort);
    clash = adj.lastRound;
    if (adj.skipExposed && nextPlayerCondition === 'Exposed') nextPlayerCondition = null;
  }

  const integrity = Math.min(run.maxIntegrity, Math.max(0, run.integrity - clash.playerDamage) + clash.playerHeal);
  const protocolHealth = Math.min(
    duel.protocolMax,
    Math.max(0, duel.protocolHealth - clash.protocolDamage) + (clash.protocolDamage >= duel.protocolHealth ? 0 : clash.protocolHeal),
  );
  const charge = Math.min(duel.chargeCap, pending.chargeAfter + clash.chargeGain);
  const lockedRounds = Math.max(pending.probeDepth, duel.lockedRounds > 0 ? duel.lockedRounds - 1 : 0);

  let result: DuelState['result'] = null;
  if (integrity <= 0) result = 'lose';
  else if (protocolHealth <= 0) result = 'win';
  else if (duel.round >= MAX_ROUNDS) result = 'lose';

  const nextDuel: DuelState = {
    ...duel,
    protocolHealth,
    charge,
    playerPrimed: clash.playerPrimed,
    protocolPrimed: clash.protocolPrimed,
    playerCondition: nextPlayerCondition,
    protocolCondition: clash.nextProtocolCondition,
    history: [clash.playerAction, ...duel.history].slice(0, 5),
    drainNext: duel.modifier === 'ChargeDrain',
    lockedRounds,
    damageTaken: duel.damageTaken + Math.max(0, clash.playerDamage - clash.playerHeal),
    log: [clash, ...duel.log].slice(0, 6),
    result,
  };
  const afterRound: RunState = {
    ...run,
    integrity,
    duel: nextDuel,
    neverBelowHalf: run.neverBelowHalf && integrity * 2 > run.maxIntegrity,
  };
  if (!result) return beginRound(afterRound, rng);
  return endDuel(afterRound, rng);
}

// ── Between duels ───────────────────────────────────────────────────────────────────────────────────────────────

function endDuel(run: RunState, rng: Rng): RunState {
  const duel = run.duel as DuelState;
  const won = duel.result === 'win';
  const flawless = won && duel.damageTaken === 0;
  if (run.mode === 'tutorial') {
    return { ...run, stage: 'over', victory: won };
  }
  const points = won
    ? scoreDuel({ sector: run.sector, integrityLeft: run.integrity, rounds: duel.round, flawless }).total
    : 0;
  const record: DuelRecord = { protocolId: duel.protocolId, sector: run.sector, rounds: duel.round, won, flawless, points };
  const rawPoints = run.rawPoints + points;
  const sector = sectorDef(run.sector);
  const lastOfSector = run.duelInSector + 1 >= sector.duels;
  const victory = won && lastOfSector && run.sector >= SECTORS.length;
  const base: RunState = {
    ...run,
    records: [...run.records, record],
    rawPoints,
    duelsWon: run.duelsWon + (won ? 1 : 0),
    fragments: run.fragments + (won ? FRAGMENTS.duelBase + FRAGMENTS.duelPerSector * run.sector + (flawless ? FRAGMENTS.flawless : 0) : 0),
    victory,
    score: runScore(rawPoints, victory, run.pacts),
  };
  if (!won || victory) return { ...base, stage: 'over' };
  if (lastOfSector && sector.shop) {
    return { ...base, stage: 'milestone', milestoneChoices: milestoneChoices(base, rng) };
  }
  return { ...base, stage: 'intermission' };
}

function milestoneChoices(run: RunState, rng: Rng): RunUpgradeId[] {
  const pool = RUN_UPGRADES.filter((u) => !run.upgrades.includes(u));
  return shuffled(rng, pool).slice(0, 2);
}

export function pickMilestone(run: RunState, rng: Rng, choice: RunUpgradeId | null): RunState {
  if (run.stage !== 'milestone') return run;
  if (choice !== null && !run.milestoneChoices?.includes(choice)) return run;
  const upgrades = choice ? [...run.upgrades, choice] : run.upgrades;
  return { ...run, upgrades, milestoneChoices: null, stage: 'shop', shelf: stockShelf({ ...run, upgrades }, rng) };
}

/** Leave an intermission or the shop: patch up and start the next duel. */
export function continueRun(run: RunState, rng: Rng): RunState {
  if (run.stage === 'intermission') {
    const patched = { ...run, integrity: Math.min(run.maxIntegrity, run.integrity + PLAYER.patchBetweenDuels) };
    return startDuel({ ...patched, duelInSector: run.duelInSector + 1 }, rng);
  }
  if (run.stage === 'shop') {
    const patched = { ...run, integrity: Math.min(run.maxIntegrity, run.integrity + PLAYER.patchBetweenDuels) };
    return startDuel({ ...patched, sector: run.sector + 1, duelInSector: 0, shelf: [] }, rng);
  }
  return run;
}

/** The run's position as "duel N of TOTAL". */
export function duelNumber(run: Pick<RunState, 'sector' | 'duelInSector'>): number {
  let n = 0;
  for (const s of SECTORS) {
    if (s.index < run.sector) n += s.duels;
  }
  return n + run.duelInSector + 1;
}
