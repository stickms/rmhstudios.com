import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { resolveView } from '@features/medschools/engine/prefs';
import { parseLiveSearch, validateLiveSearch } from '@features/medschools/engine/search';
import {
  liveSearchOf,
  loadPrefs,
  prefetchLivePage,
  schoolsQuery,
  waitUnlessStay,
} from '@features/medschools/medschools.queries';
import { LivePage } from '@features/medschools/ui/LivePage';

export const Route = createFileRoute('/med/live')({
  head: definePage({
    path: '/med/live',
    title: 'Live reported events | RMH Med Schools',
    description:
      'The latest interview invites, secondaries and decisions reported across US medical schools, as they arrive, with no names. Reported events, not applicants.',
  }),
  validateSearch: validateLiveSearch,
  // No `stripSearchParams`: absent `programs` means "the viewer's preferences", present is a choice (D14).
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    const prefs = await loadPrefs(context.queryClient, cause);
    const search = parseLiveSearch(deps);
    // "My schools" in the URL: the private answer first, then the feed asks for those slugs (`schools=`, public and
    // user-independent). An empty set asks for nothing: the page shows its empty state.
    // Loaded only when the URL names one, so the mine filter stays out of every page's shared entry.
    let slugs: Set<string> | null = null;
    let schools: string | undefined;
    if (prefs !== null && (search.mine || search.list)) {
      const m = await import('@features/medschools/load-mine');
      slugs = await m.loadMine(context.queryClient, m.mineOfSearch(search), true, cause);
      schools = slugs ? m.schoolsParam(slugs) : undefined;
    }
    const live = liveSearchOf(search, resolveView('live', search, prefs), schools);
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
