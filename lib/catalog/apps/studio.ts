import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'studio',
  order: 60,
  title: 'RMH Studio',
  description:
    'Make beats in your browser. Multi-track DAW with synths, drums, effects, and samples.',
  longDescription:
    'RMH Studio is a fully-featured digital audio workstation that runs entirely in your browser. Create multi-track arrangements with built-in synths, drum machines, effects, and samples. Record audio, edit MIDI, mix, and export — no downloads required.',
  href: '/studio',
  cta: 'Open Studio',
  isSteam: false,
  gradient: 'from-cyan-500 via-blue-500 to-purple-600',
  iconName: 'AudioLines',
  color: 'from-cyan-500/20 to-purple-600/20 hover:border-cyan-500/50',
  tags: ['DAW', 'Music Production', 'Beta'],
  imagePath: '/images/games/rmhstudio.webp',
  authGate: true,
};

export default entry;
