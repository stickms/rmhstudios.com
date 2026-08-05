import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'cookgame',
  order: 140,
  title: 'CookGame',
  description:
    'A satirical underground tycoon sim — buy ingredients, mix product for wild effects, and hustle your block before the heat catches up.',
  longDescription:
    'A tongue-in-cheek crime-management sim. Run a small-town operation: stock up at the supplier, experiment at the mixing bench to stack value-boosting effects onto your product, package it, and sell to the neighbourhood — all while keeping your heat meter cool. Pure fiction, all invented strains and effects.',
  href: '/cookgame',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-lime-500 to-emerald-700',
  iconName: 'FlaskConical',
  color: 'from-lime-500/20 to-emerald-700/20 hover:border-lime-500/50',
  tags: ['Simulation', 'Tycoon', 'Crime'],
  imagePath: '/images/games/cookgame.webp',
  authGate: false,
};

export default entry;
