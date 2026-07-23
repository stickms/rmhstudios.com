/**
 * Site Layout Route (pathless)
 *
 * Wraps all standard pages with the left sidebar and mobile navigation.
 * Game routes, /secret, and /login are NOT nested under this layout,
 * so they render full-screen without any sidebar.
 */

import { lazy, Suspense } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';
import { NotFound } from '@/components/errors/NotFound';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { SiteShell } from '@/components/feed/SiteShell';
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
  import('@/components/site/LanguageFirstRunModal').then((m) => ({
    default: m.LanguageFirstRunModal,
  })),
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
  return (
    <SiteShell
      overlays={
        // These overlays are non-critical chrome (first-run/promo modals, the
        // cookie notice, global shortcuts, the music mini-player). Isolate them
        // so a throw in any one is reported and swallowed instead of bubbling to
        // the route errorComponent and blanking the whole shell + feed.
        <SilentErrorBoundary label="shell-overlays">
          <Suspense fallback={null}>
            <LanguageFirstRunModal />
            <WelcomeModal />
            <WhatsNewModal />
            <FreeMonthModal />
            <CookieConsent />
            <KeyboardShortcuts />
            <MiniPlayer />
          </Suspense>
        </SilentErrorBoundary>
      }
    >
      <Outlet />
    </SiteShell>
  );
}
