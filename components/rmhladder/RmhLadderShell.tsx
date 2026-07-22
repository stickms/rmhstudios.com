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
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
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

  // §16.2: the sub-nav is the shared LiquidTabs sheet in LINK MODE — route <Link>s
  // (some public/crawlable + prefetched) keep their semantics and `aria-current`,
  // while LiquidTabs owns the sheet, the flowing capsule + morph and the visual
  // grammar every other strip uses (one renderer, one look). The shell is a layout
  // route (Outlet) so the capsule survives navigation and morphs between routes.
  const tabs: LiquidTab[] = navItems.map(({ label, to, icon }) => ({
    id: to,
    label: t(`ladder.nav.${label.toLowerCase()}`, { defaultValue: label }),
    icon,
  }));
  const activeTo = navItems.find((i) => isActive(i.to))?.to ?? navItems[0]?.to ?? '';

  return (
    <PageLayout title={pageTitle(pathname)} wide>
      <div className="rmhladder min-w-0 px-3 pb-24 pt-3 sm:px-4 sm:pt-4 md:pb-12">
        {/* §5.45: the sub-nav rides a standalone glass sheet (pill) below the page
            title; the sign-in CTA stays a sibling outside the sheet, pushed right. */}
        <div className="mb-5 flex items-center gap-2">
          <LiquidTabs
            tabs={tabs}
            value={activeTo}
            scroll
            aria-label={t('ladder.navigation', { defaultValue: 'RMH Ladder navigation' })}
            renderTab={(tab, props) => (
              // Bare <Link> wearing LiquidTabs' own tab class (props.className) so
              // the route tab matches every other strip exactly; `min-h-11` keeps
              // the 44px touch target the ladder nav had. props.children is the
              // pre-composed icon + label at z-1 above the flowing capsule.
              <Link
                to={tab.id}
                id={props.id}
                aria-current={props['aria-current']}
                className={`${props.className} min-h-11`}
              >
                {props.children}
              </Link>
            )}
          />
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
