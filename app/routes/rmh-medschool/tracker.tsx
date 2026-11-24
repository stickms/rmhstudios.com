import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { parseTrackerSearch } from '@features/medschools/engine/search';
import { trackerQuery } from '@features/medschools/medschools.queries';
import { TrackerPage } from '@features/medschools/ui/tracker/TrackerPage';

/**
 * /rmh-medschool/tracker: the signed-in member's private tracker. Private (noindex, not in the sitemap), and its data
 * comes from `me/**`, which declares no cache. Signed out, the loader's fetch fails quietly and the page shows the
 * site's sign-in prompt (precedent: `wallet.tsx`).
 */
export const Route = createFileRoute('/rmh-medschool/tracker')({
  head: definePage({
    path: '/rmh-medschool/tracker',
    title: 'My tracker | RMH Studios',
    description: 'Your private medical school application tracker: schools, dates and optional anonymous sharing.',
    noIndex: true,
  }),
  validateSearch: parseTrackerSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => prefetchRouteQuery(context.queryClient, trackerQuery(deps.cycle)),
  component: TrackerPage,
});
