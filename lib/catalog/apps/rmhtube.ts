import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhtube',
  order: 0,
  title: 'RMHTube',
  description: 'Watch videos together in sync. Create rooms, queue media, and chat in real-time.',
  longDescription:
    'RMHTube is a real-time watch party platform. Create a room, share the code, and watch YouTube, Twitch, or direct videos in perfect sync with friends. Queue up media, vote to skip, react live, and chat — all powered by WebSocket magic.',
  href: '/rmhtube',
  cta: 'Watch Together',
  isSteam: false,
  gradient: 'from-red-500 via-pink-500 to-purple-600',
  iconName: 'MonitorPlay',
  color: 'from-red-500/20 to-purple-600/20 hover:border-red-500/50',
  tags: ['Watch Party', 'Real-time', 'Beta'],
  imagePath: '/images/games/rmhtube.webp',
  authGate: true,
};

export default entry;
