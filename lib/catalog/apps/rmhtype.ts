import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhtype',
  order: 30,
  title: 'RMH Type',
  description: 'Test your typing speed solo or race against friends in real-time multiplayer.',
  longDescription:
    'RMH Type is a competitive typing platform. Practice solo to improve your WPM, or create a room to race friends on the same passage simultaneously. Track your progress on the global leaderboard and climb the ranks.',
  href: '/rmhtype',
  cta: 'Start Typing',
  isSteam: false,
  gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
  iconName: 'Keyboard',
  color: 'from-emerald-500/20 to-cyan-600/20 hover:border-emerald-500/50',
  tags: ['Typing', 'Multiplayer', 'Competitive', 'Beta'],
  imagePath: '/images/games/rmhtype.webp',
  authGate: true,
};

export default entry;
