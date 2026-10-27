/**
 * Strategies Layout Route
 *
 * Wraps all /strategies/* routes with doctrine-specific navigation,
 * beta banner, and Sahur overlay detection. NOT nested under _site
 * — renders full-screen with its own sidebar.
 */

import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { Home, Puzzle, Shield, AlertTriangle, User } from 'lucide-react';
import { DoctrineNav } from '@/components/doctrine/layout/nav';
import { BetaBanner } from '@/components/doctrine/layout/beta-banner';
import { SahurOverlay } from '@/components/doctrine/layout/sahur-overlay';
import { useTranslation } from 'react-i18next';
import { useDoctrineStore } from '@/stores/doctrineStore';

export const Route = createFileRoute('/strategies')({
  head: () => appRouteHead('rmh-strategies'),
  component: StrategiesLayout,
});

function StrategiesLayout() {
  const doctrineTheme = useDoctrineStore((s) => s.doctrineTheme);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Puzzle routes render without sidebar for edge-to-edge gameplay
  const isPuzzleMode =
    /^\/strategies\/puzzles\/[a-z]+$/.test(pathname) &&
    pathname !== '/strategies/puzzles/archive' &&
    pathname !== '/strategies/puzzles/leaderboard';

  if (isPuzzleMode) {
    return (
      <div
        data-theme={doctrineTheme !== 'default' ? doctrineTheme : undefined}
        className="doctrine-layout"
      >
        <SahurOverlay />
        <Outlet />
      </div>
    );
  }

  return (
    <div
      data-theme={doctrineTheme !== 'default' ? doctrineTheme : undefined}
      className="doctrine-layout flex flex-col"
    >
      <BetaBanner />
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — hidden on mobile */}
        <aside className="hidden md:block w-56 shrink-0 doctrine-sidebar sticky top-0 h-[calc(100dvh-1.75rem)] overflow-y-auto">
          <DoctrineNav />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile nav */}
      <MobileDoctrineNav />
      <SahurOverlay />
    </div>
  );
}

function MobileDoctrineNav() {
  const { t } = useTranslation('r-strategies');
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mobileNavItems = [
    { to: '/strategies', icon: Home, label: t('nav-dashboard', { defaultValue: 'Dashboard' }) },
    { to: '/strategies/puzzles', icon: Puzzle, label: t('nav-puzzles', { defaultValue: 'Puzzles' }) },
    { to: '/strategies/safehouse', icon: Shield, label: t('nav-safehouse', { defaultValue: 'Safehouse' }) },
    { to: '/strategies/incidents', icon: AlertTriangle, label: t('nav-incidents', { defaultValue: 'Incidents' }) },
    { to: '/strategies/profile', icon: User, label: t('nav-profile', { defaultValue: 'Profile' }) },
  ] as const;
  return (
    <nav
      aria-label={t('nav-mobile', { defaultValue: 'Strategies' })}
      // A floating capsule, not a bar glued to the bottom edge: a full-width opaque strip there is what
      // iOS Safari reads as the page's edge and extends into a flat band behind its toolbar.
      className="md:hidden fixed inset-x-3 z-40 flex items-center justify-around rounded-full border border-white/10 py-1"
      style={{
        background: 'var(--doctrine-bg-secondary, #141416)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
      }}
    >
      {mobileNavItems.map((item) => {
        const active =
          pathname === item.to || (item.to !== '/strategies' && pathname.startsWith(item.to));
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className={`min-w-11 min-h-11 flex items-center justify-center transition-colors ${
              active ? 'text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            <item.icon size={22} aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}
