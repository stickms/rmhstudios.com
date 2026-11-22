import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { LIVE_SEARCH_DEFAULTS, parseLiveSearch } from '@features/medschools/engine/search';
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
  // A default is not written into the URL: `/rmh-medschool/live` is canonical and never 307s to `?program=ALL`.
  search: { middlewares: [stripSearchParams(LIVE_SEARCH_DEFAULTS)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => prefetchLivePage(context.queryClient, deps),
  component: LivePage,
});
