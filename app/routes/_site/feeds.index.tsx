import { createFileRoute } from '@tanstack/react-router';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { feedsQuery } from '@/lib/discovery/feeds.queries';
import { FeedsPage } from '@/components/discovery/FeedsPage';

export const Route = createFileRoute('/_site/feeds/')({
  head: () => ({
    meta: [{ title: 'Custom feeds | RMH Studios' }, { name: 'robots', content: 'noindex, follow' }],
  }),
  // Signed out the fetch fails quietly and the page shows its sign-in prompt.
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, feedsQuery<unknown>()),
  component: FeedsPage,
});
