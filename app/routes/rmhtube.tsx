/**
 * RMH Tube Layout Route — Auth Gate + Theme Shell
 *
 * Wraps all /rmhtube routes with authentication and the RmhTube theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import RmhTubeShell from '@/components/rmhtube/RmhTubeShell';
import rmhtubeCss from '@/components/rmhtube/rmhtube.css?url';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhtube' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rmhtube')({
  beforeLoad: () => checkAuth(),
  head: () => appRouteHead('rmhtube', { links: [{ rel: 'stylesheet', href: rmhtubeCss }] }),
  component: () => (
    <RmhTubeShell>
      <Outlet />
    </RmhTubeShell>
  ),
});
