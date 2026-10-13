/**
 * /reading — "My reading": highlights & notes (L1), shelves (L7) and the yearly
 * reading challenge (L3). Private to the signed-in member, so not indexed.
 */

import { createFileRoute } from '@tanstack/react-router';
import { MyReadingPage } from '@/components/reading/MyReadingPage';
import { parseReadingTab } from '@/lib/reading/tabs';

export const Route = createFileRoute('/_site/reading/')({
  validateSearch: (search: Record<string, unknown>) => ({ tab: parseReadingTab(search.tab) }),
  head: () => ({
    meta: [{ title: 'My reading | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: ReadingRoute,
});

function ReadingRoute() {
  const { tab } = Route.useSearch();
  return <MyReadingPage tab={tab} />;
}
