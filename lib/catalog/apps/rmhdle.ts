import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhdle',
  order: 10,
  title: 'RMHdle',
  description: 'The official daily word challenge for the RMH community.',
  longDescription:
    'A daily 5-letter word game tailored for the RMH ecosystem. Join the community on Discord to share your streaks, compete with others, and guess secret terms from RMH history.',
  href: 'https://discord.gg/ZdfhdAKVSf',
  status: 'Discord Game',
  cta: 'Play on Discord',
  isSteam: false,
  gradient: 'from-[#5865F2] to-[#404EED]',
  iconName: 'Brain',
  color: 'from-indigo-500/20 to-blue-600/20 hover:border-indigo-500/50',
  tags: ['Discord', 'Word Game', 'Daily'],
  imagePath: '/images/games/rmhdle.webp',
  authGate: false,
  hidden: true,
};

export default entry;
