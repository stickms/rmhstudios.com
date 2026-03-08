/**
 * RMH Tube Layout Route — Auth Gate + Theme Shell
 *
 * Wraps all /rmhtube routes with authentication and the RmhTube theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/auth';
import { getRequest } from '@tanstack/react-start/server';
import RmhTubeShell from '@/components/rmhtube/RmhTubeShell';
import rmhtubeCss from '@/components/rmhtube/rmhtube.css?url';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhtube' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rmhtube')({
  beforeLoad: () => checkAuth(),
  head: () => ({
    meta: [
      { title: 'RmhTube — Watch Together' },
      { name: 'description', content: 'Watch videos together in sync with friends' },
    ],
    links: [{ rel: 'stylesheet', href: rmhtubeCss }],
  }),
  component: () => (
    <RmhTubeShell>
      <Outlet />
    </RmhTubeShell>
  ),
});
