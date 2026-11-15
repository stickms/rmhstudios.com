import { createFileRoute } from '@tanstack/react-router';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { qotdArchiveQuery } from '@/lib/posts-plus/qotd.queries';
import { QotdPage } from '@/components/posts-plus/QotdPage';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { validateQotdSearch } from '@/lib/posts-plus/search';

export const Route = createFileRoute('/_site/qotd')({
  head: () => ({
    meta: buildMeta({
      title: 'Question of the Day | RMH Studios',
      description:
        'One question a day for the RMH Studios community - read everyone’s answers or add your own.',
      path: '/qotd',
    }),
    links: [buildCanonical('/qotd')],
  }),
  validateSearch: validateQotdSearch,
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, qotdArchiveQuery()),
  component: QotdRoute,
});

function QotdRoute() {
  const { day } = Route.useSearch();
  return <QotdPage day={day} />;
}
