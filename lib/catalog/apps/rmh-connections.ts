import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmh-connections',
  order: 20,
  title: 'RMHConnections',
  description: 'A daily puzzle game about finding common threads in RMH lore.',
  longDescription:
    'Group sixteen community-themed items into four categories. A daily test of your RMH knowledge, featuring characters, memes, and historical events from across the community.',
  href: 'https://discord.gg/ZdfhdAKVSf',
  status: 'Discord Game',
  cta: 'Play on Discord',
  isSteam: false,
  gradient: 'from-[#7289da] to-[#5865F2]',
  iconName: 'Rocket',
  color: 'from-violet-500/20 to-purple-600/20 hover:border-violet-500/50',
  tags: ['Discord', 'Puzzle', 'Daily'],
  imagePath: '/images/games/rmhconnections.webp',
  authGate: false,
  hidden: true,
};

export default entry;
