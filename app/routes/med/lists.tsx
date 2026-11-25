import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { listsQuery, prefsQuery } from '@features/medschools/medschools.queries';
import { ListsPage } from '@features/medschools/ui/lists/ListsPage';

/**
 * /med/lists: the signed-in member's saved lists and preferences. Private (noindex, not in the sitemap); its
 * data comes from `me/**`, which declares no cache. Signed out, the loader's fetches fail quietly and the page shows
 * the site's sign-in prompt (precedent: `tracker.tsx`, `wallet.tsx`).
 */
export const Route = createFileRoute('/med/lists')({
  head: definePage({
    path: '/med/lists',
    title: 'My lists | RMH Med Schools',
    description: 'Your private saved medical school lists and preferences.',
    noIndex: true,
  }),
  loader: async ({ context }) => {
    await Promise.all([
      prefetchRouteQuery(context.queryClient, listsQuery()),
      prefetchRouteQuery(context.queryClient, prefsQuery()),
    ]);
    return undefined;
  },
  component: ListsPage,
});
