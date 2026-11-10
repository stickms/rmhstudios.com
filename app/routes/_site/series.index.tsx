import { createFileRoute } from '@tanstack/react-router';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { seriesQuery } from '@/lib/posts-plus/series.queries';
import { SeriesIndexPage } from '@/components/posts-plus/SeriesIndexPage';

export const Route = createFileRoute('/_site/series/')({
  head: () => ({
    meta: [{ title: 'Series | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  // Signed out the fetch fails quietly and the page shows its sign-in prompt.
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, seriesQuery()),
  component: SeriesIndexPage,
});
