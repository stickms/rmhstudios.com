/**
 * /games — the library's Home (the rail lives in the `/games` layout route).
 *
 * `/games` is the one public index of everything on the site, and the destination
 * `/arcade`, `/leaderboard`, `/builds`, `/create?tab=games` and `/apps` all
 * redirect to. It carries the player surfaces — the party bar, the Ranked summary
 * and the Arcade Pass — under a shelf of recent titles; the catalog itself is the
 * rail beside it, and each title is `/games/$gameId`.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { LibraryHome } from '@/components/games-library/LibraryHome';
// Read by `validateSearch` (the route definition, which is in every page's
// entry) — so it comes from the UI-free module, not ArcadeSection. See
// components/creator-studio/arcade-tabs.ts.
import { ARCADE_SUB_TABS, type ArcadeSubTab } from '@/components/creator-studio/arcade-tabs';
import { definePage } from '@/lib/route/define-page';
import { breadcrumbSchema } from '@/lib/schema';
import { catalogItemListSchema } from '@/lib/seo-catalog';

export const Route = createFileRoute('/_site/games/')({
  // `?sub=` is the Arcade block's sub-tab, mirrored into the URL rather than
  // held locally so `/leaderboard` can deep-link the board even when the viewer
  // is already on this page and it never remounts.
  validateSearch: (search: Record<string, unknown>): { sub?: ArcadeSubTab } =>
    ARCADE_SUB_TABS.includes(search.sub as ArcadeSubTab) ? { sub: search.sub as ArcadeSubTab } : {},
  head: definePage({
    path: '/games',
    title: 'Games and apps | RMH Studios',
    description:
      'Every game and app made at RMH Studios — party games, puzzles, city builders, racers, multiplayer arenas, and tools to watch, listen, study, type and code. Free to play in the browser, no install.',
    jsonLd: () => [
      catalogItemListSchema('game'),
      catalogItemListSchema('app'),
      breadcrumbSchema([{ name: 'Games', path: '/games' }]),
    ],
  }),
  component: GamesIndexPage,
});

function GamesIndexPage() {
  const search = Route.useSearch();
  const { sub = 'challenges' } = search;
  const navigate = useNavigate();

  const setArcadeSub = useCallback(
    (next: ArcadeSubTab) => {
      void navigate({ to: '/games', search: { sub: next }, replace: true });
    },
    [navigate],
  );

  return <LibraryHome sub={sub} deferArcade={!search.sub} onSubChange={setArcadeSub} />;
}
