import type { GameInfo } from '@/lib/catalog/types';

const entry: GameInfo = {
  id: 'synapse-storm',
  order: 70,
  title: 'Synapse Storm',
  description: 'Juggle a storm of micro-challenges. Stay sharp.',
  longDescription:
    'Juggle a storm of micro-challenges. Stay sharp. See how long your mind can keep up before the load becomes too great.',
  href: '/synapse-storm',
  cta: 'Enter the Storm',
  isSteam: false,
  gradient: 'from-cyan-500 to-pink-500',
  iconName: 'Zap',
  color: 'from-cyan-500/20 to-pink-500/20 hover:border-cyan-500/50',
  tags: ['Action', 'Puzzle', 'Fast-paced'],
  imagePath: '/images/games/synapsestorm.webp',
  bannerPath: '/images/games/banners/synapse-storm.webp',
  logoPath: '/images/games/logos/synapse-storm.webp',
  authGate: true,
  scoring: {
    maxScore: 5_000_000,
    maxScorePerSecond: 3_000,
    minDurationMs: 3_000,
    direction: 'higher-is-better',
    progressLabel: 'Combo',
    maxProgress: 10_000,
  },
};

export default entry;
