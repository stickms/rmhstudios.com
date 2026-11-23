/**
 * Scripted players for the balance simulation (`balance.test.ts`). Each acts only in the build phase, never calls
 * waves early, and places instruments on the bench cells that cover the most corridor, which is what a careful
 * human does. They differ only in what they buy.
 */
import { TOWERS, type TowerType } from '../data';
import type { Tower } from '../Entities';
import type { Simulation } from '../Simulation';

export type StrategyName = 'balanced' | 'greedy' | 'spam';

const coverageCache = new WeakMap<Simulation, Map<string, number>>();

function coverage(sim: Simulation, x: number, y: number, range: number): number {
  let m = coverageCache.get(sim);
  if (!m) coverageCache.set(sim, (m = new Map()));
  const k = `${x},${y},${range}`;
  let v = m.get(k);
  if (v === undefined) m.set(k, (v = sim.grid.coverage(x, y, range)));
  return v;
}

/** The free bench with the most corridor in reach for this instrument (ties: reading order). */
function bestCell(sim: Simulation, type: TowerType): { x: number; y: number } | null {
  const range = TOWERS[type].tiers[0].range;
  let best: { x: number; y: number } | null = null;
  let bestScore = -1;
  for (const c of sim.grid.benches()) {
    if (!sim.grid.canBuild(c.x, c.y)) continue;
    let score: number;
    if (type === 'BIOBANK') {
      // Banks go where nothing else would: least coverage first.
      score = 10_000 - coverage(sim, c.x, c.y, 2.5);
    } else if (type === 'ECHO') {
      const centre = sim.grid.cellCenter(c.x, c.y);
      score = sim.entities.towers.filter(
        (t) => t.def.attack !== 'income' && t.def.attack !== 'support' && Math.hypot(t.x - centre.x, t.y - centre.y) <= range * 60,
      ).length * 1000 + coverage(sim, c.x, c.y, range);
    } else {
      score = coverage(sim, c.x, c.y, range);
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function build(sim: Simulation, type: TowerType): boolean {
  if (!sim.canAfford(type)) return false;
  const c = bestCell(sim, type);
  if (!c) return false;
  return sim.place(type, c.x, c.y).ok;
}

function towersOf(sim: Simulation, type?: TowerType): Tower[] {
  return sim.entities.towers.filter((t) => !type || t.type === type);
}

/** Upgrade the lowest-tier instrument of the given types; true if one was bought. */
function upgradeLowest(sim: Simulation, types: TowerType[]): boolean {
  const cands = towersOf(sim)
    .filter((t) => types.includes(t.type) && t.upgradeCost() !== null)
    .sort((a, b) => a.tier - b.tier || (a.upgradeCost() ?? 0) - (b.upgradeCost() ?? 0));
  const t = cands[0];
  if (!t) return false;
  const cost = t.upgradeCost()!;
  if (sim.serum < cost) return false;
  return sim.upgrade(t).ok;
}

const DAMAGE: TowerType[] = ['SYNAPSE', 'CAUTERY', 'CENTRIFUGE', 'DEFIBRILLATOR', 'LOBOTOMIZER', 'SUPPRESSOR'];

/** The opening and then a rotation that answers each new specimen: armour, cloaks, shields, regeneration. */
const BALANCED_OPENING: TowerType[] = [
  'SYNAPSE',
  'SYNAPSE',
  'CAUTERY',
  'SUPPRESSOR',
  'CENTRIFUGE',
  'BIOBANK',
  'DEFIBRILLATOR',
  'LOBOTOMIZER',
  'ECHO',
];
const BALANCED_ROTATION: TowerType[] = ['CAUTERY', 'CENTRIFUGE', 'DEFIBRILLATOR', 'LOBOTOMIZER', 'SUPPRESSOR', 'SYNAPSE', 'ECHO'];

/** The first opening instrument not yet on the board (counting repeats), or null once the opening is built. */
function openingMissing(sim: Simulation): TowerType | null {
  const seen = new Map<TowerType, number>();
  for (const type of BALANCED_OPENING) {
    const need = (seen.get(type) ?? 0) + 1;
    seen.set(type, need);
    if (towersOf(sim, type).length < need) return type;
  }
  return null;
}

/** Reads the dossier like a player would: a revealer per lane before the first cloaked wave. */
function prepare(sim: Simulation): boolean {
  const next = sim.wave + 1;
  if (next >= 8) {
    const revealers = towersOf(sim, 'DEFIBRILLATOR').length;
    if (revealers < sim.grid.lanes.length) return build(sim, 'DEFIBRILLATOR') || true;
  }
  return false;
}

function balanced(sim: Simulation) {
  for (let guard = 0; guard < 60; guard++) {
    const before = sim.serum;
    if (prepare(sim)) {
      if (sim.serum === before) return;
      continue;
    }
    const have = towersOf(sim).length;
    const missing = openingMissing(sim);
    if (missing) {
      if (!build(sim, missing)) return;
      continue;
    }
    // Then alternate: bring every damage instrument to the next tier, else add one from the rotation.
    const lowTier = Math.min(...towersOf(sim).filter((t) => DAMAGE.includes(t.type)).map((t) => t.tier));
    const builtAfter = Math.max(0, have - towersOf(sim, 'BIOBANK').length - (BALANCED_OPENING.length - 1));
    if (lowTier < Math.min(2, 1 + Math.floor(builtAfter / 4))) {
      if (!upgradeLowest(sim, DAMAGE)) return;
      continue;
    }
    if (upgradeLowest(sim, ['ECHO'])) continue;
    const next = BALANCED_ROTATION[builtAfter % BALANCED_ROTATION.length]!;
    if (!build(sim, next)) {
      if (!upgradeLowest(sim, DAMAGE)) return;
    }
  }
}

/**
 * Economy first: the same opening as balanced, then every other build phase pays the biobanks before anything
 * else (a new bank, or a tier for the lowest one, up to four banks at tier III); defence gets what is left.
 */
function greedy(sim: Simulation) {
  if (!openingMissing(sim) && sim.wave % 2 === 0) {
    const banks = towersOf(sim, 'BIOBANK');
    if (!(banks.length >= 2 && upgradeLowest(sim, ['BIOBANK'])) && banks.length < 4) build(sim, 'BIOBANK');
  }
  balanced(sim);
}

/** One instrument only: Synapses on the best benches, upgraded as money allows. */
function spam(sim: Simulation) {
  for (let guard = 0; guard < 60; guard++) {
    const syn = towersOf(sim, 'SYNAPSE');
    const lowTier = syn.length ? Math.min(...syn.map((t) => t.tier)) : 2;
    if (lowTier < 2 && syn.length >= 4 + lowTier * 4) {
      if (!upgradeLowest(sim, ['SYNAPSE'])) return;
      continue;
    }
    if (!build(sim, 'SYNAPSE')) {
      if (!upgradeLowest(sim, ['SYNAPSE'])) return;
    }
  }
}

export const STRATEGIES: Record<StrategyName, (sim: Simulation) => void> = { balanced, greedy, spam };

export interface RunResult {
  cleared: number;
  score: number;
  simSeconds: number;
  integrity: number;
  /** Integrity lost per specimen type in the last wave played. */
  leaks: Record<string, number>;
}

/** Play one run to the end (or `maxWave` cleared) with a strategy, no early calls. */
export function runStrategy(
  SimulationCtor: typeof Simulation,
  map: Simulation['mapId'],
  seed: number,
  name: StrategyName,
  maxWave = 70,
): RunResult {
  const sim = new SimulationCtor(map, seed);
  const act = STRATEGIES[name];
  let leaks: Record<string, number> = {};
  while (sim.phase !== 'over' && sim.cleared < maxWave) {
    if (sim.phase === 'victory') sim.continueOvertime();
    act(sim);
    sim.startWave();
    let guard = 0;
    leaks = {};
    while (sim.phase === 'wave' && guard++ < 60 * 60 * 10) {
      sim.step();
      for (const e of sim.drain()) if (e.t === 'leak') leaks[e.enemy] = (leaks[e.enemy] ?? 0) + e.amount;
    }
  }
  return { cleared: sim.cleared, score: sim.score, simSeconds: sim.time, integrity: sim.integrity, leaks };
}
