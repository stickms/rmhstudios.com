import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhcode',
  order: 70,
  title: 'rmhcode',
  description:
    'AI-powered coding assistant. Build projects with Claude and publish to User Builds.',
  longDescription:
    'rmhcode is a CLI wrapper around Claude Code with RMH integrations. Sign in with your rmhstudios.com account, build projects with AI assistance, and publish your creations to the User Builds showcase.',
  href: '/rmhcode',
  status: 'Beta',
  cta: 'Get Started',
  isSteam: false,
  gradient: 'from-violet-500 via-purple-500 to-fuchsia-600',
  iconName: 'Terminal',
  color: 'from-violet-500/20 to-fuchsia-600/20 hover:border-violet-500/50',
  tags: ['AI', 'CLI', 'Developer Tools', 'Beta'],
  imagePath: '/images/games/rmhcode.webp',
  authGate: true,
};

export default entry;
