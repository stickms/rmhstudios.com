import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'daily-puzzles',
  order: 30,
  title: 'Daily Puzzles',
  description:
    'Six daily brain games: Lights Out, Alibi, Spectrum, Outcast, Chainlink, and Impostor. New puzzles every day at midnight EST.',
  longDescription:
    'A suite of six daily brain games. Toggle lights in Lights Out, solve crime scenarios in Alibi, rank items in Spectrum, spot the odd one out in Outcast, build word chains in Chainlink, and detect lies in Impostor. Share your results with friends and compete for the best scores.',
  href: '/daily',
  cta: "Play Today's Puzzles",
  isSteam: false,
  gradient: 'from-violet-500 to-pink-500',
  iconName: 'Puzzle',
  color: 'from-violet-500/20 to-pink-500/20 hover:border-violet-500/50',
  tags: ['Puzzle', 'Daily', 'Brain Games'],
  imagePath: '/images/games/daily_puzzles.webp',
  authGate: false,
};

export default entry;
