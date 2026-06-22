/**
 * RMH Coding Simulator — pure economy math.
 *
 * Every "compute*" function derives a value from a GameState without mutating
 * it. Multipliers from upgrades, the skill tree, Equity perks, achievements and
 * active buffs are folded together here so the rest of the game stays declarative.
 */

import type { GameState, GeneratorId, Effects } from './types';
import {
  GENERATOR_MAP,
  UPGRADE_MAP,
  SKILL_MAP,
  PERK_MAP,
  COST_GROWTH,
  ACHIEVEMENT_BONUS_PER,
  REP_BONUS_PER_STAR,
  EQUITY_BONUS_PER,
  reputationForLifetime,
  equityForReputation,
} from './data';

/** Iterate every owned effect-bearing item (upgrades, skills, perks). */
function* ownedEffects(s: GameState): Generator<Effects> {
  for (const id of s.upgrades) {
    const u = UPGRADE_MAP[id];
    if (u) yield u;
  }
  for (const id of s.skills) {
    const sk = SKILL_MAP[id];
    if (sk) yield sk;
  }
  for (const id of s.perks) {
    const p = PERK_MAP[id];
    if (p) yield p;
  }
}

// ─── Cost of the Nth purchase of a generator ─────────────────────────────────

/** Price of a single generator given how many are already owned. */
export function generatorCost(genId: GeneratorId, owned: number): number {
  const def = GENERATOR_MAP[genId];
  if (!def) return Infinity;
  return Math.ceil(def.baseCost * Math.pow(COST_GROWTH, owned));
}

/** Total price to buy `n` more of a generator (geometric series). */
export function generatorBulkCost(genId: GeneratorId, owned: number, n: number): number {
  const def = GENERATOR_MAP[genId];
  if (!def || n <= 0) return Infinity;
  // Sum of base * r^owned .. base * r^(owned+n-1)
  const r = COST_GROWTH;
  const first = def.baseCost * Math.pow(r, owned);
  return Math.ceil((first * (Math.pow(r, n) - 1)) / (r - 1));
}

/** How many of a generator the player can afford right now (capped). */
export function maxAffordable(s: GameState, genId: GeneratorId, cap = 10_000): number {
  const def = GENERATOR_MAP[genId];
  if (!def) return 0;
  const owned = s.generators[genId] ?? 0;
  const r = COST_GROWTH;
  const first = def.baseCost * Math.pow(r, owned);
  // Largest n with first*(r^n - 1)/(r-1) <= loc
  const ratio = (s.loc * (r - 1)) / first + 1;
  if (ratio <= 1) return 0;
  const n = Math.floor(Math.log(ratio) / Math.log(r));
  return Math.max(0, Math.min(cap, n));
}

/** Resolve the buy quantity setting into a concrete count for a generator. */
export function resolveBuyCount(s: GameState, genId: GeneratorId): number {
  if (s.buyQty === 'max') return Math.max(1, maxAffordable(s, genId));
  return s.buyQty;
}

// ─── Multipliers ──────────────────────────────────────────────────────────────

/** Permanent bonus from prestige currencies + achievements (no buffs). */
export function permanentMultiplier(s: GameState): number {
  let mult = 1;
  // Reputation: +2% per earned star.
  mult *= 1 + REP_BONUS_PER_STAR * s.reputationEarned;
  // Equity: +50% per earned point.
  mult *= 1 + EQUITY_BONUS_PER * s.equityEarned;
  // Achievements: +1% each.
  mult *= 1 + ACHIEVEMENT_BONUS_PER * s.achievements.length;
  // Flat global multipliers from upgrades / skills / perks.
  for (const e of ownedEffects(s)) {
    if (e.globalMult) mult *= e.globalMult;
  }
  return mult;
}

/** Combined CpS multiplier from active buffs (golden commits, AI sprints). */
export function buffCpsMultiplier(s: GameState): number {
  return s.activeBuffs.reduce((m, b) => m * b.cpsMult, 1);
}

/** Combined click multiplier from active buffs. */
export function buffClickMultiplier(s: GameState): number {
  return s.activeBuffs.reduce((m, b) => m * b.clickMult, 1);
}

// ─── Production ─────────────────────────────────────────────────────────────

/** Per-unit LoC/sec for one generator, after its own upgrade multipliers. */
export function generatorUnitCps(s: GameState, genId: GeneratorId): number {
  const def = GENERATOR_MAP[genId];
  if (!def) return 0;
  let cps = def.baseCps;
  for (const e of ownedEffects(s)) {
    if (e.genMult && e.genMult.genId === genId) cps *= e.genMult.factor;
  }
  return cps;
}

/** Total LoC/sec from one generator line (unit × count), pre-global multiplier. */
export function generatorLineCps(s: GameState, genId: GeneratorId): number {
  return generatorUnitCps(s, genId) * (s.generators[genId] ?? 0);
}

/** Raw sum of every generator line, before global / buff multipliers. */
export function baseCps(s: GameState): number {
  let total = 0;
  for (const genId of Object.keys(GENERATOR_MAP)) {
    total += generatorLineCps(s, genId);
  }
  return total;
}

/** Final LoC/sec including permanent and buff multipliers. */
export function totalCps(s: GameState): number {
  return baseCps(s) * permanentMultiplier(s) * buffCpsMultiplier(s);
}

/** LoC produced by a single click, including CpS-synergy and buffs. */
export function clickPower(s: GameState): number {
  let flat = 1;
  let clickMult = 1;
  let fromCps = 0;
  for (const e of ownedEffects(s)) {
    if (e.clickFlat) flat += e.clickFlat;
    if (e.clickMult) clickMult *= e.clickMult;
    if (e.clickFromCps) fromCps += e.clickFromCps;
  }
  const base = (flat * clickMult) * permanentMultiplier(s);
  const synergy = totalCps(s) * fromCps; // already includes permanent mult
  return (base + synergy) * buffClickMultiplier(s);
}

// ─── Golden commit tuning ─────────────────────────────────────────────────────

/** Multiplier on how frequently golden commits spawn. */
export function goldenFreqMultiplier(s: GameState): number {
  let m = 1;
  for (const e of ownedEffects(s)) if (e.goldenFreqMult) m *= e.goldenFreqMult;
  return m;
}

/** Multiplier on golden commit reward payouts. */
export function goldenPowerMultiplier(s: GameState): number {
  let m = 1;
  for (const e of ownedEffects(s)) if (e.goldenPowerMult) m *= e.goldenPowerMult;
  return m;
}

// ─── Offline progress tuning ──────────────────────────────────────────────────

const BASE_OFFLINE_CAP_HOURS = 3;
const BASE_OFFLINE_EFFICIENCY = 0.5;

export function offlineCapSeconds(s: GameState): number {
  let hours = BASE_OFFLINE_CAP_HOURS;
  for (const e of ownedEffects(s)) if (e.offlineHours) hours += e.offlineHours;
  return hours * 3600;
}

export function offlineEfficiency(s: GameState): number {
  let eff = BASE_OFFLINE_EFFICIENCY;
  for (const e of ownedEffects(s)) if (e.offlineEffMult) eff *= e.offlineEffMult;
  return Math.min(1, eff);
}

// ─── Prestige queries ─────────────────────────────────────────────────────────

/** Reputation the player would gain by shipping right now. */
export function pendingReputation(s: GameState): number {
  const wouldHave = reputationForLifetime(s.lifetimeLoc);
  // Already-earned this run is baked into reputationEarned; grant the delta.
  return Math.max(0, wouldHave - s.reputationEarned);
}

/** Equity the player would gain by going public right now. */
export function pendingEquity(s: GameState): number {
  const wouldHave = equityForReputation(s.reputationEarned);
  return Math.max(0, wouldHave - s.equityEarned);
}

/** Total starting LoC granted by skills/perks at the start of a run. */
export function startingLoc(s: GameState): number {
  let loc = 0;
  for (const e of ownedEffects(s)) if (e.startingLoc) loc += e.startingLoc;
  return loc;
}
