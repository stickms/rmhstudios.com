/**
 * Site Layout Route (pathless)
 *
 * Wraps all standard pages with the left sidebar and mobile navigation.
 * Game routes, /secret, and /login are NOT nested under this layout,
 * so they render full-screen without any sidebar.
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';
import { NotFound } from '@/components/errors/NotFound';
import { LeftSidebar } from '@/components/feed/LeftSidebar';
import { MobileNav } from '@/components/feed/MobileNav';
import { MobileSidebarShell } from '@/components/feed/MobileSidebarShell';
import { WelcomeModal } from '@/components/feed/WelcomeModal';
import { WhatsNewModal } from '@/components/feed/WhatsNewModal';
import { FreeMonthModal } from '@/components/feed/FreeMonthModal';
import { CookieConsent } from '@/components/site/CookieConsent';
import { KeyboardShortcuts } from '@/components/site/KeyboardShortcuts';
import { MiniPlayer } from '@/components/rmhmusic/MiniPlayer';
import '@/components/feed/feed.css';

export const Route = createFileRoute('/_site')({
  component: SiteLayout,
  // Keep the sidebar shell around errors/404s that occur on site routes.
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFound,
});

function SiteLayout() {
  const { t } = useTranslation('common');
  return (
    <div className="vibe-app min-h-dvh bg-site-bg flex flex-col md:flex-row">
      {/* Keyboard skip link — visually hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-site-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-site-accent-fg"
      >
        {t('skipToContent', { defaultValue: 'Skip to content' })}
      </a>
      <WelcomeModal />
      <WhatsNewModal />
      <FreeMonthModal />
      {/* Desktop/tablet: fixed left sidebar + centered content */}
      <div className="hidden md:flex min-w-0 w-full justify-center">
        <div className="md:w-16 xl:w-64 shrink-0 relative">
          <aside className="fixed top-0 md:w-16 xl:w-64 h-screen border-r border-site-border bg-site-bg overflow-hidden z-30 flex flex-col">
            <LeftSidebar />
          </aside>
        </div>
        {/* `display:contents` keeps the flex layout identical while exposing a
            real <main> landmark and giving the skip link a focus target.
            `page-root` drives the per-page enter animation on the content
            column(s) only — the left sidebar sits outside <main>, so it never
            animates (see the `.page-root > *` rule in globals.css). */}
        <main id="main-content" tabIndex={-1} className="contents page-root">
          <Outlet />
        </main>
      </div>

      {/* Mobile: page content slides right to reveal the left sidebar */}
      <MobileSidebarShell>
        <main className="contents page-root">
          <Outlet />
        </main>
      </MobileSidebarShell>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* One-time, non-blocking cookie notice (site pages only). */}
      <CookieConsent />

      {/* Site-wide shortcuts (c compose, g+<x> navigation, ? help overlay). */}
      <KeyboardShortcuts />

      {/* Music keeps playing when you leave RMHMusic — surface controls here. */}
      <MiniPlayer />
    </div>
  );
}
