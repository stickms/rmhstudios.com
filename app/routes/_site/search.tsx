import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { SearchColumn } from '@/components/feed/SearchColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { getSidebarData } from '@/lib/sidebar-data';

const fetchSidebarData = createServerFn({ method: 'GET' }).handler(async () => {
  return getSidebarData();
});

const SEARCH_TABS = ['top', 'people', 'posts', 'builds', 'blog'] as const;
type SearchTab = (typeof SEARCH_TABS)[number];

export const Route = createFileRoute('/_site/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || '',
    tab: SEARCH_TABS.includes(search.tab as SearchTab) ? (search.tab as SearchTab) : 'top',
  }),
  loader: () => fetchSidebarData(),
  head: () => ({ meta: [{ title: 'Search | RMH Studios' }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q, tab } = Route.useSearch();
  const { officialBuilds, userBuilds, recommendedUsers, blogPosts } = Route.useLoaderData();

  return (
    <>
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <SearchColumn
          initialQuery={q}
          initialTab={tab}
          officialBuilds={officialBuilds}
          userBuilds={userBuilds}
          blogPosts={blogPosts}
        />
      </AnimatedMain>

      {/* Right Sidebar - hidden below lg, scrolls with page */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          officialBuilds={officialBuilds}
          userBuilds={userBuilds}
          recommendedUsers={recommendedUsers}
          blogPosts={blogPosts}
        />
      </aside>
    </>
  );
}
