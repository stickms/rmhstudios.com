import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { resolveView } from '@features/medschools/engine/prefs';
import { parseLiveSearch, validateLiveSearch } from '@features/medschools/engine/search';
import { liveSearchOf, loadPrefs, prefetchLivePage, waitUnlessStay } from '@features/medschools/medschools.queries';
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
    const prefs = await loadPrefs(context.queryClient);
    const search = parseLiveSearch(deps);
    // A filter change (`cause: 'stay'`) does not wait: the feed stays on screen, dimmed, until the new one lands.
    await waitUnlessStay(
      cause,
      prefetchLivePage(context.queryClient, liveSearchOf(search, resolveView('live', search, prefs))),
    );
    return undefined;
  },
  component: LivePage,
});
