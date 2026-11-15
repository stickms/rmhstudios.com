import { createFileRoute } from '@tanstack/react-router';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { seriesDetailQuery } from '@/lib/posts-plus/series-detail.queries';
import { SeriesPage } from '@/components/posts-plus/SeriesPage';

export const Route = createFileRoute('/_site/series/$id')({
  head: () => ({
    meta: [{ title: 'Series | RMH Studios' }, { name: 'robots', content: 'noindex, follow' }],
  }),
  loader: ({ context, params }) =>
    prefetchRouteQuery(context.queryClient, seriesDetailQuery(params.id)),
  component: SeriesRoute,
});

function SeriesRoute() {
  const { id } = Route.useParams();
  return <SeriesPage id={id} />;
}
