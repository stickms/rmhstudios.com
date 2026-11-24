import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { resolveView } from '@features/medschools/engine/prefs';
import { parseIndexSearch, validateIndexSearch } from '@features/medschools/engine/search';
import {
  indexQuery,
  listsQuery,
  loadPrefs,
  schoolsQuery,
  waitUnlessStay,
} from '@features/medschools/medschools.queries';
import { IndexPage } from '@features/medschools/ui/IndexPage';

export const Route = createFileRoute('/med/')({
  head: definePage({
    path: '/med',
    title: 'RMH Med Schools | RMH Studios',
    description:
      'Interview invites and decisions reported by medical school and day, from CycleTrack, Admit.org and Student Doctor Network. Reported events, not applicants.',
  }),
  validateSearch: validateIndexSearch,
  // No `stripSearchParams`: `programs` absent means "the viewer's preferences", present (even all four) is a choice
  // (D14). The pages write a clean URL themselves (`writeSearch`).
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    // Preferences first (private, quiet when signed out), then the public query with explicit parameters (D13).
    const prefs = await loadPrefs(context.queryClient, cause);
    const search = parseIndexSearch(deps);
    const view = resolveView('index', search, prefs);
    // A filter change (`cause: 'stay'`) does not wait: the list stays on screen, dimmed, until the new one lands.
    await waitUnlessStay(cause, prefetchRouteQuery(context.queryClient, schoolsQuery(indexQuery(search, view))));
    // The list filter needs the viewer's lists; the page shows the unfiltered index without them.
    if (search.list && prefs) await prefetchRouteQuery(context.queryClient, listsQuery());
    return undefined;
  },
  component: IndexPage,
});
