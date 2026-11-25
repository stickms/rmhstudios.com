import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { BuilderPage } from '@features/medschools/ui/builder/BuilderPage';

/**
 * /med/lists/build: the AI school-list builder (phase D). Private (noindex, not in the sitemap), signed in only. There
 * is no loader: nothing is fetched or sent until the member asks, and nothing is kept unless they save the list.
 */
export const Route = createFileRoute('/med/lists_/build')({
  head: definePage({
    path: '/med/lists/build',
    title: 'Build a list | RMH Studios',
    description: 'Build a private list of medical schools from published class figures.',
    noIndex: true,
  }),
  component: BuilderPage,
});
