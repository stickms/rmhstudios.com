import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { BoardPending } from '@/components/pf2ecal/Loading';
import { Pf2eCalendar } from '@/components/pf2ecal/Pf2eCalendar';
import { auth } from '@/lib/auth';
import { getCalendarState } from '@/lib/pf2ecal/sessions.server';
import type { CalendarStateDTO } from '@/lib/pf2ecal/types';

/**
 * `/pf2ecal` — the Pathfinder 2e table's scheduling board.
 *
 * **Top level, not under `_site/`, on purpose.** The site shell (radial nav,
 * sidebar, theme switching) belongs to the public product; this is an unlisted
 * page for one group, with its own monochrome art direction. `pf2ecal` is
 * registered in `FULLSCREEN_ROUTE_SEGMENTS` /`FULLSCREEN_TIER_DIRS`
 * (`lib/__tests__/design-consistency.test.ts`), which is the mechanism this
 * repo uses to say "this surface has its own palette" — the same one the games
 * and the campaign arms use.
 *
 * **Unlisted, not private.** Anyone with the link can read it and anyone signed
 * in can edit it — that was the requirement. `noindex, nofollow` keeps it out
 * of search results, and it is deliberately absent from every nav, sitemap and
 * catalog, but the URL is the only thing standing between a stranger and the
 * schedule. That is a real trade and it is written down here so nobody has to
 * infer it: this holds a hobby group's game nights, not anything that would
 * hurt to leak, and the alternative (an invite system) is a lot of machinery
 * for five people who already share a Discord.
 */
const fetchBoard = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ state: CalendarStateDTO }> => {
    const request = getRequest();
    // `.catch(() => null)` so an auth hiccup renders the signed-out board
    // rather than a 500: reading the schedule never needed a session.
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    const viewer = session?.user ? { id: session.user.id, name: session.user.name ?? null } : null;
    return { state: await getCalendarState(viewer) };
  },
);

export const Route = createFileRoute('/pf2ecal')({
  head: () => ({
    meta: [
      { title: 'PF2e Calendar | RMH Studios' },
      // No `buildMeta`/`buildCanonical` here, and no Open Graph block: those
      // exist to make a page shareable and indexable, which is the opposite of
      // what this one wants. `nofollow` joins `noindex` so the .ics feed linked
      // from the page is not crawled either.
      { name: 'robots', content: 'noindex, nofollow' },
      // The page paints its own light/dark ground from `prefers-color-scheme`;
      // telling the browser both are supported stops the UA painting a white
      // overscroll gutter above a black page.
      { name: 'color-scheme', content: 'light dark' },
    ],
  }),
  loader: () => fetchBoard(),
  component: Pf2eCalPage,
  // The page's own skeleton, not the site-wide `RoutePending`: that one is
  // styled for the `--site-*` tier and would flash the site's chrome and
  // palette in front of a monochrome page. `BoardSkeleton` paints this page's
  // real geometry instead, so the loader resolving only fills text into boxes
  // that are already in the right place.
  pendingComponent: BoardPending,
  // Show it quickly and hold it long enough not to strobe. The router's global
  // defaults (150ms/300ms) are tuned for the feed; a board that has to lay out
  // a month grid benefits from committing to the skeleton a little sooner.
  pendingMs: 120,
  pendingMinMs: 320,
});

function Pf2eCalPage() {
  const { state } = Route.useLoaderData();
  return <Pf2eCalendar initialState={state} />;
}
