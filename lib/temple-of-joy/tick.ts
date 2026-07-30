/**
 * The tick.
 *
 * `applyTick(state) -> state`, pure apart from `Date.now()` and the dice. It
 * runs on every animation frame, but almost nothing in it runs at that rate:
 * income and buffs are per-frame, and everything slower (the garden, the
 * market, manna, the trophy audit) carries its own accumulator and fires on a
 * coarse beat. That is what lets the same function also be the offline
 * simulation — hand it a delta of nine hours and it does the right thing.
 *
 * Wall-clock deltas throughout, never frame counts, so a throttled background
 * tab loses nothing.
 */
import type { Buff, GameState, Halo, HaloKind, Notice } from './types';
import {
  computeGrossJps,
  computeJps,
  computeRateModifiers,
  computeSinnerDrain,
  computeSourceCost,
  computeStewardActive,
  computeBestPurchase,
  computeTotalSources,
} from './engine';
import { HALO_INTERVAL_MAX, HALO_INTERVAL_MIN, HALO_LIFETIME, SERAPHIC_CHANCE } from './data/halos';
import { advanceGarden } from './minigames/garden';
import { advanceExchange } from './minigames/exchange';
import { advanceHours } from './minigames/hours';
import { advanceManna } from './minigames/manna';
import { advanceSinners } from './minigames/sinners';
import { auditTrophies } from './trophies';
import { SOURCES } from './data/sources';
import { BLESSING_MAP } from './data/blessings';

/* ── Ids ─────────────────────────────────────────────────────────────────── */

let idCounter = 1;
export function nextId(): number {
  return idCounter++;
}

/** Longest single step the tick will simulate. Anything more is a vigil. */
const MAX_STEP_SECONDS = 60;

/** The trophy audit is not cheap enough to run at 60Hz, and does not need to be. */
const AUDIT_INTERVAL_MS = 1_000;
let auditCarry = 0;

/** Notices fade on their own. */
const NOTICE_LIFETIME_MS = 6_000;

export function applyTick(state: GameState, nowMs = Date.now()): GameState {
  const rawDelta = (nowMs - state.lastTick) / 1000;
  if (!Number.isFinite(rawDelta) || rawDelta <= 0) {
    return state.lastTick === nowMs ? state : { ...state, lastTick: nowMs };
  }
  // A tab that was asleep for an hour catches up through the vigil path on
  // load, not by asking the tick to integrate an hour in one step.
  const delta = Math.min(rawDelta, MAX_STEP_SECONDS);
  const deltaMs = delta * 1000;

  const modifiers = computeRateModifiers(state);
  const grossJps = computeGrossJps(state);

  /* ── 1. Sinners drink first, so income is what is left ── */

  let appetite = 1;
  for (const id of state.blessings) {
    const def = BLESSING_MAP[id];
    if (def?.sinnerAppetite) appetite *= def.sinnerAppetite;
  }

  const sinnerStep = advanceSinners(
    state.sinners,
    delta,
    grossJps,
    state.rapture,
    appetite,
    nextId,
  );

  const earned = grossJps * delta - sinnerStep.swallowed;

  /* ── 2. Joy ── */

  const joy = state.joy + earned;
  const runJoy = state.runJoy + Math.max(0, earned);
  const lifetimeJoy = state.lifetimeJoy + Math.max(0, earned);
  const peakJoy = Math.max(state.peakJoy, joy);

  // Per-source earnings, for the ledger. Shares of the gross, which is what a
  // player means by "how much is the grove making".
  const sourceEarnings = { ...state.sourceEarnings };
  if (grossJps > 0 && earned > 0) {
    for (const source of SOURCES) {
      const count = state.sources[source.id] ?? 0;
      if (count === 0) continue;
      // Cheap approximation of each source's share; exact per-source
      // attribution would mean 24 full stack walks a frame for a readout.
      sourceEarnings[source.id] =
        (sourceEarnings[source.id] ?? 0) + (earned * (source.baseJps * count)) / rawBase(state);
    }
  }

  /* ── 3. Buffs ── */

  const buffs: Buff[] = [];
  for (const buff of state.buffs) {
    const remaining = buff.remaining - delta;
    if (remaining > 0) buffs.push({ ...buff, remaining });
  }

  /* ── 4. Halos ── */

  let haloTimer = state.haloTimer - delta * modifiers.haloFrequency;
  let halos: Halo[] = [];
  let haloStreak = state.haloStreak;
  const notices: Notice[] = state.notices.filter((n) => n.id > nowMs - NOTICE_LIFETIME_MS);

  for (const halo of state.halos) {
    const life = halo.life - delta;
    if (life > 0) halos.push({ ...halo, life });
    // A halo that fades unclaimed breaks the streak. Missing one should sting
    // slightly, or catching them would not be a skill.
    else haloStreak = 0;
  }

  if (haloTimer <= 0) {
    const kind = rollHaloKind(state.rapture);
    const life = HALO_LIFETIME * modifiers.haloPatience;
    halos = [
      ...halos,
      {
        id: nextId(),
        kind,
        // Kept clear of the edges so a halo is never half off-screen.
        x: 0.1 + Math.random() * 0.8,
        y: 0.1 + Math.random() * 0.8,
        life,
        maxLife: life,
      },
    ];
    haloTimer = HALO_INTERVAL_MIN + Math.random() * (HALO_INTERVAL_MAX - HALO_INTERVAL_MIN);
  }

  /* ── 5. The slow layers ── */

  const gardenStep = advanceGarden(
    state.garden,
    deltaMs * modifiers.gardenSpeed,
    state.sourceLevels.grove ?? 0,
  );
  for (const seed of gardenStep.discovered) {
    notices.push({
      id: nowMs + notices.length,
      icon: '🌱',
      title: 'Something new in the garden',
      body: seed,
      kind: 'gift',
    });
  }

  const exchange = advanceExchange(state.exchange, deltaMs, state.sourceLevels.almshouse ?? 0);
  const hours = advanceHours(state.hours, deltaMs, state.sourceLevels.scriptorium ?? 0);
  const mannaStep = advanceManna(state.manna, deltaMs, modifiers.mannaSpeed);
  if (mannaStep.ripened > 0) {
    notices.push({
      id: nowMs + notices.length,
      icon: '🍞',
      title:
        mannaStep.ripened === 1 ? 'Manna has ripened' : `${mannaStep.ripened} manna have ripened`,
      kind: 'gift',
    });
  }

  /* ── 6. Book-keeping ── */

  let next: GameState = {
    ...state,
    lastTick: nowMs,
    joy,
    runJoy,
    lifetimeJoy,
    peakJoy,
    sourceEarnings,
    sinners: sinnerStep.sinners,
    buffs,
    halos,
    haloTimer,
    haloStreak,
    garden: gardenStep.garden,
    exchange,
    hours,
    manna: mannaStep.manna,
    playtime: state.playtime + delta,
    runPlaytime: state.runPlaytime + delta,
    recentTouches: state.recentTouches.filter((t) => nowMs - t < 3_000),
    notices,
  };

  /* ── 7. The Steward ── */

  if (computeStewardActive(next)) {
    const timer = next.stewardTimer - delta;
    if (timer <= 0) {
      next = { ...runSteward(next), stewardTimer: 5 };
    } else {
      next = { ...next, stewardTimer: timer };
    }
  }

  /* ── 8. Trophies, on a one-second beat ── */

  auditCarry += deltaMs;
  if (auditCarry >= AUDIT_INTERVAL_MS) {
    auditCarry = 0;
    next = auditTrophies(next, nowMs);
  }

  return next;
}

/** Sum of raw base output, used only to split earnings between sources. */
function rawBase(state: GameState): number {
  let sum = 0;
  for (const source of SOURCES) sum += source.baseJps * (state.sources[source.id] ?? 0);
  return sum || 1;
}

function rollHaloKind(rapture: number): HaloKind {
  if (rapture > 0 && Math.random() < SERAPHIC_CHANCE * rapture) return 'seraphic';
  // Deep in the Rapture most halos are sable — richer, and two of them bite.
  if (rapture > 0 && Math.random() < 0.2 + rapture * 0.2) return 'sable';
  return 'gilded';
}

/* ══════════════════════════════════════════════════════════════════════════
   The Steward
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Spends spare joy on whatever has the shortest payback, keeping a reserve so
 * it never empties the treasury out from under a player who was saving for a
 * halo's Lucky payout — which reads 15% of what you hold, and would otherwise
 * be quietly sabotaged by their own automation.
 */
function runSteward(state: GameState): GameState {
  const best = computeBestPurchase(state);
  if (!best) return state;

  const reserve = computeGrossJps(state) * 60;
  if (state.joy - best.cost < reserve) return state;

  if (best.kind === 'source') {
    const have = state.sources[best.id] ?? 0;
    return {
      ...state,
      joy: state.joy - best.cost,
      sources: { ...state.sources, [best.id]: have + 1 },
    };
  }

  return {
    ...state,
    joy: state.joy - best.cost,
    blessings: new Set([...state.blessings, best.id]),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   The vigil — what happened while the temple was shut
   ══════════════════════════════════════════════════════════════════════════ */

export interface VigilResult {
  state: GameState;
  seconds: number;
  joy: number;
  sinnerJoy: number;
  manna: number;
}

/**
 * Fast-forward a save by the time since it was written.
 *
 * Income is capped by the vigil terms, but everything else — the garden, the
 * market, the manna, and above all the Sinners — runs on the *full* elapsed
 * time. That asymmetry is deliberate and is the whole answer to "is this game
 * fun when it is closed": your rate is throttled, but your garden matured,
 * your market moved, three manna ripened, and twelve Sinners spent nine hours
 * getting fat on your behalf.
 *
 * `sinceMs` defaults to when the save was written, which is the case on load.
 * The other caller is a tab waking from the background: browsers stop serving
 * animation frames to a hidden tab, so the game simply stops, and the clamp in
 * `applyTick` means the first frame back would credit at most a minute of a
 * nine-hour afternoon. Waking runs this instead, from the last tick.
 */
export function applyVigil(
  state: GameState,
  nowMs = Date.now(),
  sinceMs = state.lastSaved,
): VigilResult {
  const elapsedSeconds = Math.max(0, (nowMs - sinceMs) / 1000);
  if (elapsedSeconds < 5) {
    return { state: { ...state, lastTick: nowMs }, seconds: 0, joy: 0, sinnerJoy: 0, manna: 0 };
  }

  const elapsedMs = elapsedSeconds * 1000;
  const modifiers = computeRateModifiers(state);
  const grossJps = computeGrossJps(state);

  // ── Income, capped ──
  const { efficiency, hours } = computeVigilTerms(state);
  const countedSeconds = Math.min(elapsedSeconds, hours * 3600);
  const drain = computeSinnerDrain(state);
  const joy = grossJps * (1 - drain) * countedSeconds * efficiency;

  // ── Sinners, uncapped: they were here the whole time ──
  let appetite = 1;
  for (const id of state.blessings) {
    const def = BLESSING_MAP[id];
    if (def?.sinnerAppetite) appetite *= def.sinnerAppetite;
  }
  const sinnerStep = advanceSinners(
    state.sinners,
    elapsedSeconds,
    grossJps * efficiency,
    state.rapture,
    appetite,
    nextId,
  );

  // ── The slow layers, uncapped ──
  const gardenStep = advanceGarden(
    state.garden,
    elapsedMs * modifiers.gardenSpeed,
    state.sourceLevels.grove ?? 0,
  );
  const exchange = advanceExchange(state.exchange, elapsedMs, state.sourceLevels.almshouse ?? 0);
  const hoursState = advanceHours(state.hours, elapsedMs, state.sourceLevels.scriptorium ?? 0);
  const mannaStep = advanceManna(state.manna, elapsedMs, modifiers.mannaSpeed);

  // Buffs do not survive an absence. A frenzy you were not present for was
  // never a frenzy.
  const next: GameState = {
    ...state,
    lastTick: nowMs,
    joy: state.joy + joy,
    runJoy: state.runJoy + joy,
    lifetimeJoy: state.lifetimeJoy + joy,
    peakJoy: Math.max(state.peakJoy, state.joy + joy),
    sinners: sinnerStep.sinners,
    buffs: [],
    halos: [],
    garden: gardenStep.garden,
    exchange,
    hours: hoursState,
    manna: mannaStep.manna,
    playtime: state.playtime + countedSeconds,
    runPlaytime: state.runPlaytime + countedSeconds,
    vigil: {
      seconds: elapsedSeconds,
      joy,
      sinnerJoy: sinnerStep.sinners.reduce((sum, s) => sum + s.swallowed, 0),
      manna: mannaStep.ripened,
      pending: elapsedSeconds > 60,
    },
  };

  return {
    state: next,
    seconds: elapsedSeconds,
    joy,
    sinnerJoy: next.vigil.sinnerJoy,
    manna: mannaStep.ripened,
  };
}

/** Local copy so the vigil does not import a cycle back through the engine. */
function computeVigilTerms(state: GameState): { efficiency: number; hours: number } {
  let efficiency = 0.2;
  let hours = 2;
  for (const id of state.blessings) {
    const def = BLESSING_MAP[id];
    if (!def) continue;
    if (def.vigilEfficiency) efficiency += def.vigilEfficiency;
    if (def.vigilHours) hours += def.vigilHours;
  }
  // Legacy rungs are read through the engine's own helper on the hot path;
  // here the same two fields are enough and keep this function self-contained.
  for (const id of state.legacy) {
    const def = LEGACY_VIGIL[id];
    if (!def) continue;
    efficiency += def.efficiency;
    hours += def.hours;
  }
  return { efficiency: Math.min(1, efficiency), hours };
}

/** The Legacy rungs that touch the vigil, flattened for the lookup above. */
const LEGACY_VIGIL: Record<string, { efficiency: number; hours: number }> = {
  gates_1: { efficiency: 0.15, hours: 5 },
  gates_2: { efficiency: 0.2, hours: 16 },
  gates_3: { efficiency: 0.35, hours: 96 },
};

/* ══════════════════════════════════════════════════════════════════════════
   Fervour — the reward for a burst of offerings
   ══════════════════════════════════════════════════════════════════════════ */

/** True while the player is offering fast enough to count as fervent. */
export function isFervent(state: GameState, nowMs = Date.now()): boolean {
  return state.recentTouches.filter((t) => nowMs - t < 3_000).length >= 8;
}

/** How many sources exist at all, for the congregation halo. */
export function congregationSize(state: GameState): number {
  return computeTotalSources(state);
}

/** Re-exported so callers do not reach past the tick for the same number. */
export { computeJps, computeSourceCost };
