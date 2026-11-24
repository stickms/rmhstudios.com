import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { parseTrackerSearch } from '@features/medschools/engine/search';
import { trackerQuery, waitUnlessStay } from '@features/medschools/medschools.queries';
import { TrackerPage } from '@features/medschools/ui/tracker/TrackerPage';

/**
 * /med/tracker: the signed-in member's private tracker. Private (noindex, not in the sitemap), and its data
 * comes from `me/**`, which declares no cache. Signed out, the loader's fetch fails quietly and the page shows the
 * site's sign-in prompt (precedent: `wallet.tsx`).
 */
export const Route = createFileRoute('/med/tracker')({
  head: definePage({
    path: '/med/tracker',
    title: 'My tracker | RMH Studios',
    description: 'Your private medical school application tracker: schools, dates and optional anonymous sharing.',
    noIndex: true,
  }),
  validateSearch: parseTrackerSearch,
  loaderDeps: ({ search }) => search,
  // A cycle change (`cause: 'stay'`) does not wait: the old cycle stays on screen, dimmed, until the new one lands.
  loader: async ({ context, deps, cause }) => {
    await waitUnlessStay(cause, prefetchRouteQuery(context.queryClient, trackerQuery(deps.cycle)));
    return undefined;
  },
  component: TrackerPage,
});
