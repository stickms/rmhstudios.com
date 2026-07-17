/**
 * News Index Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getAllNewsArticles, getFeaturedNewsArticles } from '@/lib/news';
import { NewsPageContent } from '@/components/news/NewsPageContent';
import { SITE_URL } from '@/lib/seo';

const fetchNews = createServerFn({ method: 'GET' }).handler(async () => {
  // perf audit §4.2: fetch the two viewer-independent news lists in parallel
  // instead of a sequential await chain (2 RTT / 2 serial DB reads → 1).
  const [articles, featured] = await Promise.all([
    getAllNewsArticles(),
    getFeaturedNewsArticles(),
  ]);
  return { articles, featured };
});

export const Route = createFileRoute('/_site/news/')({
  head: () => ({
    meta: [
      { title: 'News | RMH Studios' },
      { name: 'description', content: 'Curated news and commentary on AI, gaming, neuroscience, tech, science, and culture from RMH Studios.' },
    ],
    links: [
      { rel: 'alternate', type: 'application/rss+xml', title: 'RMH Studios — News', href: `${SITE_URL}/news/rss.xml` },
    ],
  }),
  // News lists are viewer-independent and change infrequently; hold loader data
  // 60s so in-app navigations back to /news don't re-query (perf audit §4.2).
  staleTime: 60_000,
  loader: () => fetchNews(),
  component: NewsPage,
});

function NewsPage() {
  const { articles, featured } = Route.useLoaderData();

  return <NewsPageContent articles={articles} featured={featured} />;
}
