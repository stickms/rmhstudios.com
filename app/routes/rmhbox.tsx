/**
 * RMHbox Layout — Auth Gate + Theme Shell
 *
 * Wraps all /rmhbox routes with authentication and the RMHbox theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { Suspense } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { redirect } from '@tanstack/react-router';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import rmhboxCss from '@/components/rmhbox/rmhbox.css?url';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import RMHboxShell from '@/components/rmhbox/RMHboxShell';

// Re-measured 2026-10-07: this used to be lazy because a direct import once put
// RMHboxShell's store and socket client (~64 KB) in the shared entry. It no
// longer does — the shell is used only by this route's `component`, which Start
// lifts into the route's own chunk; per-module sourcemap attribution of the entry
// shows none of components/rmhbox. The lazy() it was replaced with blanked the
// signed-in lobby to the loading sheet for ~0.7s after it had painted.

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
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
