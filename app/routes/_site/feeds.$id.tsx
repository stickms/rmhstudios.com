import { createFileRoute } from '@tanstack/react-router';
import { FeedPage } from '@/components/discovery/FeedPage';

export const Route = createFileRoute('/_site/feeds/$id')({
  head: () => ({
    meta: [{ title: 'Feed | RMH Studios' }, { name: 'robots', content: 'noindex, follow' }],
  }),
  component: FeedRoute,
});

function FeedRoute() {
  const { id } = Route.useParams();
  return <FeedPage id={id} />;
}
