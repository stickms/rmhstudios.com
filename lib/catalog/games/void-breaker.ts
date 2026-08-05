import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'void-breaker',
  order: 120,
  title: 'Void Breaker',
  description:
    'Obsidian and gold arena shooter. Collect void shards, dash, slow time with Focus, detonate when overwhelmed.',
  longDescription:
    'Survive waves of enemies in a dark arena. Collect void shards that orbit you as a shield and score multiplier. Activate Focus for bullet-time. Dash to dodge. Detonate your shard ring for a devastating Void Burst. Boss fights every 5 waves.',
  href: '/void-breaker',
  cta: 'Play',
  isSteam: false,
  gradient: 'from-orange-500 to-pink-600',
  iconName: 'Crosshair',
  color: 'from-orange-500/20 to-pink-600/20 hover:border-orange-500/50',
  tags: ['Arcade', 'Shooter', '3D', 'Survival'],
  imagePath: '/images/games/voidbreaker.webp',
  authGate: true,
};

export default entry;
