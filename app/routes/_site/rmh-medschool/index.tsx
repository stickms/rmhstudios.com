import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { parseIndexSearch } from '@features/medschools/engine/search';
import { schoolsQuery, todayQuery } from '@features/medschools/medschools.queries';
import { IndexPage } from '@features/medschools/ui/IndexPage';

export const Route = createFileRoute('/_site/rmh-medschool/')({
  head: definePage({
    path: '/rmh-medschool',
    title: 'RMH Med Schools | RMH Studios',
    description:
      'Interview invites and decisions reported by medical school and day, from CycleTrack, Admit.org and Student Doctor Network. Reported events, not applicants.',
  }),
  validateSearch: parseIndexSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      prefetchRouteQuery(context.queryClient, schoolsQuery(deps)),
      prefetchRouteQuery(context.queryClient, todayQuery(deps.program)),
    ]);
    return undefined;
  },
  component: IndexPage,
});
