import { Link, useRouterState } from '@tanstack/react-router';
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  FileText,
  Gauge,
  GitPullRequestArrow,
  LayoutDashboard,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
};

const PUBLIC_NAV: NavItem[] = [
  { label: 'Overview', to: '/rmhladder', icon: LayoutDashboard },
  { label: 'Jobs', to: '/rmhladder/jobs', icon: BriefcaseBusiness },
];

const PERSONAL_NAV: NavItem[] = [
  { label: 'Resume', to: '/rmhladder/resume', icon: FileText },
  { label: 'Pipeline', to: '/rmhladder/pipeline', icon: GitPullRequestArrow },
  { label: 'Alerts', to: '/rmhladder/alerts', icon: Bell },
  { label: 'Settings', to: '/rmhladder/settings', icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Review', to: '/rmhladder/review', icon: ShieldCheck },
  { label: 'Companies', to: '/rmhladder/companies', icon: Building2 },
  { label: 'Health', to: '/rmhladder/health', icon: Gauge },
];

function pageTitle(pathname: string) {
  if (/^\/rmhladder\/jobs\/.+/.test(pathname)) return 'Job details';
  const item = [...PUBLIC_NAV, ...PERSONAL_NAV, ...ADMIN_NAV]
    .find(({ to }) => to !== '/rmhladder' && pathname.startsWith(to));
  return item?.label ?? 'RMH Ladder';
}

export default function RmhLadderShell({
  children,
  isAuthenticated,
  isAdmin,
}: {
  children: React.ReactNode;
  isAuthenticated: boolean;
  isAdmin: boolean;
}) {
  const { t } = useTranslation('site');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navItems = [
    ...PUBLIC_NAV,
    ...(isAuthenticated ? PERSONAL_NAV : []),
    ...(isAdmin ? ADMIN_NAV : []),
  ];

  function isActive(to: string) {
    if (to === '/rmhladder') return pathname === '/rmhladder' || pathname === '/rmhladder/';
    return pathname.startsWith(to);
  }

  return (
    <PageLayout title={pageTitle(pathname)} wide>
      <div className="rmhladder min-w-0 px-3 pb-24 pt-3 sm:px-4 sm:pt-4 md:pb-12">
        <div className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-site-border pb-3" aria-label={t('ladder.navigation', { defaultValue: 'RMH Ladder navigation' })}>
          {navItems.map(({ label, to, icon: Icon }) => (
            <Button
              key={to}
              asChild
              size="sm"
              variant={isActive(to) ? 'accent' : 'ghost'}
              className="min-h-11 shrink-0"
            >
              <Link to={to} aria-current={isActive(to) ? 'page' : undefined}>
                <Icon className="size-4" aria-hidden />
                {t(`ladder.nav.${label.toLowerCase()}`, { defaultValue: label })}
              </Link>
            </Button>
          ))}
          {!isAuthenticated && (
            <Button asChild size="sm" variant="accent-outline" className="ml-auto min-h-11 shrink-0">
              <Link to="/login" search={{ callbackURL: pathname }}>
                {t('ladder.signIn', { defaultValue: 'Sign in to save jobs' })}
              </Link>
            </Button>
          )}
        </div>
        {children}
      </div>
    </PageLayout>
  );
}
