import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { parseStatsSearch } from '@features/medschools/engine/search';
import { statsQuery } from '@features/medschools/medschools.queries';
import { StatsPage } from '@features/medschools/ui/stats/StatsPage';

/**
 * /med/stats ("My stats", phase D): the member's own applicant stats. Private (noindex, not in the sitemap); its data is
 * `me/stats`, which declares no cache. Signed out, the loader's fetch fails quietly and the page shows the sign-in
 * prompt. `?welcome=1` is the onboarding.
 */
export const Route = createFileRoute('/med/stats')({
  head: definePage({
    path: '/med/stats',
    title: 'My stats | RMH Studios',
    description: 'Your private applicant stats for RMH Med Schools.',
    noIndex: true,
  }),
  validateSearch: parseStatsSearch,
  loader: async ({ context }) => {
    await prefetchRouteQuery(context.queryClient, statsQuery());
    return undefined;
  },
  component: StatsPage,
});
