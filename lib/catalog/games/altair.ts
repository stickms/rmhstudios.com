import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'altair',
  order: 20,
  title: 'Altair',
  description: 'A narrative-driven extraction thriller set on a fragmented deep space mining rig.',
  longDescription:
    'Navigate Outpost 13, a reality-glitched mining station overrun by "Echoes." Use your neural link to piece together fragmented memories, manage cryo-sickness, and survive the shadows in this narrative-heavy survival experience.',
  href: '/altair',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-(--neon-purple) to-(--neon-pink)',
  iconName: 'Brain',
  color: 'from-cyan-500/20 to-blue-600/20 hover:border-cyan-500/50',
  tags: ['Deckbuilder', 'Roguelike', 'Strategy'],
  imagePath: '/images/games/altair.webp',
  authGate: true,
};

export default entry;
