import type { GameInfo } from '@/lib/catalog/types';

// Stub written by the Vault migration (docs/superpowers/plans/2026-11-23-vault-games-migration.md, Task 2):
// the art is the game's old card; the scoring rule is the one this game already had in lib/game/registry.ts.
// The game's own build replaces the copy and the art (card, banner, logo).
const entry: GameInfo = {
  id: 'signal-forge',
  order: 132,
  title: 'Signal Forge',
  description: 'A rhythmic roguelike deckbuilder. Build a deck, ride the signal, climb the forge.',
  longDescription:
    'Climb floor after floor of the Forge with a deck you build as you go. Every card is played on the beat of the signal, so the best hand is the one you can land in time. Pick up relics, face elites and bosses, and bank a score and a place on the leaderboard when the run ends.',
  href: '/signal-forge',
  status: 'Playable',
  cta: 'Enter the Forge',
  isSteam: false,
  gradient: 'from-cyan-400 to-fuchsia-500',
  iconName: 'Zap',
  color: 'from-cyan-400/20 to-fuchsia-500/20 hover:border-cyan-400/50',
  tags: ['Roguelike', 'Deckbuilder', 'Rhythm'],
  imagePath: '/images/games/signal_forge.webp',
  // Placeholders: lib/__tests__/catalog.test.ts requires a banner and a logo for every listed entry. The game's
  // own build draws real ones (1920x620 banner, transparent wordmark).
  bannerPath: '/images/games/signal_forge.webp',
  logoPath: '/images/games/signal_forge.webp',
  authGate: true,
  scoring: {
    maxScore: 5_000_000,
    maxScorePerSecond: 3_000,
    minDurationMs: 3_000,
    direction: 'higher-is-better',
    progressLabel: 'Floor',
    maxProgress: 500,
  },
};

export default entry;
