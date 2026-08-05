import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'house-always-wins',
  order: 160,
  title: 'House Always Wins',
  description:
    'A dark casino metroidvania: explore the abandoned Mirage Royale, talk your way past its ghosts, unlock new moves, and outwit The House.',
  longDescription:
    'A narrative pixel-art metroidvania set inside a decaying casino. Explore six interconnected wings — Lobby, Poker Hall, Slot Vault, Security Wing, Maintenance shafts and the Vault — gating your progress behind three unlockable abilities: the Lucky Coin (double jump), the All-In Dash, and the Card Grip (wall climb). Talk to the Dealer, the old janitor Marlow, the slot-witch Vesper and Security Chief Doss, solve lever and pressure-plate puzzles, dodge spikes, lasers and camera cones, collect chips to pay down your ever-mounting Debt, recover three Vault Keys, and face The House in a multi-ending finale. Tight Celeste-style platforming, the deeper you owe the more the world distorts.',
  href: '/house-always-wins',
  cta: 'Enter the Casino',
  isSteam: false,
  gradient: 'from-amber-700 to-neutral-900',
  iconName: 'Crown',
  color: 'from-amber-700/20 to-neutral-900/40 hover:border-amber-500/50',
  tags: ['Metroidvania', 'Platformer', 'Narrative', 'Pixel Art'],
  imagePath: '/images/games/house_always_wins.webp',
  authGate: true,
};

export default entry;
