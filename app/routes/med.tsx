/**
 * RMH Med Schools layout route: the full-screen app frame around `/med` and everything under it.
 *
 * Public and indexable, so there is no auth gate (the private pages gate themselves) and no `appRouteHead` (it needs a
 * catalog entry; this app is listed in the Services hub, not the catalog). Each child route writes its own `head()`;
 * this one only links the app's stylesheet. It sits at the top level, so unlike `_site` it supplies
 * its own error and not-found frames, and each of them keeps the back button.
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';
import { NotFound } from '@/components/errors/NotFound';
import { MedApp } from '@features/medschools/ui/shell/MedApp';
import medschoolsCss from '@features/medschools/ui/medschools.css?url';

export const Route = createFileRoute('/med')({
  head: () => ({
    // One typeface, the site's DM Sans (already loaded); headings are the same face at weight 600 (owner 2026-11-24).
    links: [{ rel: 'stylesheet', href: medschoolsCss }],
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
