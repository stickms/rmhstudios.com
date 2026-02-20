import type { SynergyDef } from '@/lib/temple-of-joy/types';

export const SYNERGIES: SynergyDef[] = [
  {
    id: 'drowsyEconomy',
    name: 'The Drowsy Economy',
    flavor: 'Rest and snacks. The foundation of civilization.',
    requirements: { napPod: 10, snackBar: 10 },
    targetBuildings: ['napPod', 'snackBar'],
    multiplier: 4,
  },
  {
    id: 'hedonistRoutine',
    name: "Hedonist's Routine",
    flavor: 'Morning candle. Evening massage. Perfect day.',
    requirements: { moodCandle: 25, massageStudio: 25 },
    targetBuildings: ['moodCandle', 'massageStudio'],
    multiplier: 6,
  },
  {
    id: 'cultCuisine',
    name: 'Cult Cuisine',
    flavor: 'The congregation eats together. Transcendence is served warm.',
    requirements: { joyCult: 50, feastHall: 30 },
    targetBuildings: ['joyCult', 'feastHall'],
    multiplier: 5,
  },
  {
    id: 'blissPipeline',
    name: 'The Bliss Pipeline',
    flavor: 'Chemical and architectural happiness, unified.',
    requirements: { dopamineLab: 100, spaSanctum: 50 },
    targetBuildings: ['dopamineLab', 'spaSanctum'],
    multiplier: 8,
  },
  {
    id: 'philosophersSpa',
    name: "The Philosopher's Spa",
    flavor: "Inner peace, outer peace. You've both.",
    requirements: { therapy: 75, hedonistMonastery: 75 },
    targetBuildings: ['therapy', 'hedonistMonastery'],
    multiplier: 10,
  },
  {
    id: 'edensArchitecture',
    name: "Eden's Architecture",
    flavor: 'Two interpretations of paradise. Merged.',
    requirements: { pleasurePalace: 100, heavenOnEarth: 50 },
    targetBuildings: ['pleasurePalace', 'heavenOnEarth'],
    multiplier: 12,
  },
  {
    id: 'eternalFeast',
    name: 'The Eternal Feast',
    flavor: 'The table is infinite. The music never stops.',
    requirements: { feastHall: 150, eternalParty: 100 },
    targetBuildings: ['feastHall', 'eternalParty'],
    multiplier: 15,
  },
];

export const SYNERGY_MAP: Record<string, SynergyDef> = Object.fromEntries(
  SYNERGIES.map((s) => [s.id, s]),
);
