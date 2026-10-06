import { createFileRoute } from '@tanstack/react-router';
import { Dunesday } from '@/components/dunesday/Dunesday';
import dunesdayCss from '@/components/dunesday/dunesday.css?url';
import { buildCanonical, buildMeta } from '@/lib/seo';

/**
 * `/dunesday` — the MCU + Dune marathon planner.
 *
 * Top level, not under `_site/`: it is a full-screen app with its own Frutiger
 * Aero art direction, so it opts out of the site shell and theme the same way
 * the PF2e board and the games do (`dunesday` is in FULLSCREEN_ROUTE_SEGMENTS /
 * FULLSCREEN_TIER_DIRS; the catalog entry has no `usesSiteTheme`, which puts the
 * route in THEME_EXCLUDED_ROUTES).
 *
 * No loader and no auth gate: the plan lives in the visitor's browser, so the
 * page is fully usable signed out. The one server call — the chat assistant —
 * is `auth: 'optional'` and carries its own rate limit.
 */
export const Route = createFileRoute('/dunesday')({
  head: () => ({
    meta: [
      ...buildMeta({
        title: 'Dunesday — MCU + Dune Marathon Planner | RMH Studios',
        // Short on purpose: every route's head() ships in the site-wide entry
        // chunk (routeTree imports all route modules statically).
        description:
          'Every MCU film and Dune, planned night by night before Doomsday and Dune: Part Three.',
        path: '/dunesday',
      }),
    ],
    links: [buildCanonical('/dunesday'), { rel: 'stylesheet', href: dunesdayCss }],
  }),
  component: Dunesday,
});
