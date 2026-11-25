import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { parseAskSearch } from '@features/medschools/engine/search';
import { AskPage } from '@features/medschools/ui/AskPage';

/**
 * /med/ask: ask a question about the public data. Private (noindex, not in the sitemap or the Services hub),
 * signed in only. There is no loader: nothing is fetched until a member asks, and `?q=` only fills the field.
 */
export const Route = createFileRoute('/med/ask')({
  head: definePage({
    path: '/med/ask',
    title: 'Ask the data | RMH Med Schools',
    description: 'Ask a question about med school admissions data. Answers cite the rows they use.',
    noIndex: true,
  }),
  validateSearch: parseAskSearch,
  component: AskPage,
});
