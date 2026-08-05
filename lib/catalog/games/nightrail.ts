import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'nightrail',
  order: 200,
  title: 'Nightrail',
  description:
    'An on-rails trick racer. Your courier train never stops accelerating — drift the bends, land the tricks, deliver the cargo.',
  longDescription:
    'You run night freight on a self-propelling courier train, and it will not slow down for you. Every bend scrubs speed off the railhead unless you drift it, so the game is less about going faster than about refusing to give back what you already have. Switch between parallel rails to thread barriers, oncoming freight and holes in the deck; charge a jump to clear the gaps, and spend the airtime flicking through eight tricks — but land with the rotation unfinished and the combo you were protecting is gone. Grind the edge rails to glue combos together, bank them at checkpoints, and get your crates to the end of five runs: the harbor at dusk, a neon ward, a viaduct in the rain, the tunnels under the city, and a skybridge above the clouds.',
  href: '/nightrail',
  status: 'Playable',
  cta: 'Take the Throttle',
  isSteam: false,
  gradient: 'from-fuchsia-500 to-amber-400',
  iconName: 'TrainFront',
  color: 'from-fuchsia-500/20 to-amber-400/20 hover:border-fuchsia-500/50',
  tags: ['Arcade', 'Racing', '3D', 'Trick Scoring'],
  imagePath: '/images/games/nightrail.webp',
  authGate: true,
};

export default entry;
