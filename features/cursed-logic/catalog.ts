import type { GameInfo } from '@/lib/catalog/types';

// Stub written by the Vault migration (docs/superpowers/plans/2026-11-23-vault-games-migration.md, Task 2):
// the art is the game's old card and the ceilings are generous placeholders. The game has no score endpoint
// yet (the generic one in lib/game answers for the declared rules); its own build replaces the copy, the art
// (card, banner, logo) and the ceilings.
const entry: GameInfo = {
  id: 'cursed-logic',
  order: 133,
  title: 'Cursed Logic',
  description: 'A turn-based duel against a rogue Protocol. Read it, bluff it, outlast it.',
  longDescription:
    'The Protocol has gone unstable, and the only way to shut it down is to out-think it. Each round you pick a stance and an action while it picks its own in secret: strike, block, prepare or probe. Spend fragments in the shop between runs, survive the minigames it throws at you, and learn what its next move is before it lands.',
  href: '/cursed-logic',
  status: 'Playable',
  cta: 'Duel the Protocol',
  isSteam: false,
  gradient: 'from-cyan-400 to-amber-500',
  iconName: 'Swords',
  color: 'from-cyan-400/20 to-amber-500/20 hover:border-cyan-400/50',
  tags: ['Strategy', 'Duel', 'Mind Games'],
  imagePath: '/images/games/cursed_logic.webp',
  // Placeholders: lib/__tests__/catalog.test.ts requires a banner and a logo for every listed entry. The game's
  // own build draws real ones (1920x620 banner, transparent wordmark).
  bannerPath: '/images/games/cursed_logic.webp',
  logoPath: '/images/games/cursed_logic.webp',
  authGate: true,
  scoring: {
    maxScore: 1_000_000,
    direction: 'higher-is-better',
    progressLabel: 'Duels',
    maxProgress: 200,
  },
};

export default entry;
