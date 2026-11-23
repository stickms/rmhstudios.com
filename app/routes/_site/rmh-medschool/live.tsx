import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { resolveView } from '@features/medschools/engine/prefs';
import { parseLiveSearch } from '@features/medschools/engine/search';
import { liveSearchOf, prefetchLivePage } from '@features/medschools/medschools.queries';
import { LivePage } from '@features/medschools/ui/LivePage';

export const Route = createFileRoute('/_site/rmh-medschool/live')({
  head: definePage({
    path: '/rmh-medschool/live',
    title: 'Live reported events | RMH Med Schools | RMH Studios',
    description:
      'The latest interview invites and decisions reported across medical schools, with no names. Reported events, not applicants.',
  }),
  validateSearch: parseLiveSearch,
  // No `stripSearchParams`: absent `program` / `degree` means "the viewer's preferences", present is a choice (D14).
  loaderDeps: ({ search }) => search,
  // Signed-out view; the loader reads the viewer's preferences in a later task (phase 4 task 12).
  loader: ({ context, deps }) =>
    prefetchLivePage(context.queryClient, liveSearchOf(deps, resolveView('live', deps, null))),
  component: LivePage,
});
