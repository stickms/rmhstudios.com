/**
 * News Index Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getNewsIndexArticles } from '@/lib/news';
import { NewsPageContent } from '@/components/news/NewsPageContent';
import { buildCanonical, buildMeta, SITE_URL } from '@/lib/seo';

const fetchNews = createServerFn({ method: 'GET' }).handler(async () => {
  // One query, not two: the featured set is by definition the featured subset of
  // the published list, in the same `date desc` order, so it is filtered from the
  // first result (sharing object references, which the serializer emits once).
  // The shared helper owns the lean select (no article body: it is read only by
  // /news/$slug and would be serialized into the HTML for every article) and
  // reads from the replica.
  const articles = await getNewsIndexArticles();
  return { articles, featured: articles.filter((a) => a.featured) };
});

export const Route = createFileRoute('/_site/news/')({
  head: () => ({
    meta: buildMeta({
      title: 'News | RMH Studios',
      description:
        'Curated news and commentary on AI, gaming, neuroscience, tech, science, and culture from RMH Studios.',
      path: '/news',
    }),
    links: [
      buildCanonical('/news'),
      {
        rel: 'alternate',
        type: 'application/rss+xml',
        title: 'RMH Studios — News',
        href: `${SITE_URL}/news/rss.xml`,
      },
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
