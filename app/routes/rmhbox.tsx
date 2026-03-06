/**
 * RMHbox Layout — Auth Gate + Theme Shell
 *
 * Wraps all /rmhbox routes with authentication and the RMHbox theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { redirect } from '@tanstack/react-router';
import RMHboxShell from '@/components/rmhbox/RMHboxShell';
import '@/components/rmhbox/rmhbox.css';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhbox' } });
  return { user: session.user };
});

function RMHboxLayout() {
  return (
    <RMHboxShell>
      <Outlet />
    </RMHboxShell>
  );
}

export const Route = createFileRoute('/rmhbox')({
  beforeLoad: () => checkAuth(),
  component: RMHboxLayout,
});
