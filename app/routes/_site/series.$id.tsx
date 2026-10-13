import { createFileRoute } from '@tanstack/react-router';
import { SeriesPage } from '@/components/posts-plus/SeriesPage';

export const Route = createFileRoute('/_site/series/$id')({
  head: () => ({
    meta: [{ title: 'Series | RMH Studios' }, { name: 'robots', content: 'noindex, follow' }],
  }),
  component: SeriesRoute,
});

function SeriesRoute() {
  const { id } = Route.useParams();
  return <SeriesPage id={id} />;
}
