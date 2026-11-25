/**
 * /news/stories — the index of news stories (s13-12): stories with at least one published article, newest activity
 * first, 30 a page. Public; unfurls as itself (its own section card).
 */
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { StoriesIndex } from '@/components/reading/StoriesIndex';
import { listPublicStories } from '@/lib/reading/stories.server';
import { buildCanonical, buildMeta } from '@/lib/seo';

const fetchStories = createServerFn({ method: 'GET' }).handler(async () => listPublicStories(null));

export const Route = createFileRoute('/_site/news/stories/')({
  loader: () => fetchStories(),
  head: () => ({
    meta: buildMeta({
      title: 'Stories | RMH News',
      description: 'Running stories from RMH News: related articles kept together on one dated timeline.',
      path: '/news/stories',
    }),
    links: [buildCanonical('/news/stories')],
  }),
  staleTime: 60_000,
  component: StoriesPage,
});

function StoriesPage() {
  return <StoriesIndex initial={Route.useLoaderData()} />;
}
