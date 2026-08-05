import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmh-strategies',
  order: 80,
  title: 'RMH Strategies',
  description:
    'The coalition command center. Daily puzzles, tiered safehouse, reputation system, and Sahur Mode.',
  longDescription:
    'RMH Strategies is the unified platform layer for the RMH ecosystem. Earn XP across all RMH products with a single reputation system, compete on daily puzzle leaderboards across five modes (Alibi, Spectrum, Outcast, Chainlink, Impostor), access tiered Safehouse intelligence, track public incidents as entertainment, and unlock Sahur Mode — a chaotic 3 AM experience with triple XP and a bat cursor.',
  href: '/strategies',
  imagePath: '/images/games/rmhstrategies.webp',
  status: 'Beta',
  cta: 'Enter the Coalition',
  isSteam: false,
  gradient: 'from-orange-500 via-amber-500 to-red-600',
  iconName: 'Shield',
  color: 'from-orange-500/20 to-red-600/20 hover:border-orange-500/50',
  tags: ['Puzzles', 'Community', 'Reputation', 'Beta'],
  authGate: true,
};

export default entry;
