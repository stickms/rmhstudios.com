import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { resolveView } from '@features/medschools/engine/prefs';
import { parseLiveSearch, validateLiveSearch } from '@features/medschools/engine/search';
import { mineOfSearch, schoolsParam } from '@features/medschools/engine/mine';
import {
  liveSearchOf,
  loadMine,
  loadPrefs,
  prefetchLivePage,
  schoolsQuery,
  waitUnlessStay,
} from '@features/medschools/medschools.queries';
import { LivePage } from '@features/medschools/ui/LivePage';

export const Route = createFileRoute('/med/live')({
  head: definePage({
    path: '/med/live',
    title: 'Live reported events | RMH Med Schools | RMH Studios',
    description:
      'The latest interview invites and decisions reported across medical schools, with no names. Reported events, not applicants.',
  }),
  validateSearch: validateLiveSearch,
  // No `stripSearchParams`: absent `programs` means "the viewer's preferences", present is a choice (D14).
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    const prefs = await loadPrefs(context.queryClient, cause);
    const search = parseLiveSearch(deps);
    // "My schools" in the URL: the private answer first, then the feed asks for those slugs (`schools=`, public and
    // user-independent). An empty set asks for nothing: the page shows its empty state.
    const slugs = await loadMine(context.queryClient, mineOfSearch(search), prefs !== null, cause);
    const live = liveSearchOf(search, resolveView('live', search, prefs), slugs ? schoolsParam(slugs) : undefined);
    // A filter change (`cause: 'stay'`) does not wait: the feed stays on screen, dimmed, until the new one lands.
    await waitUnlessStay(
      cause,
      slugs && slugs.size === 0
        ? prefetchRouteQuery(context.queryClient, schoolsQuery({}))
        : prefetchLivePage(context.queryClient, live),
    );
    return undefined;
  },
  component: LivePage,
});
