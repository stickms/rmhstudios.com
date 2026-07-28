/**
 * RMH Music Layout — Auth Gate
 *
 * Wraps all /rmhmusic routes with authentication.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import '@/components/rmhmusic/rmhmusic.css';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhmusic' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rmhmusic')({
  beforeLoad: () => checkAuth(),
  head: () => ({
    meta: [
      { title: 'RMH Music | rmhstudios' },
      {
        name: 'description',
        content: 'Listen to Spotify with friends. Create rooms, share music, vibe together.',
      },
    ],
  }),
  // `.rmhmusic-theme` scopes the app's own dark palette (rmhmusic.css). The
  // site theme class is never applied here (THEME_EXCLUDED_ROUTES), so without
  // it the tokens resolve light against the app's black backdrop.
  component: () => (
    <div className="rmhmusic-theme">
      <Outlet />
    </div>
  ),
});
