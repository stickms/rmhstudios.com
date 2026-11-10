import type { GameInfo } from '@/lib/catalog/types';

const entry: GameInfo = {
  id: 'hearthworks',
  order: 5,
  title: 'Hearthworks',
  description:
    'Build a cozy town, farm and forage, cook and sell — in one world you plan from above.',
  longDescription:
    'Found a town on a floating island. Lay roads, raise cottages and market stalls, plant and harvest crops, cook what you grow and sell it to your neighbours. Everything lives in one world: plan it from an isometric bird’s-eye view, and soon walk it on foot, build machines to automate the work, hire helpers, and play with friends.',
  href: '/hearthworks',
  status: 'Early access',
  cta: 'Start Building',
  isSteam: false,
  gradient: 'from-sky-300 to-teal-300',
  iconName: 'House',
  color: 'from-sky-300/20 to-teal-300/20 hover:border-teal-300/50',
  tags: ['City Builder', 'Farming', 'Cooking', 'Relaxing'],
  imagePath: '/images/games/hearthworks.webp',
  bannerPath: '/images/games/banners/hearthworks.webp',
  logoPath: '/images/games/logos/hearthworks.webp',
  authGate: false,
};

export default entry;
