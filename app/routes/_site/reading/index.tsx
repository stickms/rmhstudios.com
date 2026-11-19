import { createFileRoute, redirect } from '@tanstack/react-router';
import { parseReadingTab } from '@/lib/reading/tabs';

/**
 * `/reading` → `/library?view=reading`.
 *
 * "My reading" (highlights, shelves, the reading challenge) became a view of the
 * library in the 2026-11-19 consolidation. This stays a route file rather than a
 * LEGACY_REDIRECTS row because it carries `?tab=` across, so an old
 * `/reading?tab=shelves` link still opens the shelves.
 */
export const Route = createFileRoute('/_site/reading/')({
  validateSearch: (search: Record<string, unknown>) => ({ tab: parseReadingTab(search.tab) }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/library',
      search: { view: 'reading', tab: search.tab },
      replace: true,
    });
  },
});
