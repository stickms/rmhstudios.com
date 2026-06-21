import { createFileRoute } from '@tanstack/react-router';
import { SearchColumn } from '@/components/feed/SearchColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';

export const Route = createFileRoute('/_site/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || '',
  }),
  head: () => ({ meta: [{ title: 'Search | RMH Studios' }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  return (
    <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
      <SearchColumn initialQuery={q} />
    </AnimatedMain>
  );
}
