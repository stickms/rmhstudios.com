import type { GameInfo } from '@/lib/catalog/types';

/**
 * Cursed Logic's card. Art: scripts/game-art/cursed-logic.mjs (card, banner, logo, icon). Scoring: the ceiling is
 * `MAX_RUN_SCORE` in features/cursed-logic/engine/score.ts (every duel flawless at the Integrity ceiling in one
 * round, all four pacts: 138,364) rounded up; progress is duels won, nine at most. The score route also checks a
 * run's score against the duels and pacts it claims (`claimProblem`).
 */
const entry: GameInfo = {
  id: 'cursed-logic',
  order: 133,
  title: 'Cursed Logic',
  description: 'A mind-game duel against rogue Protocols that lie. Read their tells, climb nine duels, reach the root.',
  longDescription:
    'Something has got into the terminal. Seven rogue Protocols stand between you and NULL//ROOT, each with its own habits: the Warden blocks, the Mimic copies you, the Liar’s tells point the wrong way, the Oracle counters whatever you do most. Each round you pick one of three stances and a command (Strike, Block, Prepare or Probe) while the Protocol commits in secret and shows a tell that may be a bluff. A run is nine duels across five sectors with your Integrity carried between them, a free script and a black market after each sector, round mutations, clash minigames and optional Pacts that raise your score. Starts with a short training duel.',
  href: '/cursed-logic',
  status: 'Playable',
  cta: 'Duel the Protocol',
  isSteam: false,
  gradient: 'from-lime-400 to-violet-500',
  iconName: 'Swords',
  color: 'from-lime-400/20 to-violet-500/20 hover:border-lime-400/50',
  tags: ['Strategy', 'Duel', 'Roguelite', 'Mind Games'],
  imagePath: '/images/games/cursed-logic.webp',
  bannerPath: '/images/games/banners/cursed-logic.webp',
  logoPath: '/images/games/logos/cursed-logic.webp',
  authGate: true,
  scoring: {
    maxScore: 150_000,
    direction: 'higher-is-better',
    progressLabel: 'Duels',
    maxProgress: 9,
  },
};

export default entry;
