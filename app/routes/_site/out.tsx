import { createFileRoute } from '@tanstack/react-router';
import OutPage from '@/components/safety/OutPage';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/out')({
  validateSearch: (s: Record<string, unknown>): { url: string } => ({
    url: typeof s.url === 'string' ? s.url.slice(0, 2048) : '',
  }),
  head: () => noindexHead('Leaving RMH Studios'),
  component: OutRoute,
});

function OutRoute() {
  const { url } = Route.useSearch();
  return <OutPage url={url} />;
}
