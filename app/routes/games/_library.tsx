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
import { listCollections } from '@/lib/games/collections.server';
import { listFollowedGameIds } from '@/lib/arcade/updates.server';
import type { LibraryKind } from '@/lib/games/library';
import {
  ACCESS_OPTIONS,
  PLAY_OPTIONS,
  parseAccessParam,
  serializeAccessParam,
  type AccessFilter,
} from '@/lib/games/access-filter';

const fetchRecents = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  const userId = session?.user.id;
  const [recentIds, collections, followedIds] = userId
    ? await Promise.all([listRecentGameIds(userId), listCollections(userId), listFollowedGameIds(userId)])
    : [[] as string[], [], [] as string[]];
  return { recentIds, collections, followedIds, signedIn: !!userId };
});

export const Route = createFileRoute('/games/_library')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { kind?: 'game' | 'app'; following?: true; play?: string; access?: string } => ({
    ...(search.kind === 'game' || search.kind === 'app' ? { kind: search.kind } : {}),
    // The member's followed games only (`/games?following=1`).
    ...(search.following === true || search.following === 1 || search.following === '1' || search.following === 'true'
      ? { following: true as const }
      : {}),
    // Access filters, comma-separated and in display order so a selection is one URL (`?play=keyboard&access=no-timed-input`).
    ...(serializeAccessParam(parseAccessParam(search.play, PLAY_OPTIONS))
      ? { play: serializeAccessParam(parseAccessParam(search.play, PLAY_OPTIONS)) as string }
      : {}),
    ...(serializeAccessParam(parseAccessParam(search.access, ACCESS_OPTIONS))
      ? { access: serializeAccessParam(parseAccessParam(search.access, ACCESS_OPTIONS)) as string }
      : {}),
  }),
  head: () => ({ meta: [{ title: 'Library | RMH Studios' }] }),
  loader: () => fetchRecents(),
  component: LibraryLayout,
});

function LibraryLayout() {
  const { recentIds, collections, followedIds, signedIn } = Route.useLoaderData();
  const { kind = 'all', following = false, play, access } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <LibraryFrame
      recentIds={recentIds}
      collections={collections}
      signedIn={signedIn}
      kind={kind}
      following={following}
      accessFilter={{ play: parseAccessParam(play, PLAY_OPTIONS), access: parseAccessParam(access, ACCESS_OPTIONS) }}
      onAccessChange={(next: AccessFilter) =>
        void navigate({
          to: '.',
          search: ((prev: Record<string, unknown>) => ({
            ...prev,
            play: serializeAccessParam(next.play),
            access: serializeAccessParam(next.access),
          })) as never,
          replace: true,
        })
      }
      followedIds={followedIds}
      onFollowingChange={(on: boolean) =>
        void navigate({
          to: '.',
          search: ((prev: Record<string, unknown>) => ({
            ...prev,
            following: on ? true : undefined,
          })) as never,
          replace: true,
        })
      }
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
