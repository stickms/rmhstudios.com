/**
 * Blog Index Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getAllPosts } from '@/lib/blog';
import { BlogPageContent } from '@/components/blog/BlogPageContent';

const fetchPosts = createServerFn({ method: 'GET' }).handler(async () => {
  return getAllPosts(['title', 'date', 'slug', 'description', 'image', 'tags']);
});

export const Route = createFileRoute('/_site/blog/')({
  head: () => ({
    meta: [
      { title: 'Devlog | RMH Studios' },
      { name: 'description', content: 'Behind the scenes of our game development journey.' },
    ],
  }),
  loader: () => fetchPosts(),
  component: BlogIndexPage,
});

function BlogIndexPage() {
  const posts = Route.useLoaderData();

  return <BlogPageContent posts={posts} />;
}
