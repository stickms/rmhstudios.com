import type { AppInfo } from '@/lib/catalog/types';

const entry: AppInfo = {
  id: 'rmhos',
  order: 130,
  title: 'rmhOS',
  description: 'A Linux desktop in your browser tab, signed in as you.',
  longDescription:
    'rmhOS boots a real Linux desktop inside your browser tab with an x86 emulator. It starts from a saved snapshot, so the desktop is ready in seconds, and it is signed in as your own account.',
  href: '/rmhos',
  cta: 'Open Desktop',
  status: 'Coming soon',
  isSteam: false,
  gradient: 'from-slate-500 via-zinc-600 to-neutral-700',
  iconName: 'Monitor',
  color: 'from-slate-500/20 to-neutral-700/20 hover:border-slate-500/50',
  tags: ['linux', 'desktop', 'terminal'],
  imagePath: '/images/games/rmhos.webp',
  bannerPath: '/images/games/banners/rmhos.webp',
  logoPath: '/images/games/logos/rmhos.webp',
  authGate: true,
};

export default entry;
