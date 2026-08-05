import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'versecraft',
  order: 40,
  title: 'Versecraft',
  description:
    'A visual novel that writes a brand-new emotional story every time — your cast, your bonds, your seed to share.',
  longDescription:
    'Every playthrough is generated from a seed: a unique anime cast, setting, and a multi-act, character-driven story you steer through choices and poem-writing. Prompt the kind of experience you want or roll the dice, deepen bonds with the cast, and share your seed so anyone can replay your exact version.',
  href: '/versecraft',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-amber-700 to-purple-800',
  iconName: 'Feather',
  color: 'from-amber-700/20 to-purple-800/20 hover:border-amber-500/50',
  tags: ['Visual Novel', 'AI-Generated', 'Romance', 'Poetry'],
  imagePath: '/images/games/versecraft.webp',
  authGate: false,
};

export default entry;
