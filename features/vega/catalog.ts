import type { GameInfo } from '@/lib/catalog/types';

const entry: GameInfo = {
  id: 'vega',
  order: 131,
  title: 'Project Vega',
  description: 'A clinical-horror tower defense. Hold the corridor against the specimens, wave by wave, to containment.',
  longDescription:
    'Specimens crawl a corridor of tissue toward the containment door. Between waves the board waits while you place and upgrade eight instruments, from the Synapse and the Suppressor to the Lobotomizer and the Biobank, each with three tiers. Every wave brings a mix of specimens that armour, cloak, shield, regenerate, split and heal, and every fifth wave a boss. Three wards to hold, a score built from waves cleared, clean holds and early calls, and an overtime that runs to wave 100 for the ones who reach containment.',
  href: '/vega',
  status: 'Playable',
  cta: 'Begin intake',
  isSteam: false,
  gradient: 'from-green-500 to-emerald-700',
  iconName: 'BrainCircuit',
  color: 'from-green-500/20 to-emerald-700/20 hover:border-green-500/50',
  tags: ['Strategy', 'Tower Defense', 'Horror', 'Single-player'],
  imagePath: '/images/games/vega.webp',
  bannerPath: '/images/games/banners/vega.webp',
  logoPath: '/images/games/logos/vega.webp',
  authGate: true,
  // Ceilings derived from the score formula (features/vega/engine/scoring.ts) and checked by
  // features/vega/engine/__tests__/balance.test.ts: a perfect, all-early run to the wave cap of 100 on the
  // Surgical Theatre is 462,000; the fastest possible run scores under 300 per second of wall time at 2x.
  scoring: {
    maxScore: 470_000,
    maxScorePerSecond: 400,
    minDurationMs: 3_000,
    direction: 'higher-is-better',
    progressLabel: 'Wave',
    maxProgress: 100,
  },
};

export default entry;
