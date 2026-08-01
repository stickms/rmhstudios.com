import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { SearchColumn } from '@/components/feed/SearchColumn';
import { SavedSearches } from '@/components/search/SavedSearches';
import { PageLayout } from '@/components/feed/PageLayout';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { getSidebarData } from '@/lib/sidebar-data';
import { isSearchTab, type SearchTab } from '@/lib/search/types';

const fetchSidebarData = createServerFn({ method: 'GET' }).handler(async () => {
  return getSidebarData();
});

export const Route = createFileRoute('/_site/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || '',
    // Tabs are declared once in lib/search/types so the page, the API and the
    // result renderer can never disagree about which corpora a tab covers.
    tab: isSearchTab(search.tab) ? search.tab : ('top' as SearchTab),
  }),
  loader: () => fetchSidebarData(),
  head: () => ({ meta: [{ title: 'Search | RMH Studios' }] }),
  component: SearchPage,
});

function SearchPage() {
  const { t } = useTranslation('site');
  const { q, tab } = Route.useSearch();
  const { officialBuilds, userBuilds, recommendedUsers, blogPosts } = Route.useLoaderData();

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
      <SearchColumn
        initialQuery={q}
        initialTab={tab}
        officialBuilds={officialBuilds}
        userBuilds={userBuilds}
        blogPosts={blogPosts}
      />
    </PageLayout>
  );
}
