import { createFileRoute } from '@tanstack/react-router';
import PileOnPage from '@/components/safety/PileOnPage';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/safety/pile-on')({
  validateSearch: (s: Record<string, unknown>): { post: string } => ({
    post: typeof s.post === 'string' ? s.post.slice(0, 40) : '',
  }),
  head: () => noindexHead('Replies on your post'),
  component: PileOnRoute,
});

function PileOnRoute() {
  const { post } = Route.useSearch();
  return <PileOnPage postId={post} />;
}
