import { createFileRoute } from '@tanstack/react-router';
import { WikiContent, DEFAULT_WIKI_SLUG } from '@/components/developer/wiki';

export const Route = createFileRoute('/_site/developer/docs/')({
  head: () => ({ meta: [{ title: 'API Docs | RMH Studios' }] }),
  component: () => <WikiContent slug={DEFAULT_WIKI_SLUG} />,
});
