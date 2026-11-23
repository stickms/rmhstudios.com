/**
 * RMH News — /news: the front page of headlines pulled from public feeds every 20 minutes (lib/news-wire/), newest
 * first, one category at a time (`?category=`), with a search (`?q=`) and plain pages (`?page=`).
 *
 * Every filter is in the URL and every tab is a link, so the page is complete with scripting off and each view is
 * crawlable and shareable. Opening a story goes to /news/$slug, where its summary is written on first open.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getNewsFront, NEWS_PAGE_SIZE } from '@/lib/news';
import { isNewsCategory, type NewsCategory } from '@/lib/news-wire/categorize';
import { NEWS_FRONT_TAG } from '@/lib/news-wire/sources';
import { cached } from '@/lib/cached.server';
import { NewsFront } from '@/components/news/NewsFront';
import { buildCanonical, buildMeta, SITE_URL } from '@/lib/seo';

export interface NewsSearch {
  category?: NewsCategory;
  q?: string;
  page?: number;
}

const fetchFront = createServerFn({ method: 'GET' })
  .validator((input: NewsSearch) => input)
  .handler(async ({ data }) => {
    const query = { category: data.category, q: data.q, page: data.page ?? 1 };
    // The unsearched views are the same for every reader and change once per ingest, which drops the tag. A search
    // goes straight to the replica: its keys are unbounded and each is read once.
    const result = query.q
      ? await getNewsFront(query)
      : await cached(`news:front:${query.category ?? 'all'}:${query.page}`, 60_000, () => getNewsFront(query), {
          tags: [NEWS_FRONT_TAG],
        });
    return { ...result, page: query.page, pageSize: NEWS_PAGE_SIZE };
  });

export const Route = createFileRoute('/_site/news/')({
  validateSearch: (search: Record<string, unknown>): NewsSearch => {
    const out: NewsSearch = {};
    if (isNewsCategory(search.category)) out.category = search.category;
    if (typeof search.q === 'string' && search.q.trim()) out.q = search.q.trim().slice(0, 100);
    const page = Number(search.page);
    if (Number.isInteger(page) && page > 1 && page <= 50) out.page = page;
    return out;
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchFront({ data: deps }),
  head: ({ match }) => {
    const category = (match.search as NewsSearch).category;
    return {
      meta: buildMeta({
        title: category ? `${category} | RMH News` : 'RMH News | RMH Studios',
        description: category
          ? `The latest ${category.toLowerCase()} headlines, gathered from public news feeds and updated every 20 minutes.`
          : 'Headlines from BBC News, The Guardian, NPR, Ars Technica, NASA and more, sorted into topics and updated every 20 minutes.',
        path: category ? `/news?category=${encodeURIComponent(category)}` : '/news',
      }),
      links: [
        buildCanonical(category ? `/news?category=${encodeURIComponent(category)}` : '/news'),
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: 'RMH News',
          href: `${SITE_URL}/news/rss.xml`,
        },
      ],
    };
  },
  // The headlines change once per ingest: hold loader data 60s so going back to /news does not re-query.
  staleTime: 60_000,
  component: NewsPage,
});

function NewsPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return <NewsFront data={data} search={search} />;
}
