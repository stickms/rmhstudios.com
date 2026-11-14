/**
 * Site Layout Route (pathless)
 *
 * Wraps all standard pages with the left sidebar and mobile navigation.
 * Game routes, /secret, and /login are NOT nested under this layout,
 * so they render full-screen without any sidebar.
 */

import { lazy, Suspense, type ReactNode } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';
import { NotFound } from '@/components/errors/NotFound';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { SiteShell } from '@/components/shell/SiteShell';
import { CookieConsent } from '@/components/site/CookieConsent';
import '@/components/feed/feed.css';

// Shell overlays that render nothing until a condition fires — first-run/locale/
// what's-new/free-month modals, global keyboard shortcuts, the targeted notice
// banner. They are lazy-loaded so their code + deps leave the eager hydration path
// of every _site page (perf F6 / rewrite R3-T7), and as ONE module, because all of
// them mount together: seven separate `lazy()` imports were seven requests for the
// same moment (components/site/SiteOverlays.tsx). Each renders null on the server
// and the Suspense fallback is null, so nothing in the visible layout shifts.
//
// The cookie notice is the exception and is imported statically: it must be in
// the SERVER HTML. Mounted lazily it painted seconds after everything else and
// became a first visit's Largest Contentful Paint (perf audit 2026-10-08,
// lib/cookie-consent.ts). It is a few hundred bytes of markup and one Button.
const SiteOverlays = lazy(() => import('@/components/site/SiteOverlays'));

export const Route = createFileRoute('/_site')({
  component: SiteLayout,
  // Keep the shell around errors/404s that occur on site routes. A route's
  // errorComponent renders INSTEAD of its component, so naming the bare
  // fallbacks here replaced SiteLayout too — a thrown route (the profile page,
  // when its SSR module resolution failed) rendered a full-viewport "Something
  // went wrong" card with no nav, no orb and no way back except the card's own
  // links. Wrapping them in the shell keeps the page recoverable in place.
  errorComponent: (props) => (
    <SiteShellFrame>
      <RouteErrorFallback {...props} />
    </SiteShellFrame>
  ),
  notFoundComponent: () => (
    <SiteShellFrame>
      <NotFound />
    </SiteShellFrame>
  ),
});

/** The `_site` chrome without the overlay stack — see the errorComponent note. */
function SiteShellFrame({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}

function SiteLayout() {
  return (
    <SiteShell
      overlays={
        // These overlays are non-critical chrome (first-run/promo modals, the
        // cookie notice, global shortcuts). Isolate them so a throw in any one is
        // reported and swallowed instead of bubbling to the route errorComponent
        // and blanking the whole shell + feed.
        <SilentErrorBoundary label="shell-overlays">
          <CookieConsent />
          <Suspense fallback={null}>
            <SiteOverlays />
          </Suspense>
        </SilentErrorBoundary>
      }
    >
      <Outlet />
    </SiteShell>
  );
}
