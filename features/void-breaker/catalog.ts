import type { GameInfo } from '@/lib/catalog/types';

const entry: GameInfo =
  {
    id: 'void-breaker',
    order: 120,
    title:
      'Void Breaker',
    description:
      'An obsidian-and-gold arena shooter. Collect shards, dash, slow time, detonate.',
    longDescription:
      'Survive waves of enemies in a dark arena. Collect void shards that orbit you as a shield and score multiplier. Activate Focus for bullet-time. Dash to dodge. Detonate your shard ring for a devastating Void Burst. Boss fights every 5 waves.',
    href: '/void-breaker',
    cta: 'Play',
    isSteam: false,
    gradient:
      'from-orange-500 to-pink-600',
    iconName:
      'Crosshair',
    color:
      'from-orange-500/20 to-pink-600/20 hover:border-orange-500/50',
    tags: [
      'Arcade',
      'Shooter',
      '3D',
      'Survival',
    ],
    imagePath:
      '/images/games/voidbreaker.webp',
    bannerPath:
      '/images/games/banners/void-breaker.webp',
    logoPath:
      '/images/games/logos/void-breaker.webp',
    authGate: true,
    scoring:
      {
        maxScore: 10_000_000,
        maxScorePerSecond: 5_000,
        minDurationMs: 3_000,
        direction:
          'higher-is-better',
        progressLabel:
          'Wave',
        maxProgress: 500,
      },
  };

export default entry;
