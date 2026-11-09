import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhmusic',
  order: 40,
  title: 'RMHMusic',
  description:
    'Learn piano and guitar with your microphone or a MIDI keyboard.',
  longDescription:
    'RMHMusic is a beginner-friendly app for learning piano and guitar. Pick your instrument, connect a microphone or MIDI keyboard (or use the on-screen keys), calibrate its delay and start with a first note lesson, with your progress saved to your account. It is a Beta: reading notes on a staff, pitch and chord ear training, rhythm and time signatures, a tuner and play-along with sheet music are being added in stages.',
  href: '/rmhmusic',
  status: 'Beta',
  cta: 'Start Learning',
  isSteam: false,
  gradient: 'from-purple-500 via-violet-500 to-indigo-600',
  iconName: 'Music',
  color: 'from-purple-500/20 to-indigo-600/20 hover:border-purple-500/50',
  tags: ['Music', 'Learning', 'Piano', 'Guitar', 'Beta'],
  imagePath: '/images/games/rmhmusic.webp',
  bannerPath: '/images/games/banners/rmhmusic.webp',
  logoPath: '/images/games/logos/rmhmusic.webp',
  ogImagePath: '/images/og/rmhmusic.png',
  ogImageAlt:
    'Hand-ruled manuscript paper with the RMH Music wordmark above the first bars of Ode to Joy, written on a staff with guitar tab beneath.',
  authGate: true,
};

export default entry;
