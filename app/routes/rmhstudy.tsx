/**
 * RMH Study Layout Route — Auth Gate + Theme Shell
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { createServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/auth';
import { getRequest } from '@tanstack/react-start/server';
import RmhStudyShell from '@/components/rmhstudy/RmhStudyShell';
import rmhstudyCss from '@/components/rmhstudy/rmhstudy.css?url';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhstudy' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rmhstudy')({
  beforeLoad: () => checkAuth(),
  head: () => appRouteHead('rmhstudy', { links: [{ rel: 'stylesheet', href: rmhstudyCss }] }),
  component: () => (
    <RmhStudyShell>
      <Outlet />
    </RmhStudyShell>
  ),
});
