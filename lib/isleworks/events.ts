/**
 * Isleworks — city events.
 *
 * Events exist to stop a solved city from being a static one. Each has a
 * `when` predicate so it fires as commentary on the city the player actually
 * built — a heatwave only turns up once the grid is tight, a strike only once
 * there is an industry to strike — and every effect is a *multiplier the player
 * can already influence*, never a flat "lose 500 coins". An event should read as
 * "the thing you have been neglecting just came due".
 *
 * Nothing here mutates state; `rollEvent` returns a candidate and the store
 * decides whether to accept it.
 */

import type { ActiveCityEvent, CityEventEffect, CityState } from './types';

interface EventDefinition {
  id: string;
  title: string;
  body: string;
  tone: ActiveCityEvent['tone'];
  /** Months the effect lasts. */
  duration: number;
  effect: CityEventEffect;
  /** Relative likelihood once eligible. */
  weight: number;
  when: (state: CityState) => boolean;
}

const EVENTS: EventDefinition[] = [
  {
    id: 'heatwave',
    title: 'Heatwave',
    body: 'Every fan on the island is running. Power demand is up by a third until it breaks.',
    tone: 'bad',
    duration: 3,
    effect: { powerDemandScale: 1.33, happiness: -3 },
    weight: 3,
    when: (s) => s.stats.powerDemand > 40,
  },
  {
    id: 'harvest-festival',
    title: 'Harvest Festival',
    body: 'Bunting on every street. Visitors are spending and nobody is complaining.',
    tone: 'good',
    duration: 2,
    effect: { happiness: 8, incomeScale: 1.2 },
    weight: 3,
    when: (s) => s.stats.population > 30,
  },
  {
    id: 'housing-rush',
    title: 'Housing Rush',
    body: 'Word has got out. People are arriving faster than usual — if you have room.',
    tone: 'good',
    duration: 4,
    effect: { growthScale: 1.6 },
    weight: 3,
    when: (s) => s.stats.happiness > 58 && s.stats.housingCapacity > s.stats.population,
  },
  {
    id: 'smog-alert',
    title: 'Smog Alert',
    body: 'Still air over the island. Pollution is sitting on the rooftops instead of blowing out.',
    tone: 'bad',
    duration: 3,
    effect: { pollution: 12, happiness: -5 },
    weight: 3,
    when: (s) => s.stats.pollution > 18,
  },
  {
    id: 'trade-winds',
    title: 'Trade Winds',
    body: 'Good weather on the shipping lanes. Everything the island sells is worth more.',
    tone: 'good',
    duration: 3,
    effect: { incomeScale: 1.3 },
    weight: 2,
    when: (s) => s.stats.jobsFilled > 20,
  },
  {
    id: 'grid-fault',
    title: 'Grid Fault',
    body: 'A substation is limping. Everything is drawing more than it should until it is fixed.',
    tone: 'bad',
    duration: 2,
    effect: { powerDemandScale: 1.25, happiness: -2 },
    weight: 2,
    when: (s) => s.stats.powerSupply > 120,
  },
  {
    id: 'strike',
    title: 'Works Strike',
    body: 'The industrial district has downed tools over conditions. Income is down while it lasts.',
    tone: 'bad',
    duration: 3,
    effect: { incomeScale: 0.72, happiness: -4 },
    weight: 2,
    when: (s) => s.stats.happiness < 48 && s.stats.jobs > 30,
  },
  {
    id: 'quiet-season',
    title: 'Quiet Season',
    body: 'Off-season. Fewer visitors, calmer streets, and a noticeably thinner ledger.',
    tone: 'neutral',
    duration: 2,
    effect: { incomeScale: 0.85, happiness: 2 },
    weight: 2,
    when: (s) => s.month > 12,
  },
  {
    id: 'clean-air-grant',
    title: 'Clean Air Grant',
    body: 'The island’s green record has attracted a grant. Everything pays a little better.',
    tone: 'good',
    duration: 4,
    effect: { incomeScale: 1.18, happiness: 4 },
    weight: 2,
    when: (s) => s.stats.pollution < 6 && s.stats.population > 80,
  },
  {
    id: 'water-scare',
    title: 'Water Scare',
    body: 'A pump has been taken offline for testing. Expect complaints and slower growth.',
    tone: 'bad',
    duration: 2,
    effect: { happiness: -6, growthScale: 0.6 },
    weight: 2,
    when: (s) => s.stats.waterDemand > s.stats.waterSupply * 0.85,
  },
];

/** Months between event rolls — long enough that an event stays an event. */
export const EVENT_INTERVAL = 6;

/**
 * Pick an event for this month, or nothing.
 *
 * Weighted among the eligible definitions, excluding anything already running so
 * a heatwave cannot stack on a heatwave.
 */
export function rollEvent(state: CityState, rng: () => number): ActiveCityEvent | null {
  const running = new Set(state.events.map((e) => e.definitionId));
  const eligible = EVENTS.filter((e) => !running.has(e.id) && e.when(state));
  if (!eligible.length) return null;

  const total = eligible.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * total;
  const picked = eligible.find((e) => (roll -= e.weight) <= 0) ?? eligible[0];

  return {
    id: `${picked.id}-${state.month}`,
    definitionId: picked.id,
    remaining: picked.duration,
    effect: picked.effect,
    title: picked.title,
    body: picked.body,
    tone: picked.tone,
  };
}

export function eventDefinitionIds(): string[] {
  return EVENTS.map((e) => e.id);
}
