/**
 * RMHbox Layout — Auth Gate + Theme Shell
 *
 * Wraps all /rmhbox routes with authentication and the RMHbox theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { lazy, Suspense } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { redirect } from '@tanstack/react-router';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import rmhboxCss from '@/components/rmhbox/rmhbox.css?url';

// `routeTree.gen.ts` statically imports EVERY route module, so anything a route
// file imports at top level lands in the shared client entry — on every page of
// the site, not just this one. Importing RMHboxShell directly put its Zustand
// game store and socket client there: measured at 47 KB (components/rmhbox) +
// 17.5 KB (lib/rmhbox) of a 476 KB entry, paid by every visitor to the homepage
// for a party game behind an auth gate. Lazy, like the game routes do it.
const RMHboxShell = lazy(() => import('@/components/rmhbox/RMHboxShell'));

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhbox' } });
  return { user: session.user };
});

function RMHboxLayout() {
  return (
    // `--app-bg` for `.rmhbox-theme` (components/shared/app-theme.css) so the
    // hold reads as RMHBox arriving rather than a flash of a different app.
    <Suspense fallback={<GameLoadingFallback background="#1a1b1e" foreground="#ffffff" />}>
      <RMHboxShell>
        <Outlet />
      </RMHboxShell>
    </Suspense>
  );
}

export const Route = createFileRoute('/rmhbox')({
  beforeLoad: () => checkAuth(),
  head: () => gameRouteHead('rmhbox', { links: [{ rel: 'stylesheet', href: rmhboxCss }] }),
  component: RMHboxLayout,
});
