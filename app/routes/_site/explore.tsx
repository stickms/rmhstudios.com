import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { ExploreColumn } from '@/components/feed/ExploreColumn';
import { SavedSearches } from '@/components/search/SavedSearches';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { auth } from '@/lib/auth';
import { listExplore } from '@/lib/explore.server';
import { getSidebarData } from '@/lib/sidebar-data';
import { isSearchTab, type SearchTab } from '@/lib/search/types';

/**
 * The one discovery destination.
 *
 * `/explore` and `/search` were two pages doing the same job — both titled
 * "Explore", with overlapping recommendations and an AI box each; the nav
 * pointed at one and the sitemap listed the other. They are merged here:
 * discovery when the field is empty, results when it isn't. `/search` redirects
 * in, carrying `q` and `tab`, so every saved search, share and bookmark still
 * lands on the right view.
 */

// Prefetch both payloads server-side so the page is complete at first paint
// (SSR) and prefetched on hover intent instead of fetched on mount. The tips
// leaderboard stays client-fetched — it is below the fold and shouldn't hold up
// a blocking loader.
const fetchExplore = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  const [discovery, sidebar] = await Promise.all([
    listExplore(session?.user?.id ?? null),
    getSidebarData(),
  ]);
  return { discovery, sidebar };
});

export const Route = createFileRoute('/_site/explore')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || '',
    // Tabs are declared once in lib/search/types so the page, the API and the
    // result renderer can never disagree about which corpora a tab covers.
    tab: isSearchTab(search.tab) ? search.tab : ('top' as SearchTab),
  }),
  loader: () => fetchExplore(),
  head: () => ({
    meta: buildMeta({
      title: 'Explore | RMH Studios',
      description:
        'Search people, posts, builds and writing, or see what the RMH Studios community is talking about right now.',
      path: '/explore',
    }),
    // Canonical stays query-less: `?q=` is a view of this page, not a page of
    // its own, and a results URL per query is exactly the thin duplication the
    // old /search route was `noindex` to avoid.
    links: [buildCanonical('/explore')],
  }),
  component: ExplorePage,
});

function ExplorePage() {
  const { t } = useTranslation('site');
  const { q, tab } = Route.useSearch();
  const { discovery, sidebar } = Route.useLoaderData();
  const { officialBuilds, userBuilds, recommendedUsers, blogPosts } = sidebar;

  return (
    <PageLayout
      title={t('explore-title', { defaultValue: 'Explore' })}
      description={t('explore-subtitle', {
        defaultValue: 'Search people, posts, builds and writing across RMH Studios.',
      })}
      rightSidebar={
        <RightSidebar
          officialBuilds={officialBuilds}
          userBuilds={userBuilds}
          recommendedUsers={recommendedUsers}
          blogPosts={blogPosts}
        />
      }
    >
      <SavedSearches currentQuery={q} />
      <ExploreColumn
        initialQuery={q}
        initialTab={tab}
        discovery={discovery}
        officialBuilds={officialBuilds}
        userBuilds={userBuilds}
        blogPosts={blogPosts}
      />
    </PageLayout>
  );
}
