import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { feedsQuery } from '@/lib/discovery/feeds.queries';
import { userListsQuery } from '@/lib/lists/list-feed.queries';
import { FEEDS_TABS, FeedsPage, type FeedsTab } from '@/components/discovery/FeedsPage';

export const Route = createFileRoute('/_site/feeds/')({
  head: () => ({
    meta: [{ title: 'Feeds | RMH Studios' }, { name: 'robots', content: 'noindex, follow' }],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: FeedsTab } =>
    FEEDS_TABS.includes(search.tab as FeedsTab) && search.tab !== 'feeds'
      ? { tab: search.tab as FeedsTab }
      : {},
  loaderDeps: ({ search }) => ({ tab: search.tab ?? 'feeds' }),
  // Signed out the fetch fails quietly and the page shows its sign-in prompt.
  loader: async ({ context, deps }) => {
    if (deps.tab === 'lists') await prefetchRouteQuery(context.queryClient, userListsQuery());
    if (deps.tab === 'feeds') await prefetchRouteQuery(context.queryClient, feedsQuery());
  },
  component: FeedsRoute,
});

function FeedsRoute() {
  const { tab = 'feeds' } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <FeedsPage
      tab={tab}
      onTabChange={(next) =>
        void navigate({
          to: '/feeds',
          search: next === 'feeds' ? {} : { tab: next },
          replace: true,
        })
      }
    />
  );
}
