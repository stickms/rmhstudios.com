import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'rmhbox',
  order: 10,
  title: 'RMHbox',
  description: 'Party game madness! Join a lobby and play 16+ minigames with friends.',
  longDescription:
    'Create or join a lobby, vote on minigames, and compete with friends in real-time. Features 16+ unique minigames across word, trivia, action, and creative categories with live leaderboards and match history.',
  href: '/rmhbox',
  status: 'Playable',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-purple-500 to-pink-500',
  iconName: 'Gamepad2',
  color: 'from-purple-500/20 to-pink-500/20 hover:border-purple-500/50',
  tags: ['Multiplayer', 'Party', 'Minigames'],
  imagePath: '/images/games/rmhbox.webp',
  authGate: true,
};

export default entry;
