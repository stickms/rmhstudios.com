/**
 * RMH Studio Layout — Auth Gate
 *
 * Wraps all /studio routes with authentication.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/studio' } });
  return { user: session.user };
});

export const Route = createFileRoute('/studio')({
  beforeLoad: () => checkAuth(),
  head: () => appRouteHead('studio'),
  component: () => <Outlet />,
});
