import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'forest-explorer',
  order: 110,
  title: 'Forest Explorer',
  description:
    'Wander a peaceful 3D ancient forest, plant a garden that grows in real time, or play the 3-act story mode with puzzles and lore.',
  longDescription:
    "A first-person 3D forest experience with two modes. Free Explore lets you roam a dense ancient forest with towering conifers, glowing fireflies, butterflies, and dappled sunlight — and plant your own garden of five flower species that grow in real time, even while you're away. Story Mode is a 3-act narrative adventure following the trail of the forest's last Warden, featuring nine logic puzzles, environmental storytelling, letterboxed narration, and a discoverable journal system.",
  href: '/forest-explorer',
  cta: 'Explore',
  isSteam: false,
  gradient: 'from-green-700 to-emerald-900',
  iconName: 'TreePine',
  color: 'from-green-700/20 to-emerald-900/20 hover:border-green-500/50',
  tags: ['Exploration', '3D', 'Relaxing'],
  imagePath: '/images/games/forest_explorer.webp',
  authGate: false,
};

export default entry;
