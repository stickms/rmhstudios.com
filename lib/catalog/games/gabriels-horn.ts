import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'gabriels-horn',
  order: 190,
  title: "Gabriel's Horn",
  description:
    'A bluffing card game where you are the one person who cannot see your own dice. Ask the table, decide who is lying, and end holding the fewest cards.',
  longDescription:
    'Three dice are rolled at the start of your turn and everyone at the table can see them except you. They each tell you a total — truthfully or not — and you pick one of them and call it: truth, or lie. Get it right and they draw three cards; get it wrong and you do. Cards are the currency of failure, so playing one costs you a card too: four colours of effect (see your own dice, force a draw, ward yourself, look at a hand) and one rank that matters, the seven, which trades your whole hand with anyone you like. When you think you are lowest you sound the horn — but everyone else gets one last turn to fix their hand, or to take yours, and if you were not strictly lowest when the counting stops the call drops you to last. 2–6 players, real-time, with table talk.',
  href: '/gabriels-horn',
  status: 'Playable',
  cta: 'Take a Seat',
  isSteam: false,
  gradient: 'from-amber-400 to-purple-700',
  iconName: 'Dices',
  color: 'from-amber-400/20 to-purple-700/20 hover:border-amber-400/50',
  tags: ['Multiplayer', 'Card Game', 'Bluffing', 'Party'],
  authGate: true,
};

export default entry;
