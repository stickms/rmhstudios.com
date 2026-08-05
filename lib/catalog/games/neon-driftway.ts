import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'neon-driftway',
  order: 90,
  title: 'Neon Driftway',
  description:
    'A first-person 3D highway racer you steer from the driver’s seat, with gyro head look on phones.',
  longDescription:
    'Drive from inside the cockpit across three levels: Sunset Freeway, Rainline, and Night Circuit. On a phone the gyroscope moves the camera in real time, so you can glance into a bend or check the lane beside you while you drive — and there is a side-by-side mode for a Cardboard-style viewer. Without a motion sensor the camera stays locked forward and the game plays exactly the same. Rack up multipliers with daring close calls, manage grip in the rain, and dodge aggressive traffic.',
  href: '/neon-driftway',
  status: 'Playable Demo',
  cta: 'Play Now',
  isSteam: false,
  gradient: 'from-red-600 to-cyan-600',
  iconName: 'Zap',
  color: 'from-red-500/20 to-cyan-600/20 hover:border-red-500/50',
  tags: ['Arcade', 'Racing', '3D', 'VR'],
  imagePath: '/images/games/neon_driftway.webp',
  authGate: true,
};

export default entry;
