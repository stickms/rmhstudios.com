import type { GameInfo } from '@/lib/catalog/types';

// Signal Forge's library card (the Vault migration, docs/superpowers/plans/2026-11-23-vault-games-migration.md, Task 4).
// Art: scripts/game-art/signal-forge.mjs. Scoring: the ceiling is engine/balance.ts `maxPossibleScore()` (80,750 at
// Ascension 10) rounded up; engine/__tests__/balance.test.ts holds that the ceiling covers it.
const entry: GameInfo = {
  id: 'signal-forge',
  order: 132,
  title: 'Signal Forge',
  description: 'A rhythmic roguelike deckbuilder. Land your cards on the phrase, bank the heat, fire the Forge Burst.',
  longDescription:
    'Climb three acts of a living forge with a deck of waveform cards. Every turn the signal plays a short phrase: cards that land on it hit harder and build Heat, and finishing the phrase fires a Forge Burst at everything in the room. Bank Heat for a bigger Burst or vent it for Block. Play to a beat in Timed mode, or take your time in Steady mode. Over a hundred cards, elites and two bosses per act, relics, events, ten Ascension levels, achievements and a leaderboard.',
  href: '/signal-forge',
  status: 'Playable',
  cta: 'Enter the Forge',
  isSteam: false,
  gradient: 'from-orange-400 to-cyan-400',
  iconName: 'AudioWaveform',
  color: 'from-orange-400/20 to-cyan-400/20 hover:border-orange-400/50',
  tags: ['Roguelike', 'Deckbuilder', 'Rhythm', 'Strategy'],
  imagePath: '/images/games/signal-forge.webp',
  bannerPath: '/images/games/banners/signal-forge.webp',
  logoPath: '/images/games/logos/signal-forge.webp',
  authGate: true,
  scoring: {
    maxScore: 100_000,
    // A full Ascension 10 run takes well over eight minutes; 1,000 a second is far above any honest pace.
    maxScorePerSecond: 1_000,
    minDurationMs: 3_000,
    direction: 'higher-is-better',
    progressLabel: 'Floor',
    // Three acts of eight nodes. Pre-rework rows (endless floors) keep their stored value; this bounds new runs.
    maxProgress: 24,
  },
};

export default entry;
