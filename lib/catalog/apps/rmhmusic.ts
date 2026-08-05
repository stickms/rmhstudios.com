import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhmusic',
  order: 40,
  title: 'RMHMusic',
  description:
    'Listen to Spotify together. Create rooms, share queues, vibe with friends, and play Guess the Song.',
  longDescription:
    'RMHMusic is a social music player powered by Spotify. Connect your Premium account, create a listening room, and enjoy synced playback with friends. Features a mesmerizing WebGL particle visualizer, shared queues, real-time chat, and Guess the Song — create and solve music puzzles for coins.',
  href: '/rmhmusic',
  status: 'Beta',
  cta: 'Listen Together',
  isSteam: false,
  gradient: 'from-purple-500 via-violet-500 to-indigo-600',
  iconName: 'Music',
  color: 'from-purple-500/20 to-indigo-600/20 hover:border-purple-500/50',
  tags: ['Music', 'Spotify', 'Real-time', 'Beta'],
  imagePath: '/images/games/rmhmusic.webp',
  authGate: true,
};

export default entry;
