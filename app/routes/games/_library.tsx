/**
 * The Library tab (pathless): the list of every game and app on the left, the routed
 * page on the right. Owns the `?kind=` filter (`/apps` redirects to `?kind=app`) and
 * the viewer's recents, so the list survives navigation between titles.
 */

import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { LibraryFrame } from '@/components/steam/LibraryFrame';
import { getRequestSession } from '@/lib/auth-session.server';
import { listRecentGameIds } from '@/lib/playtime/playtime.server';
import type { LibraryKind } from '@/lib/games/library';

const fetchRecents = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return { recentIds: session ? await listRecentGameIds(session.user.id) : [] };
});

export const Route = createFileRoute('/games/_library')({
  validateSearch: (search: Record<string, unknown>): { kind?: 'game' | 'app' } =>
    search.kind === 'game' || search.kind === 'app' ? { kind: search.kind } : {},
  head: () => ({ meta: [{ title: 'Library | RMH Studios' }] }),
  loader: () => fetchRecents(),
  component: LibraryLayout,
});

function LibraryLayout() {
  const { recentIds } = Route.useLoaderData();
  const { kind = 'all' } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <LibraryFrame
      recentIds={recentIds}
      kind={kind}
      onKindChange={(k: LibraryKind) =>
        void navigate({
          to: '.',
          search: ((prev: Record<string, unknown>) => ({
            ...prev,
            kind: k === 'all' ? undefined : k,
          })) as never,
          replace: true,
        })
      }
    >
      <Outlet />
    </LibraryFrame>
  );
}
