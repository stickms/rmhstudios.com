/**
 * RMH Med Schools layout route: the full-screen app frame around `/med` and everything under it.
 *
 * Public and indexable, so there is no auth gate (the private pages gate themselves) and no `appRouteHead` (it needs a
 * catalog entry; this app is listed in the Services hub, not the catalog). Each child route writes its own `head()`;
 * this one only links the app's stylesheet and the display face. It sits at the top level, so unlike `_site` it supplies
 * its own error and not-found frames, and each of them keeps the back button.
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';
import { NotFound } from '@/components/errors/NotFound';
import { MedApp } from '@features/medschools/ui/shell/MedApp';
import medschoolsCss from '@features/medschools/ui/medschools.css?url';
// Fraunces for the headings only (owner, 2026-11-24: body stays DM Sans, already loaded). Self-hosted, `optional`, the
// upright Latin file preloaded so a first visit usually gets it. See lib/fonts/self-hosted.ts.
import frauncesCss from '@/app/fonts/fraunces.css?url';
import frauncesLatin from '@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2?url';
import { preloadFont } from '@/lib/fonts/self-hosted';
import { awaitStylesheet } from '@/lib/route/await-stylesheet';

export const Route = createFileRoute('/med')({
  // A client navigation (from /services, say) keeps the old page until the app's sheet is in, so
  // the Med shell never paints unstyled and then snaps into its palette.
  loader: () => awaitStylesheet(medschoolsCss),
  head: () => ({
    links: [
      { rel: 'stylesheet', href: medschoolsCss },
      { rel: 'stylesheet', href: frauncesCss },
      preloadFont(frauncesLatin),
    ],
  }),
  component: () => (
    <MedApp>
      <Outlet />
    </MedApp>
  ),
  errorComponent: (props) => (
    <MedApp>
      <RouteErrorFallback {...props} />
    </MedApp>
  ),
  notFoundComponent: () => (
    <MedApp>
      <NotFound />
    </MedApp>
  ),
});
