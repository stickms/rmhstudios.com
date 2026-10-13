/**
 * /news/stories/$slug — a news story timeline (L5): related articles clustered
 * into one dated sequence by an admin, with auto-suggested candidates found by
 * tag overlap and (when configured) embeddings.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { StoryTimeline } from '@/components/reading/StoryTimeline';
import { getStoryPage } from '@/lib/reading/stories.server';
import { buildCanonical, buildMeta } from '@/lib/seo';

const fetchStory = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const story = await getStoryPage(slug);
    if (!story) throw notFound();
    return story;
  });

export const Route = createFileRoute('/_site/news/stories/$slug')({
  loader: ({ params }) => fetchStory({ data: params.slug }),
  head: ({ loaderData, params }) => ({
    meta: buildMeta({
      title: `${loaderData?.title ?? 'Story'} | RMH News`,
      description: loaderData?.summary || 'A timeline of related stories from RMH News.',
      path: `/news/stories/${params.slug}`,
    }),
    links: [buildCanonical(`/news/stories/${params.slug}`)],
  }),
  component: StoryPage,
});

function StoryPage() {
  const story = Route.useLoaderData();
  return <StoryTimeline story={story} />;
}
