/**
 * RochCloud Layout — Auth Gate
 *
 * Wraps all /rochcloud routes with authentication.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rochcloud' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rochcloud')({
  beforeLoad: () => checkAuth(),
  head: () => ({
    meta: [
      { title: 'RochCloud | rmhstudios' },
      { name: 'description', content: 'Stream your SoundCloud library. Browse playlists, liked tracks, and discover music.' },
    ],
  }),
  component: () => <Outlet />,
});
