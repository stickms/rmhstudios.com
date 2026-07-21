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
import { useRef } from 'react';
import { m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { useLiquidMorph } from '@/components/ui/liquid-morph';
import { SPRING } from '@/lib/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

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
  const reduced = useReducedMotion();
  // §15.1/§5.47: the flowing nav capsule carries the shared morph (velocity
  // squash + gooey trailing droplet). Route <Link>s stay (crawlable/prefetched),
  // so this keeps the custom markup rather than adopting LiquidTabs' role=tab.
  const capsuleRef = useRef<HTMLSpanElement>(null);
  const { squashStyle, underlay } = useLiquidMorph({ capsuleRef, axis: 'x', reduced });
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
        {/* §5.45: the sub-nav rides a standalone glass sheet (pill) below the page
            title; the sign-in CTA stays a sibling outside the sheet, pushed right.
            The rmhladder-nav-capsule layoutId still flows between routes. */}
        <div className="mb-5 flex items-center gap-2">
          <nav
            className="relative flex w-fit min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-full p-1 glass-fill glass-bevel-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t('ladder.navigation', { defaultValue: 'RMH Ladder navigation' })}
          >
            {/* Goo underlay (§5.47) — capsule-only, behind the links; labels above. */}
            {underlay}
            {navItems.map(({ label, to, icon: Icon }) => {
            const active = isActive(to);
            // These are route links (some public/crawlable + prefetched), so they
            // stay <Link>s rather than becoming LiquidTabs' role=tab buttons. The
            // flowing active capsule is a layoutId motion element behind the link;
            // the shell is a layout route (Outlet) so it survives navigation and
            // the capsule morphs between routes (§5.4).
            return (
              <div key={to} className="relative shrink-0">
                {active && (
                  // Outer span owns the layoutId position morph; the inner span
                  // carries the material + velocity squash (§5.47).
                  <motion.span
                    ref={capsuleRef}
                    layoutId="rmhladder-nav-capsule"
                    aria-hidden
                    className="absolute inset-0 z-0"
                    transition={reduced ? { duration: 0 } : SPRING.snappy}
                  >
                    <motion.span
                      className="glass-liquid absolute inset-0 rounded-site bg-site-accent-dim shadow-[inset_0_1px_0_var(--site-glass-rim)]"
                      style={squashStyle}
                    />
                  </motion.span>
                )}
                <Button asChild size="sm" variant="ghost" className="relative min-h-11">
                  <Link
                    to={to}
                    aria-current={active ? 'page' : undefined}
                    className={active ? 'text-site-accent' : undefined}
                  >
                    <Icon className="size-4" aria-hidden />
                    {t(`ladder.nav.${label.toLowerCase()}`, { defaultValue: label })}
                  </Link>
                </Button>
              </div>
            );
          })}
          </nav>
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
