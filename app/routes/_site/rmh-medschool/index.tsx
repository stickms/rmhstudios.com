import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { resolveView } from '@features/medschools/engine/prefs';
import { parseIndexSearch } from '@features/medschools/engine/search';
import { indexQuery, schoolsQuery, todayQuery } from '@features/medschools/medschools.queries';
import { IndexPage } from '@features/medschools/ui/IndexPage';

export const Route = createFileRoute('/_site/rmh-medschool/')({
  head: definePage({
    path: '/rmh-medschool',
    title: 'RMH Med Schools | RMH Studios',
    description:
      'Interview invites and decisions reported by medical school and day, from CycleTrack, Admit.org and Student Doctor Network. Reported events, not applicants.',
  }),
  validateSearch: parseIndexSearch,
  // No `stripSearchParams`: `program` and `degree` absent means "the viewer's preferences", present (even `ALL`) is a
  // choice (D14). The pages write a clean URL themselves (`writeSearch`).
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    // Signed-out view; the loader reads the viewer's preferences in a later task (phase 4 task 12).
    const view = resolveView('index', deps, null);
    await Promise.all([
      prefetchRouteQuery(context.queryClient, schoolsQuery(indexQuery(deps, view))),
      prefetchRouteQuery(context.queryClient, todayQuery(view.program === 'NONE' ? 'ALL' : view.program, view.degree)),
    ]);
    return undefined;
  },
  component: IndexPage,
});
