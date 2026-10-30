import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'portal',
  order: 240,
  title: 'Portal',
  description:
    'Portal’s first test chambers, in your browser. Place linked portals and walk through them.',
  longDescription:
    'The First Slice of Portal — test chambers 00 to 10 — on an independent browser engine. Fire the blue and orange portals onto walls and floors, look and walk through them (momentum is conserved), carry cubes onto buttons and dodge energy balls. Portals render the view through them, one level deep on phones and two on a desktop. Continue resumes from the last chamber you reached. Keyboard and mouse, gamepad or touch.',
  href: '/portal',
  status: 'Beta',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-sky-500 to-orange-500',
  iconName: 'CircleDot',
  color: 'from-sky-500/20 to-orange-500/20 hover:border-sky-500/50',
  tags: ['Valve', 'FPS', 'Single-player', 'Beta'],
  authGate: false,
};

export default entry;
