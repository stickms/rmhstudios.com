/**
 * RMH Music Layout — Auth Gate
 *
 * Wraps all /rmhmusic routes with authentication.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import '@/components/rmhmusic/rmhmusic.css';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhmusic' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rmhmusic')({
  beforeLoad: () => checkAuth(),
  head: () => appRouteHead('rmhmusic'),
  // `.app-theme` is the shared app chrome and `.rmhmusic-theme` its palette
  // (rmhmusic.css). The site theme class is never applied here
  // (THEME_EXCLUDED_ROUTES), so without them the tokens resolve light against
  // the app's black backdrop.
  component: () => (
    <div className="app-theme rmhmusic-theme">
      <Outlet />
    </div>
  ),
});
