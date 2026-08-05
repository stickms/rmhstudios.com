import { createFileRoute, redirect } from '@tanstack/react-router';
import { isSearchTab, type SearchTab } from '@/lib/search/types';

/**
 * `/search` → `/explore`.
 *
 * The two pages were merged (see `_site/explore.tsx`). This stays as a redirect
 * rather than being deleted: saved searches, shared links, the browser's own
 * history and any external link to a results page all point here, and `q`/`tab`
 * are validated and carried across so the redirect lands on the same view the
 * URL asked for.
 */
export const Route = createFileRoute('/_site/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || '',
    tab: isSearchTab(search.tab) ? search.tab : ('top' as SearchTab),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/explore', search: { q: search.q, tab: search.tab }, replace: true });
  },
});
