/**
 * RMH Music Layout — Auth Gate
 *
 * Wraps all /rmhmusic routes with authentication. A signed-out visitor is redirected on the
 * SERVER (`beforeLoad` → an HTTP redirect, so no app chrome ever paints for them) to /login,
 * with a callback that returns to the page they asked for (`rmhmusicReturnPath`).
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { rmhmusicReturnPath } from '@/lib/rmhmusic/learn/return-path';
import { RmhMusicStyles } from '@/components/rmhmusic/RmhMusicStyles';
import { useRmhMusicModeRoot } from '@/components/rmhmusic/useRmhMusicMode';

const checkAuth = createServerFn({ method: 'GET' })
  .validator((input: unknown) => ({ returnTo: rmhmusicReturnPath(input) }))
  .handler(async ({ data }) => {
    const session = await getRequestSession();
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: data.returnTo } });
    return { user: session.user };
  });

/**
 * `.app-theme` is the shared app chrome and `.rmhmusic-theme` its palette and paper
 * (rmhmusic.css). The site theme class is never applied here (THEME_EXCLUDED_ROUTES). Light /
 * dark is resolved by CSS and the pre-paint script before this renders; the hook keeps it in
 * step afterwards (toggle, system changes, client navigation in and out).
 */
function RmhMusicLayout() {
  useRmhMusicModeRoot();
  return (
    <div className="app-theme rmhmusic-theme">
      <RmhMusicStyles />
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/rmhmusic')({
  beforeLoad: ({ location }) => checkAuth({ data: location.pathname }),
  head: () => appRouteHead('rmhmusic'),
  component: RmhMusicLayout,
});
