import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { parseLiveSearch } from '@features/medschools/engine/search';
import { prefetchLivePage } from '@features/medschools/medschools.queries';
import { LivePage } from '@features/medschools/ui/LivePage';

export const Route = createFileRoute('/_site/rmh-medschool/live')({
  head: definePage({
    path: '/rmh-medschool/live',
    title: 'Live reported events | RMH Med Schools | RMH Studios',
    description:
      'The latest interview invites and decisions reported across medical schools, with no names. Reported events, not applicants.',
  }),
  validateSearch: parseLiveSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => prefetchLivePage(context.queryClient, deps),
  component: LivePage,
});
