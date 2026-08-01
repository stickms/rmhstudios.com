/**
 * Isleworks — objectives.
 *
 * The tutorial, the pacing and the reward curve in one list. Each objective is
 * a `measure(state) → 0…1` so the panel can show a real progress bar rather than
 * a checkbox that flips with no warning, and each one *names the next system*:
 * the road objective arrives before the power one, power before services,
 * services before density. A player who does nothing but chase this list will
 * meet every mechanic in the intended order.
 *
 * Rewards are paid on claim, not on completion. Claiming is one click and it is
 * the one moment the HUD gets to be loud.
 */

import { CITY_HALL_ID } from './catalog';
import { clamp01, type CityState, type ObjectiveProgress } from './types';

export interface ObjectiveDefinition {
  id: string;
  title: string;
  hint: string;
  reward: number;
  /** 0–1. Reaching 1 completes the objective. */
  measure: (state: CityState) => number;
}

function countOf(state: CityState, definitionId: string): number {
  return state.buildings.filter((b) => b.definitionId === definitionId).length;
}

function countCategory(state: CityState, ids: string[]): number {
  return state.buildings.filter((b) => ids.includes(b.definitionId)).length;
}

export const OBJECTIVES: ObjectiveDefinition[] = [
  {
    id: 'first-roads',
    title: 'Lay the first street',
    hint: 'Place 6 road tiles running out from city hall.',
    reward: 250,
    measure: (s) => clamp01(countOf(s, 'road') / 6),
  },
  {
    id: 'first-homes',
    title: 'Somewhere to live',
    hint: 'Build 4 cottages beside a road.',
    reward: 300,
    measure: (s) => clamp01(countOf(s, 'cottage') / 4),
  },
  {
    id: 'lights-on',
    title: 'Turn the lights on',
    hint: 'Generate more power than the island is drawing.',
    reward: 350,
    measure: (s) =>
      s.stats.powerDemand === 0
        ? clamp01(s.stats.powerSupply / 30)
        : clamp01(s.stats.powerSupply / Math.max(1, s.stats.powerDemand)),
  },
  {
    id: 'running-water',
    title: 'Running water',
    hint: 'Supply every connected building with water.',
    reward: 350,
    measure: (s) =>
      s.stats.waterDemand === 0
        ? clamp01(s.stats.waterSupply / 40)
        : clamp01(s.stats.waterSupply / Math.max(1, s.stats.waterDemand)),
  },
  {
    id: 'first-jobs',
    title: 'Somewhere to work',
    hint: 'Create 20 jobs across shops and industry.',
    reward: 400,
    measure: (s) => clamp01(s.stats.jobs / 20),
  },
  {
    id: 'twenty-five',
    title: 'A village',
    hint: 'Reach a population of 25.',
    reward: 450,
    measure: (s) => clamp01(s.stats.population / 25),
  },
  {
    id: 'green-space',
    title: 'Room to breathe',
    hint: 'Add 3 leisure buildings — parks count.',
    reward: 400,
    measure: (s) =>
      clamp01(countCategory(s, ['pocket-park', 'playground', 'sports-court', 'plaza']) / 3),
  },
  {
    id: 'health-cover',
    title: 'Call the doctor',
    hint: 'Get health cover to 70% of residents.',
    reward: 500,
    measure: (s) => clamp01(s.stats.coverage.health / 0.7),
  },
  {
    id: 'happy-island',
    title: 'A happy island',
    hint: 'Hold happiness at 65 or above.',
    reward: 600,
    measure: (s) => clamp01(s.stats.happiness / 65),
  },
  {
    id: 'hundred',
    title: 'A proper town',
    hint: 'Reach a population of 100.',
    reward: 800,
    measure: (s) => clamp01(s.stats.population / 100),
  },
  {
    id: 'in-the-black',
    title: 'In the black',
    hint: 'Run a monthly surplus of 150 or more.',
    reward: 700,
    measure: (s) => clamp01(s.stats.netIncome / 150),
  },
  {
    id: 'expand',
    title: 'Buy the next headland',
    hint: 'Purchase 3 extra parcels of land.',
    reward: 600,
    measure: (s) => clamp01(Math.max(0, s.ownedParcels.length - 4) / 3),
  },
  {
    id: 'schooling',
    title: 'Open a school',
    hint: 'Get education cover to half the island.',
    reward: 800,
    measure: (s) => clamp01(s.stats.coverage.education / 0.5),
  },
  {
    id: 'clean-industry',
    title: 'Clean up',
    hint: 'Hold average pollution below 8 with 40+ industrial jobs.',
    reward: 900,
    measure: (s) => {
      const industry = clamp01(
        s.buildings.filter((b) =>
          ['workshop', 'factory', 'warehouse', 'recycling-plant', 'fabrication-lab'].includes(
            b.definitionId,
          ),
        ).length / 3,
      );
      const clean = clamp01((20 - s.stats.pollution) / 12);
      return Math.min(industry, clean);
    },
  },
  {
    id: 'transit',
    title: 'Move people, not cars',
    hint: 'Bring average traffic under 30 with 200+ residents.',
    reward: 1000,
    measure: (s) =>
      Math.min(clamp01(s.stats.population / 200), clamp01((60 - s.stats.traffic) / 30)),
  },
  {
    id: 'five-hundred',
    title: 'A city',
    hint: 'Reach a population of 500.',
    reward: 1500,
    measure: (s) => clamp01(s.stats.population / 500),
  },
  {
    id: 'landmark',
    title: 'Crown the island',
    hint: 'Build the observatory.',
    reward: 2000,
    measure: (s) => clamp01(countOf(s, 'observatory')),
  },
];

export function initialObjectives(): ObjectiveProgress[] {
  return OBJECTIVES.map((o) => ({ id: o.id, complete: false, progress: 0, claimed: false }));
}

/**
 * Re-measure every objective.
 *
 * Completion is sticky: an objective that has been met once stays met even if
 * the city dips afterwards. Un-completing an objective the player has already
 * been congratulated for reads as a bug, not as difficulty.
 */
export function evaluateObjectives(state: CityState): ObjectiveProgress[] {
  const byId = new Map(state.objectives.map((o) => [o.id, o]));
  return OBJECTIVES.map((def) => {
    const prev = byId.get(def.id) ?? {
      id: def.id,
      complete: false,
      progress: 0,
      claimed: false,
    };
    const progress = clamp01(def.measure(state));
    return {
      id: def.id,
      progress: prev.complete ? 1 : progress,
      complete: prev.complete || progress >= 1,
      claimed: prev.claimed,
    };
  });
}

export function objectiveDefinition(id: string): ObjectiveDefinition | undefined {
  return OBJECTIVES.find((o) => o.id === id);
}

/** The two or three the panel should show: unclaimed, nearest to done first. */
export function activeObjectives(state: CityState, limit = 3): ObjectiveProgress[] {
  return state.objectives
    .filter((o) => !o.claimed)
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      return b.progress - a.progress;
    })
    .slice(0, limit);
}

/** Guard: city hall must exist before objectives make any sense. */
export function hasCityHall(state: CityState): boolean {
  return state.buildings.some((b) => b.definitionId === CITY_HALL_ID);
}
