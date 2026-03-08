/**
 * RMH Study Layout Route — Auth Gate + Theme Shell
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/auth';
import { getRequest } from '@tanstack/react-start/server';
import RmhStudyShell from '@/components/rmhstudy/RmhStudyShell';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhstudy' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rmhstudy')({
  beforeLoad: () => checkAuth(),
  head: () => ({
    meta: [
      { title: 'RMH Study — Study Together' },
      { name: 'description', content: 'Study together with synced Pomodoro timers, focus tracking, and ambient sounds.' },
    ],
  }),
  component: () => (
    <RmhStudyShell>
      <Outlet />
    </RmhStudyShell>
  ),
});
