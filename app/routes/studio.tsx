/**
 * RMH Studio Layout — Auth Gate
 *
 * Wraps all /studio routes with authentication.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/studio' } });
  return { user: session.user };
});

export const Route = createFileRoute('/studio')({
  beforeLoad: () => checkAuth(),
  head: () => ({
    meta: [
      { title: 'RMH Studio | rmhstudios' },
      { name: 'description', content: 'Make beats in your browser. Multi-track DAW with synths, drums, effects, and samples.' },
    ],
  }),
  component: () => <Outlet />,
});
