import type { SynergyDef } from '@/lib/temple-of-joy/types';

export const SYNERGIES: SynergyDef[] = [
  {
    id: 'drowsyEconomy',
    name: 'The Drowsy Economy',
    flavor: 'Rest and snacks. The foundation of civilization.',
    requirements: { napPod: 10, snackBar: 10 },
    targetBuildings: ['napPod', 'snackBar'],
    multiplier: 2,
  },
  {
    id: 'hedonistRoutine',
    name: "Hedonist's Routine",
    flavor: 'Morning candle. Evening massage. Perfect day.',
    requirements: { moodCandle: 25, massageStudio: 25 },
    targetBuildings: ['moodCandle', 'massageStudio'],
    multiplier: 3,
  },
  {
    id: 'cultCuisine',
    name: 'Cult Cuisine',
    flavor: 'The congregation eats together. Transcendence is served warm.',
    requirements: { joyCult: 50, feastHall: 30 },
    targetBuildings: ['joyCult', 'feastHall'],
    multiplier: 2.5,
  },
  {
    id: 'blissPipeline',
    name: 'The Bliss Pipeline',
    flavor: 'Chemical and architectural happiness, unified.',
    requirements: { dopamineLab: 100, spaSanctum: 50 },
    targetBuildings: ['dopamineLab', 'spaSanctum'],
    multiplier: 4,
  },
  {
    id: 'philosophersSpa',
    name: "The Philosopher's Spa",
    flavor: "Inner peace, outer peace. You've both.",
    requirements: { therapy: 75, hedonistMonastery: 75 },
    targetBuildings: ['therapy', 'hedonistMonastery'],
    multiplier: 5,
  },
  {
    id: 'edensArchitecture',
    name: "Eden's Architecture",
    flavor: 'Two interpretations of paradise. Merged.',
    requirements: { pleasurePalace: 100, heavenOnEarth: 50 },
    targetBuildings: ['pleasurePalace', 'heavenOnEarth'],
    multiplier: 6,
  },
  {
    id: 'eternalFeast',
    name: 'The Eternal Feast',
    flavor: 'The table is infinite. The music never stops.',
    requirements: { feastHall: 150, eternalParty: 100 },
    targetBuildings: ['feastHall', 'eternalParty'],
    multiplier: 8,
  },
  // ── Post-Prestige Synergies ──
  {
    id: 'zenSerenity',
    name: 'Zen Serenity Circuit',
    flavor: 'The garden feeds the engine. The engine powers the garden.',
    requirements: { zenGarden: 50, serenityEngine: 25 },
    targetBuildings: ['zenGarden', 'serenityEngine'],
    multiplier: 4,
  },
  {
    id: 'cosmicRapture',
    name: 'Cosmic Rapture',
    flavor: 'The cathedral floats in the jacuzzi. Architecture was never this wet.',
    requirements: { raptureCathedral: 50, cosmicJacuzzi: 25 },
    targetBuildings: ['raptureCathedral', 'cosmicJacuzzi'],
    multiplier: 6,
  },
  {
    id: 'omniscientEuphoria',
    name: 'Omniscient Euphoria',
    flavor: 'The spa knows everything. The springs feel everything. Together: everything.',
    requirements: { omniscientSpa: 25, euphoriaSprings: 50 },
    targetBuildings: ['omniscientSpa', 'euphoriaSprings'],
    multiplier: 8,
  },
];

export const SYNERGY_MAP: Record<string, SynergyDef> = Object.fromEntries(
  SYNERGIES.map((s) => [s.id, s]),
);
