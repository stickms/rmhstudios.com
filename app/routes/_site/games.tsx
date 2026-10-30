/**
 * /games — the library shell. A persistent rail of every game and app on the
 * left, the routed page on the right (Home at `/games`, a title at
 * `/games/$gameId`), the way Steam's Library is laid out. See
 * docs/superpowers/specs/2026-10-30-games-library-design.md.
 *
 * This layout owns the `?kind=` filter (`/apps` redirects to `?kind=app`) and the
 * viewer's recents, so the rail survives navigation between titles.
 */

import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { PageFrame } from '@/components/feed/PageLayout';
import { LibraryShell } from '@/components/games-library/LibraryShell';
import { getRequestSession } from '@/lib/auth-session.server';
import { listRecentGameIds } from '@/lib/playtime/playtime.server';
import type { LibraryKind } from '@/lib/games/library';

const fetchRecents = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return { recentIds: session ? await listRecentGameIds(session.user.id) : [] };
});

export const Route = createFileRoute('/_site/games')({
  validateSearch: (search: Record<string, unknown>): { kind?: 'game' | 'app' } =>
    search.kind === 'game' || search.kind === 'app' ? { kind: search.kind } : {},
  loader: () => fetchRecents(),
  component: GamesLayout,
});

function GamesLayout() {
  const { recentIds } = Route.useLoaderData();
  const { kind = 'all' } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <PageFrame wide>
      <LibraryShell
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
      </LibraryShell>
    </PageFrame>
  );
}
