import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'slice-it',
  order: 50,
  title: 'Slice It!',
  description:
    'A high-octane neon rhythm game where you slice through beats in a pulse-pounding world.',
  longDescription:
    'Test your reflexes as you slice through beat sequences and dodge obstacles in a vibrant, neon-soaked environment. Feature-rich with global leaderboards, multiplayer lobbies, and support for custom track uploads.',
  href: '/slice-it',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-(--neon-cyan) to-(--neon-blue)',
  iconName: 'Music',
  color: 'from-rose-500/20 to-purple-600/20 hover:border-rose-500/50',
  tags: ['Arcade', 'Rhythm', 'Action'],
  imagePath: '/images/games/slice_it.webp',
  authGate: true,
};

export default entry;
