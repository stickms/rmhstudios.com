/**
 * The engine — every derived number in the game, computed from state alone.
 *
 * Nothing here mutates and nothing here is cached: `computeJps` walks the whole
 * blessing list on every call. That sounds expensive and is not — a few hundred
 * array entries at a handful of calls per second is nothing — and it buys the
 * property that matters most in an idle game: **there is exactly one place a
 * multiplier can come from**, so a number on screen can always be explained.
 *
 * The order of the stack is Cookie Clicker's, which is worth preserving because
 * players reason about it:
 *
 *   per-source base × copies
 *     × tier blessings × synergies × manna levels
 *   summed
 *     × global blessings × Devotion (Cherubim) × Grace × Legacy
 *     × garden × choir × halo buffs
 *     − what the Sinners are drinking
 */
import type { BlessingDef, GameState, SourceId } from './types';
import { BLESSINGS, BLESSING_MAP } from './data/blessings';
import { SOURCES, SOURCE_MAP, COST_GROWTH, REVEAL_SHARE } from './data/sources';
import { LEGACY, LEGACY_MAP, GRACE_DIVISOR, MIN_ASCEND_JOY } from './data/legacy';
import { DEVOTION_PER_TROPHY, DEVOTION_TROPHIES } from './data/trophies';
import { gardenEffects } from './minigames/garden';
import { choirEffects } from './minigames/choir';
import { levelMultiplier } from './minigames/manna';
import { sinnerDrain } from './minigames/sinners';

/* ══════════════════════════════════════════════════════════════════════════
   Small shared reads
   ══════════════════════════════════════════════════════════════════════════ */

/** The blessings the player owns, as definitions. */
function owned(state: GameState): BlessingDef[] {
  const out: BlessingDef[] = [];
  for (const id of state.blessings) {
    const def = BLESSING_MAP[id];
    if (def) out.push(def);
  }
  return out;
}

/** Devotion: 4% per qualifying trophy. The Cherubim turn this into income. */
export function computeDevotion(state: GameState): number {
  let count = 0;
  for (const id of state.trophies) if (DEVOTION_TROPHIES.has(id)) count++;
  return count * DEVOTION_PER_TROPHY;
}

/** Total Manna levels bought, across every source. */
export function computeTotalLevels(state: GameState): number {
  let total = 0;
  for (const id of Object.keys(state.sourceLevels) as SourceId[]) {
    total += state.sourceLevels[id] ?? 0;
  }
  return total;
}

/** Total copies of everything. */
export function computeTotalSources(state: GameState): number {
  let total = 0;
  for (const id of Object.keys(state.sources) as SourceId[]) total += state.sources[id] ?? 0;
  return total;
}

/* ══════════════════════════════════════════════════════════════════════════
   Prices
   ══════════════════════════════════════════════════════════════════════════ */

export function computeSourceCost(id: SourceId, alreadyOwned: number): number {
  return Math.ceil(SOURCE_MAP[id].baseCost * Math.pow(COST_GROWTH, alreadyOwned));
}

/**
 * Cost of `n` more copies. Closed form rather than a loop: buying "max" at
 * 400 copies would otherwise be four hundred `Math.pow` calls per frame, and
 * the geometric sum is exact.
 */
export function computeSourceCostN(id: SourceId, alreadyOwned: number, n: number): number {
  if (n <= 0) return 0;
  const base = SOURCE_MAP[id].baseCost * Math.pow(COST_GROWTH, alreadyOwned);
  return Math.ceil((base * (Math.pow(COST_GROWTH, n) - 1)) / (COST_GROWTH - 1));
}

/**
 * How many copies `joy` can buy. Solved rather than iterated, then corrected
 * by one — floating point on a geometric series is close but not exact, and an
 * off-by-one that lets a purchase go negative is worse than a spare `while`.
 */
export function computeMaxAffordable(id: SourceId, alreadyOwned: number, joy: number): number {
  if (joy <= 0) return 0;
  const base = SOURCE_MAP[id].baseCost * Math.pow(COST_GROWTH, alreadyOwned);
  if (joy < base) return 0;
  const exact = Math.log((joy * (COST_GROWTH - 1)) / base + 1) / Math.log(COST_GROWTH);
  let n = Math.max(0, Math.floor(exact));
  while (n > 0 && computeSourceCostN(id, alreadyOwned, n) > joy) n--;
  while (computeSourceCostN(id, alreadyOwned, n + 1) <= joy) n++;
  return n;
}

/** How many the current buy-quantity setting would purchase. */
export function computeBuyCount(state: GameState, id: SourceId): number {
  const have = state.sources[id] ?? 0;
  if (state.buyQty === 'max') return computeMaxAffordable(id, have, state.joy);
  return state.buyQty;
}

/* ══════════════════════════════════════════════════════════════════════════
   Per-source output
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * One source's contribution to joy-per-second, with everything that applies to
 * it specifically but nothing that applies to the temple as a whole.
 */
export function computeSourceJps(state: GameState, id: SourceId): number {
  const count = state.sources[id] ?? 0;
  if (count === 0) return 0;

  const def = SOURCE_MAP[id];
  let per = def.baseJps;

  // Tier blessings and synergies.
  for (const blessing of owned(state)) {
    if (blessing.sourceMultiplier?.id === id) per *= blessing.sourceMultiplier.factor;
    if (blessing.synergy?.boosted === id) {
      const partners = state.sources[blessing.synergy.from] ?? 0;
      per *= 1 + blessing.synergy.factor * partners;
    }
  }

  // The Acolyte line: every other source in the temple lends it a hand.
  if (id === 'acolyte') {
    let fromCongregation = 0;
    for (const blessing of owned(state)) {
      if (blessing.acolyteFromCongregation) {
        const others = computeTotalSources(state) - count;
        fromCongregation += blessing.acolyteFromCongregation * others;
      }
    }
    per += fromCongregation;
  }

  // Manna levels: +1% each.
  per *= levelMultiplier(state.sourceLevels[id] ?? 0);

  return per * count;
}

/* ══════════════════════════════════════════════════════════════════════════
   The global stack
   ══════════════════════════════════════════════════════════════════════════ */

export interface MultiplierBreakdown {
  blessings: number;
  devotion: number;
  grace: number;
  legacy: number;
  garden: number;
  choir: number;
  buffs: number;
  /** Everything above, multiplied together. */
  total: number;
}

/**
 * The whole global multiplier, itemised — because a player who cannot see
 * where a ×400 came from stops trusting the game, and because the panel that
 * shows this is one of the better things in the genre.
 */
export function computeMultipliers(state: GameState): MultiplierBreakdown {
  let blessings = 1;
  let devotionMult = 1;

  const devotion = computeDevotion(state);
  for (const blessing of owned(state)) {
    if (blessing.globalMultiplier) blessings *= blessing.globalMultiplier;
    if (blessing.devotionFactor) devotionMult *= 1 + devotion * blessing.devotionFactor;
  }

  // Grace only counts once the Communion rungs unlock it.
  let graceShare = 0;
  let legacyMult = 1;
  for (const id of state.legacy) {
    const def = LEGACY_MAP[id];
    if (!def) continue;
    if (def.graceShare) graceShare += def.graceShare;
    if (def.globalMultiplier) legacyMult *= def.globalMultiplier;
  }
  for (const blessing of owned(state)) {
    if (blessing.graceShare) graceShare += blessing.graceShare;
  }
  const grace = 1 + computeGraceHeld(state) * 0.01 * Math.min(1, graceShare);

  const garden = gardenEffects(state.garden).jpsMultiplier;
  const choir = choirEffects(state.choir, state.runPlaytime).jpsMultiplier;

  let buffs = 1;
  for (const buff of state.buffs) buffs *= buff.jpsMultiplier;

  const total = blessings * devotionMult * grace * legacyMult * garden * choir * buffs;
  return {
    blessings,
    devotion: devotionMult,
    grace,
    legacy: legacyMult,
    garden,
    choir,
    buffs,
    total,
  };
}

/**
 * Joy per second, as the temple actually earns it — Sinners included, which is
 * why this can be much lower than the sum of its parts during the Rapture.
 */
export function computeJps(state: GameState): number {
  return computeGrossJps(state) * (1 - computeSinnerDrain(state));
}

/** Joy per second before the Sinners take their share. */
export function computeGrossJps(state: GameState): number {
  let sum = 0;
  for (const source of SOURCES) sum += computeSourceJps(state, source.id);
  return sum * computeMultipliers(state).total;
}

/** The share of income currently being diverted into Sinners, 0..1. */
export function computeSinnerDrain(state: GameState): number {
  if (state.sinners.length === 0) return 0;
  let appetite = 1;
  for (const blessing of owned(state)) {
    if (blessing.sinnerAppetite) appetite *= blessing.sinnerAppetite;
  }
  return sinnerDrain(state.sinners, appetite);
}

/* ══════════════════════════════════════════════════════════════════════════
   The offering
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Joy per hand-offering. The share-of-rate term is what keeps clicking
 * meaningful at 10^40 — without it the button is decoration after an hour.
 */
export function computeTouch(state: GameState): number {
  let flat = 1;
  let multiplier = 1;
  let shareOfJps = 0;

  for (const blessing of owned(state)) {
    if (blessing.touchFlat) flat += blessing.touchFlat;
    if (blessing.touchMultiplier) multiplier *= blessing.touchMultiplier;
    if (blessing.touchShareOfJps) shareOfJps += blessing.touchShareOfJps;
  }

  for (const id of state.legacy) {
    const def = LEGACY_MAP[id];
    if (def?.touchMultiplier) multiplier *= def.touchMultiplier;
  }

  multiplier *= gardenEffects(state.garden).touchMultiplier;
  multiplier *= choirEffects(state.choir, state.runPlaytime).touchMultiplier;
  for (const buff of state.buffs) multiplier *= buff.touchMultiplier;

  // The share term reads gross rate: a temple full of Sinners should still
  // reward the hand, and the Sinners will take their cut of the result anyway.
  return flat * multiplier + computeGrossJps(state) * shareOfJps * multiplier;
}

/* ══════════════════════════════════════════════════════════════════════════
   Halos, manna, the vigil
   ══════════════════════════════════════════════════════════════════════════ */

export interface RateModifiers {
  haloFrequency: number;
  haloPotency: number;
  haloPatience: number;
  mannaSpeed: number;
  sinnerYield: number;
  gardenSpeed: number;
  graceGain: number;
}

export function computeRateModifiers(state: GameState): RateModifiers {
  const out: RateModifiers = {
    haloFrequency: 1,
    haloPotency: 1,
    haloPatience: 1,
    mannaSpeed: 1,
    sinnerYield: 1,
    gardenSpeed: 1,
    graceGain: 1,
  };

  for (const blessing of owned(state)) {
    if (blessing.haloFrequency) out.haloFrequency *= blessing.haloFrequency;
    if (blessing.haloPotency) out.haloPotency *= blessing.haloPotency;
    if (blessing.haloPatience) out.haloPatience *= blessing.haloPatience;
    if (blessing.mannaSpeed) out.mannaSpeed *= blessing.mannaSpeed;
    if (blessing.sinnerYield) out.sinnerYield *= blessing.sinnerYield;
  }

  for (const id of state.legacy) {
    const def = LEGACY_MAP[id];
    if (!def) continue;
    if (def.haloFrequency) out.haloFrequency *= def.haloFrequency;
    if (def.haloPotency) out.haloPotency *= def.haloPotency;
    if (def.mannaSpeed) out.mannaSpeed *= def.mannaSpeed;
    if (def.graceGain) out.graceGain *= def.graceGain;
  }

  const garden = gardenEffects(state.garden);
  out.haloFrequency *= garden.haloFrequency;
  out.mannaSpeed *= garden.mannaSpeed;
  out.sinnerYield *= garden.sinnerYield;

  const choir = choirEffects(state.choir, state.runPlaytime);
  out.haloFrequency *= choir.haloFrequency;
  out.haloPotency *= choir.haloPotency;
  out.mannaSpeed *= choir.mannaSpeed;
  out.sinnerYield *= choir.sinnerYield;
  out.gardenSpeed *= choir.gardenSpeed;
  out.graceGain *= choir.graceGain;

  return out;
}

export interface VigilTerms {
  /** Share of rate earned while the temple is shut, 0..1. */
  efficiency: number;
  /** How many hours of absence count. */
  hours: number;
}

/**
 * What the temple does while nobody is watching. Base is deliberately small —
 * a fifth of rate for two hours — so that the Legacy rungs and the vigil
 * blessings that raise it feel like the meaningful unlocks they are.
 */
export function computeVigil(state: GameState): VigilTerms {
  let efficiency = 0.2;
  let hours = 2;

  for (const blessing of owned(state)) {
    if (blessing.vigilEfficiency) efficiency += blessing.vigilEfficiency;
    if (blessing.vigilHours) hours += blessing.vigilHours;
  }
  for (const id of state.legacy) {
    const def = LEGACY_MAP[id];
    if (!def) continue;
    if (def.vigilEfficiency) efficiency += def.vigilEfficiency;
    if (def.vigilHours) hours += def.vigilHours;
  }

  return { efficiency: Math.min(1, efficiency), hours };
}

/* ══════════════════════════════════════════════════════════════════════════
   Prestige
   ══════════════════════════════════════════════════════════════════════════ */

/** Grace the save has earned in total, from lifetime joy. Cookie Clicker's cube root. */
export function computeGraceEarned(lifetimeJoy: number): number {
  return Math.floor(Math.cbrt(Math.max(0, lifetimeJoy) / GRACE_DIVISOR));
}

/** Grace currently spendable. */
export function computeGraceHeld(state: GameState): number {
  return state.grace;
}

/** Grace an ascension right now would hand over. */
export function computeAscensionGrace(state: GameState): number {
  const wouldHave = computeGraceEarned(state.lifetimeJoy);
  const gain = Math.max(0, wouldHave - state.graceEarned);
  return Math.floor(gain * computeRateModifiers(state).graceGain);
}

export function computeCanAscend(state: GameState): boolean {
  return state.runJoy >= MIN_ASCEND_JOY && computeAscensionGrace(state) >= 1;
}

/** How many blessings the player may carry through an ascension. */
export function computeKeepsakeSlots(state: GameState): number {
  let slots = 0;
  for (const id of state.legacy) {
    const def = LEGACY_MAP[id];
    if (def?.keptBlessings) slots += def.keptBlessings;
  }
  return slots;
}

export function computeKeepsMinigames(state: GameState): boolean {
  for (const id of state.legacy) {
    if (LEGACY_MAP[id]?.keepsMinigames) return true;
  }
  return false;
}

export function computeStartingGift(state: GameState): { joy: number; acolytes: number } {
  let joy = 0;
  let acolytes = 0;
  for (const id of state.legacy) {
    const def = LEGACY_MAP[id];
    if (!def) continue;
    if (def.startingJoy) joy = Math.max(joy, def.startingJoy);
    if (def.startingAcolytes) acolytes = Math.max(acolytes, def.startingAcolytes);
  }
  return { joy, acolytes };
}

export function computeLegacyAffordable(state: GameState, id: string): boolean {
  const def = LEGACY_MAP[id];
  if (!def || state.legacy.has(id)) return false;
  if (state.grace < def.cost) return false;
  return (def.requires ?? []).every((r) => state.legacy.has(r));
}

export function computeLegacyVisible(state: GameState, id: string): boolean {
  const def = LEGACY_MAP[id];
  if (!def) return false;
  if (state.legacy.has(id)) return true;
  // A rung is visible once everything below it is bought — the ladder should
  // read as a ladder, not as a wishlist.
  return (def.requires ?? []).every((r) => state.legacy.has(r));
}

/* ══════════════════════════════════════════════════════════════════════════
   Availability
   ══════════════════════════════════════════════════════════════════════════ */

/** Whether a source is on the shelf yet. */
export function computeSourceVisible(state: GameState, id: SourceId): boolean {
  if ((state.sources[id] ?? 0) > 0) return true;
  const index = SOURCES.findIndex((s) => s.id === id);
  // The first two are always there; everything else appears once you could
  // plausibly reach it, and once the tier below it exists.
  if (index <= 1) return true;
  const previous = SOURCES[index - 1]!;
  if ((state.sources[previous.id] ?? 0) === 0) return false;
  return state.peakJoy >= SOURCE_MAP[id].baseCost * REVEAL_SHARE;
}

/** Whether a blessing is on offer. */
export function computeBlessingVisible(state: GameState, id: string): boolean {
  const def = BLESSING_MAP[id];
  if (!def || state.blessings.has(id)) return false;
  const u = def.unlock;

  if (u.requires && !state.blessings.has(u.requires)) return false;
  if (u.source && (state.sources[u.source.id] ?? 0) < u.source.count) return false;
  if (u.joy !== undefined && state.peakJoy < u.joy) return false;
  if (u.lifetimeJoy !== undefined && state.lifetimeJoy < u.lifetimeJoy) return false;
  if (u.trophies !== undefined && state.trophies.size < u.trophies) return false;
  if (u.touches !== undefined && state.totalTouches < u.touches) return false;
  if (u.rapture !== undefined && state.rapture < u.rapture) return false;
  if (u.ascensions !== undefined && state.ascensions < u.ascensions) return false;
  if (u.sourceLevels !== undefined && computeTotalLevels(state) < u.sourceLevels) return false;

  // The Rapture's exit only shows once you are in it.
  if (id === 'rapture_calm' && state.rapture === 0) return false;
  return true;
}

/** Every blessing currently on offer, cheapest first. */
export function computeAvailableBlessings(state: GameState): BlessingDef[] {
  const out: BlessingDef[] = [];
  for (const blessing of BLESSINGS) {
    if (computeBlessingVisible(state, blessing.id)) out.push(blessing);
  }
  return out.sort((a, b) => a.cost - b.cost);
}

/**
 * The best thing to buy right now, by payback time — what the Steward buys and
 * what the "recommended" mark on a source row points at.
 *
 * Payback is `price ÷ (extra joy per second)`, which is the right metric and
 * the one experienced idle players compute in their heads anyway.
 */
export function computeBestPurchase(
  state: GameState,
):
  | { kind: 'source'; id: SourceId; cost: number }
  | { kind: 'blessing'; id: string; cost: number }
  | null {
  let best: { kind: 'source' | 'blessing'; id: string; cost: number; payback: number } | null =
    null;
  const currentJps = computeGrossJps(state);

  for (const source of SOURCES) {
    if (!computeSourceVisible(state, source.id)) continue;
    const have = state.sources[source.id] ?? 0;
    const cost = computeSourceCost(source.id, have);
    const after = { ...state, sources: { ...state.sources, [source.id]: have + 1 } };
    const gain = computeGrossJps(after) - currentJps;
    if (gain <= 0) continue;
    const payback = cost / gain;
    if (!best || payback < best.payback) {
      best = { kind: 'source', id: source.id, cost, payback };
    }
  }

  // Blessings are compared on the same footing, but a blessing that only
  // unlocks something (the Steward, a Rapture stage) has no rate to measure,
  // so it is left out rather than treated as infinitely bad.
  for (const blessing of computeAvailableBlessings(state)) {
    if (blessing.raptureStage !== undefined) continue;
    const after = { ...state, blessings: new Set([...state.blessings, blessing.id]) };
    const gain = computeGrossJps(after) - currentJps;
    if (gain <= 0) continue;
    const payback = blessing.cost / gain;
    if (!best || payback < best.payback) {
      best = { kind: 'blessing', id: blessing.id, cost: blessing.cost, payback };
    }
  }

  if (!best) return null;
  return best.kind === 'source'
    ? { kind: 'source', id: best.id as SourceId, cost: best.cost }
    : { kind: 'blessing', id: best.id, cost: best.cost };
}

/** Whether the Steward blessing has been bought and switched on. */
export function computeStewardActive(state: GameState): boolean {
  return state.stewardEnabled && state.blessings.has('steward');
}

/* ══════════════════════════════════════════════════════════════════════════
   Minigame gates
   ══════════════════════════════════════════════════════════════════════════ */

/** Which sources open a minigame, and at which level. */
export function computeMinigameUnlocked(state: GameState, minigame: string): boolean {
  const source = SOURCES.find((s) => s.minigame === minigame);
  if (!source) return false;
  return (state.sourceLevels[source.id] ?? 0) >= 1;
}

/** The Ladder, ordered for display. */
export const LEGACY_TIERS: number[] = [...new Set(LEGACY.map((l) => l.tier))].sort((a, b) => a - b);
