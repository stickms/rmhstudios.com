import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'laundry-sort',
  order: 100,
  title: 'Laundry Sort',
  description:
    'A soft-body cloth physics race — grab real simulated garments out of the air and sort them by wash.',
  longDescription:
    'Every garment is actual cloth: a mass of particles solved with position-based dynamics, so a shirt drapes over a bin rim, a towel planes as it falls, and a sock you flick across the room tumbles like one. Play solo against the clock or race up to seven other people on the same seeded laundry, with a locked 16:9 frame so nobody gets a wider view than anyone else.',
  href: '/laundry-sort',
  status: 'Playable',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-[#ff6b6b] to-[#ee5a6f]',
  iconName: 'Zap',
  color: 'from-yellow-500/20 to-orange-600/20 hover:border-yellow-500/50',
  tags: ['Multiplayer', 'Physics', '3D'],
  imagePath: '/images/games/laundry_sort.webp',
  authGate: true,
};

export default entry;
