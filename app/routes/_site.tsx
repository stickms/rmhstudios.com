/**
 * Site Layout Route (pathless)
 *
 * Wraps all standard pages with the left sidebar and mobile navigation.
 * Game routes, /secret, and /login are NOT nested under this layout,
 * so they render full-screen without any sidebar.
 */

import { lazy, Suspense } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';
import { NotFound } from '@/components/errors/NotFound';
import { LeftSidebar } from '@/components/feed/LeftSidebar';
import { MobileSidebarShell } from '@/components/feed/MobileSidebarShell';
import { ShellLayoutContext } from '@/components/feed/shell-context';
import { BackToTop } from '@/components/ui/back-to-top';
import '@/components/feed/feed.css';

// Shell overlays that render nothing until a condition fires — first-run/locale/
// what's-new/free-month modals, the one-time cookie notice, global keyboard
// shortcuts, and the music mini-player (only when a track is active). Lazy-load
// them so their code + deps leave the eager hydration path of every _site page
// (perf F6 / rewrite R3-T7). Each renders null on the server and the Suspense
// fallback is null, so nothing in the visible layout shifts.
const WelcomeModal = lazy(() =>
  import('@/components/feed/WelcomeModal').then((m) => ({ default: m.WelcomeModal })),
);
const LanguageFirstRunModal = lazy(() =>
  import('@/components/site/LanguageFirstRunModal').then((m) => ({ default: m.LanguageFirstRunModal })),
);
const WhatsNewModal = lazy(() =>
  import('@/components/feed/WhatsNewModal').then((m) => ({ default: m.WhatsNewModal })),
);
const FreeMonthModal = lazy(() =>
  import('@/components/feed/FreeMonthModal').then((m) => ({ default: m.FreeMonthModal })),
);
const CookieConsent = lazy(() =>
  import('@/components/site/CookieConsent').then((m) => ({ default: m.CookieConsent })),
);
const KeyboardShortcuts = lazy(() =>
  import('@/components/site/KeyboardShortcuts').then((m) => ({ default: m.KeyboardShortcuts })),
);
const MiniPlayer = lazy(() =>
  import('@/components/rmhmusic/MiniPlayer').then((m) => ({ default: m.MiniPlayer })),
);

export const Route = createFileRoute('/_site')({
  component: SiteLayout,
  // Keep the sidebar shell around errors/404s that occur on site routes.
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFound,
});

function SiteLayout() {
  const { t } = useTranslation('common');
  return (
    <ShellLayoutContext.Provider value={true}>
      <div className="vibe-app min-h-dvh flex flex-col md:flex-row md:justify-center">
        {/* Keyboard skip link — visually hidden until focused. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-site-sm focus:bg-site-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-site-accent-fg"
        >
          {t('skipToContent', { defaultValue: 'Skip to content' })}
        </a>
        <Suspense fallback={null}>
          <LanguageFirstRunModal />
          <WelcomeModal />
          <WhatsNewModal />
          <FreeMonthModal />
        </Suspense>
        {/* Desktop/tablet: a spacer reserves the sidebar's width so the content
            centers beside it; the aside itself is fixed within that width. Hidden
            on mobile (the mobile drawer, below, owns the sidebar there).
            On desktop the sidebar is INLINE (not an overlay), so it stays
            transparent and shares the body aurora with the content — just a
            hairline border divides them. The aside carries no backdrop-filter, so
            LeftSidebar's non-portaled fixed user menu keeps the viewport as its
            containing block (§3.3.1). */}
        <div className="hidden md:block md:w-16 xl:w-64 shrink-0 relative">
          <aside className="fixed top-0 md:w-16 xl:w-64 h-screen border-r border-site-border overflow-hidden z-30 flex flex-col">
            <LeftSidebar />
          </aside>
        </div>

        {/* The page renders exactly ONCE (previously it was rendered twice — a
            desktop copy and a mobile copy — which doubled the feed's hydration
            cost and fired every mount effect twice). MobileSidebarShell is
            display:contents on desktop, so the page's columns still become direct
            children of the outer flex and center exactly as before; on mobile it's
            the full-width gesture column + slide-in drawer overlay. `display:contents`
            on <main> keeps the layout identical while exposing a real landmark and
            the skip-link focus target; `page-root` drives the per-page enter
            animation on the content column(s) only. */}
        <MobileSidebarShell>
          <main id="main-content" tabIndex={-1} className="contents page-root">
            <Outlet />
          </main>
        </MobileSidebarShell>

        {/* Client-only overlays, lazy-loaded off the eager path (perf F6). Each
            renders null until its trigger fires, so a null Suspense fallback is
            invisible. */}
        <Suspense fallback={null}>
          {/* One-time, non-blocking cookie notice (site pages only). */}
          <CookieConsent />

          {/* Site-wide shortcuts (c compose, g+<x> navigation, ? help overlay). */}
          <KeyboardShortcuts />

          {/* Music keeps playing when you leave RMHMusic — surface controls here. */}
          <MiniPlayer />
        </Suspense>

        {/* Floating scroll-to-top affordance for long pages. */}
        <BackToTop />
      </div>
    </ShellLayoutContext.Provider>
  );
}
