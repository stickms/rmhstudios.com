import type { GameInfo } from '@/lib/catalog/types';

// Stub written by the Vault migration (docs/superpowers/plans/2026-11-23-vault-games-migration.md, Task 2):
// the art is the game's old card and the ceilings are generous placeholders. The game's own build replaces
// the copy, the art (card, banner, logo) and the scoring ceilings.
const entry: GameInfo = {
  id: 'vega',
  order: 131,
  title: 'Project Vega',
  description: 'A clinical-horror tower defense. Hold the lab against a recursion that will not stop.',
  longDescription:
    'The Recursion Defense System is the last thing standing between the specimen and the rest of the facility. Build towers along the corridor, hold each wave, and watch what the scan turns up in the next one. Every loop the defense survives makes the next one worse.',
  href: '/vega',
  status: 'Playable',
  cta: 'Begin the Scan',
  isSteam: false,
  gradient: 'from-green-500 to-emerald-700',
  iconName: 'BrainCircuit',
  color: 'from-green-500/20 to-emerald-700/20 hover:border-green-500/50',
  tags: ['Strategy', 'Tower Defense', 'Horror'],
  imagePath: '/images/games/project_vega.webp',
  // Placeholders: lib/__tests__/catalog.test.ts requires a banner and a logo for every listed entry. The game's
  // own build draws real ones (1920x620 banner, transparent wordmark).
  bannerPath: '/images/games/project_vega.webp',
  logoPath: '/images/games/project_vega.webp',
  authGate: true,
  scoring: {
    maxScore: 5_000_000,
    direction: 'higher-is-better',
    progressLabel: 'Wave',
    maxProgress: 500,
  },
};

export default entry;
