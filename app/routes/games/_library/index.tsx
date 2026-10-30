/**
 * /games — the library's Home (the list lives in the `_library` layout beside it).
 *
 * `/games` is the one public index of everything on the site, and the destination
 * `/builds`, `/create?tab=games` and `/apps` redirect to. The player surfaces that
 * used to share this page — party bar, Ranked, Arcade Pass — live at `/arcade`; an
 * old `/games?sub=…` link is sent there.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { LibraryHomePage } from '@/components/steam/LibraryHomePage';
// Read by `validateSearch` (the route definition, which is in every page's entry) — so
// it comes from the UI-free module, not ArcadeSection.
import { ARCADE_SUB_TABS, type ArcadeSubTab } from '@/components/creator-studio/arcade-tabs';
import { definePage } from '@/lib/route/define-page';
import { breadcrumbSchema } from '@/lib/schema';
import { catalogItemListSchema } from '@/lib/seo-catalog';

export const Route = createFileRoute('/games/_library/')({
  // `?sub=` was the Arcade block's sub-tab when it lived on this page; it still
  // arrives from old links, and `beforeLoad` forwards it to `/arcade`.
  validateSearch: (search: Record<string, unknown>): { sub?: ArcadeSubTab } =>
    ARCADE_SUB_TABS.includes(search.sub as ArcadeSubTab) ? { sub: search.sub as ArcadeSubTab } : {},
  beforeLoad: ({ search }) => {
    if (search.sub) throw redirect({ to: '/arcade', search: { sub: search.sub } });
  },
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
  component: LibraryHomePage,
});

