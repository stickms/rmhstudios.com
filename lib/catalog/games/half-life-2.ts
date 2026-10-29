import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'half-life-2',
  order: 230,
  title: 'Half-Life 2 (Demo)',
  description:
    'The opening of Half-Life 2, Point Insertion, on a clean-room browser engine.',
  longDescription:
    'Step off the train into City 17. The Half-Life 2 demo’s two Point Insertion maps run on an independent browser engine: Source-accurate movement, rigid-body physics you can pick up and throw, scripted sequences, doors and lifts, soundscapes and closed captions. Your progress is saved at each level start, so Continue picks up where you left off. Keyboard and mouse, gamepad or touch.',
  href: '/half-life-2',
  status: 'Beta',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-orange-500 to-stone-800',
  iconName: 'Atom',
  color: 'from-orange-500/20 to-stone-800/20 hover:border-orange-500/50',
  tags: ['Valve', 'FPS', 'Single-player', 'Beta'],
  authGate: false,
};

export default entry;
