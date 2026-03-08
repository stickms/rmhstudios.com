/**
 * News Index Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getAllNewsArticles, getFeaturedNewsArticles } from '@/lib/news';
import { NewsPageContent } from '@/components/news/NewsPageContent';

const fetchNews = createServerFn({ method: 'GET' }).handler(async () => {
  const articles = await getAllNewsArticles();
  const featured = await getFeaturedNewsArticles();
  return { articles, featured };
});

export const Route = createFileRoute('/_site/news/')({
  head: () => ({
    meta: [
      { title: 'News | RMH Studios' },
      { name: 'description', content: 'Curated news and commentary on AI, gaming, neuroscience, tech, science, and culture from RMH Studios.' },
    ],
  }),
  loader: () => fetchNews(),
  component: NewsPage,
});

function NewsPage() {
  const { articles, featured } = Route.useLoaderData();

  return <NewsPageContent articles={articles} featured={featured} />;
}
