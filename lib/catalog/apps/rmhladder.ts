import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhladder',
  order: 90,
  title: 'RMH Ladder',
  description:
    'Discover verified internships, new-grad programs, and early-career roles from official company sources.',
  longDescription:
    'RMH Ladder automatically checks official company job boards every four hours, filters for verified early-career opportunities, and helps you save roles, track applications, and compare your resume with the jobs that fit.',
  href: '/rmhladder',
  status: 'Beta',
  cta: 'Browse Jobs',
  isSteam: false,
  gradient: 'from-violet-500 via-purple-500 to-indigo-600',
  iconName: 'BriefcaseBusiness',
  color: 'from-violet-500/20 to-indigo-600/20 hover:border-violet-500/50',
  tags: ['Careers', 'Jobs', 'Early Career', 'AI', 'Beta'],
  authGate: false,
  usesSiteTheme: true,
};

export default entry;
