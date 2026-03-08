/**
 * RMH Type Layout Route — Auth Gate + Theme Shell
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/auth';
import { getRequest } from '@tanstack/react-start/server';
import RmhTypeShell from '@/components/rmhtype/RmhTypeShell';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhtype' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rmhtype')({
  beforeLoad: () => checkAuth(),
  head: () => ({
    meta: [
      { title: 'RMH Type — Competitive Typing' },
      { name: 'description', content: 'Test your typing speed solo or race against friends in real-time multiplayer.' },
    ],
  }),
  component: () => (
    <RmhTypeShell>
      <Outlet />
    </RmhTypeShell>
  ),
});
