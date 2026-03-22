/**
 * Strategies Layout Route
 *
 * Wraps all /strategies/* routes with doctrine-specific navigation,
 * beta banner, and Sahur overlay detection. NOT nested under _site
 * — renders full-screen with its own sidebar.
 */

import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { Home, Puzzle, Shield, AlertTriangle, User } from 'lucide-react';
import { DoctrineNav } from '@/components/doctrine/layout/nav';
import { BetaBanner } from '@/components/doctrine/layout/beta-banner';
import { SahurOverlay } from '@/components/doctrine/layout/sahur-overlay';
import { useDoctrineStore } from '@/stores/doctrineStore';

export const Route = createFileRoute('/strategies')({
  component: StrategiesLayout,
});

function StrategiesLayout() {
  const doctrineTheme = useDoctrineStore(s => s.doctrineTheme);
  const pathname = useRouterState({ select: s => s.location.pathname });

  // Puzzle routes render without sidebar for edge-to-edge gameplay
  const isPuzzleMode = /^\/strategies\/puzzles\/[a-z]+$/.test(pathname) &&
    pathname !== '/strategies/puzzles/archive' &&
    pathname !== '/strategies/puzzles/leaderboard';

  if (isPuzzleMode) {
    return (
      <div data-theme={doctrineTheme !== 'default' ? doctrineTheme : undefined} className="doctrine-layout">
        <SahurOverlay />
        <Outlet />
      </div>
    );
  }

  return (
    <div data-theme={doctrineTheme !== 'default' ? doctrineTheme : undefined} className="doctrine-layout flex flex-col">
      <BetaBanner />
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — hidden on mobile */}
        <aside className="hidden md:block w-56 shrink-0 doctrine-sidebar sticky top-0 h-[calc(100dvh-28px)] overflow-y-auto">
          <DoctrineNav />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile nav */}
      <MobileDoctrineNav />
      <SahurOverlay />
    </div>
  );
}

const mobileNavItems = [
  { to: '/strategies', icon: Home },
  { to: '/strategies/puzzles', icon: Puzzle },
  { to: '/strategies/safehouse', icon: Shield },
  { to: '/strategies/incidents', icon: AlertTriangle },
  { to: '/strategies/profile', icon: User },
] as const;

function MobileDoctrineNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/6"
      style={{ background: 'var(--doctrine-bg-secondary, #141416)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)', paddingTop: '8px' }}>
      {mobileNavItems.map(item => (
        <a key={item.to} href={item.to} className="min-w-11 min-h-11 flex items-center justify-center text-white/60 hover:text-white/90 transition-colors">
          <item.icon size={22} />
        </a>
      ))}
    </nav>
  );
}
