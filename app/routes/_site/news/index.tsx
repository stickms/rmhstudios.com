/**
 * News Index Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { prisma } from '@/lib/prisma.server';
import type { NewsArticle } from '@/lib/news';
import { NewsPageContent } from '@/components/news/NewsPageContent';
import { buildCanonical, buildMeta, SITE_URL } from '@/lib/seo';

// The list, search, category tabs and hero read exactly these fields (see
// components/news/NewsList|NewsCard|NewsHero|NewsSourceBadge). The article BODY
// (`content`, several KB each) is read only by /news/$slug, so it must not ride
// in the serialized loader data of the index: it was serialized into the HTML
// for every article, twice for the featured ones.
const LIST_SELECT = {
  slug: true,
  title: true,
  date: true,
  description: true,
  category: true,
  tags: true,
  featured: true,
  sourcePublisher: true,
  sourceUrl: true,
} as const;

const fetchNews = createServerFn({ method: 'GET' }).handler(async () => {
  // One query, not two: the featured set is by definition the featured subset of
  // the published list, in the same `date desc` order. Filtering the first result
  // instead of re-querying keeps the two arrays identical to what the separate
  // `featured: true` query returned, and shares the object references so the
  // serializer emits each featured article once.
  const articles: Partial<NewsArticle>[] = await prisma.newsArticle.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { date: 'desc' },
    select: LIST_SELECT,
  });
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
