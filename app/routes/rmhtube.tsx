/**
 * RMH Tube Layout Route — Auth Gate + Theme Shell
 *
 * Wraps all /rmhtube routes with authentication and the RmhTube theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { createServerFn } from '@tanstack/react-start';
import { safeInternalPath } from '@/lib/auth/redirect';
import { getRequestSession } from '@/lib/auth-session.server';
import RmhTubeShell from '@/components/rmhtube/RmhTubeShell';
import rmhtubeCss from '@/components/rmhtube/rmhtube.css?url';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return { user: session?.user ?? null };
});

export const Route = createFileRoute('/rmhtube')({
  beforeLoad: async ({ location }) => {
    const { user } = await checkAuth();
    // Carry the visited path (+search) through sign-in so a shared party link
    // lands on the party, not the landing page. safeInternalPath keeps it a
    // same-site path (no open redirect).
    if (!user) throw redirect({ to: '/login', search: { callbackURL: safeInternalPath(location.href) } });
    return { user };
  },
  head: () => appRouteHead('rmhtube', { links: [{ rel: 'stylesheet', href: rmhtubeCss }] }),
  component: () => (
    <RmhTubeShell>
      <Outlet />
    </RmhTubeShell>
  ),
});
