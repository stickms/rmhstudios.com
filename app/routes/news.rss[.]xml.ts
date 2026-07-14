import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { getAllNewsArticles } from '@/lib/news';
import { renderRssFeed, type RssItem } from '@/lib/rss';

/**
 * /news/rss.xml — RSS 2.0 feed of published news articles. Cached for an hour
 * at the edge (stale-while-revalidate a day).
 */
export const Route = createFileRoute('/news/rss.xml')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const articles = await getAllNewsArticles();
          const items: RssItem[] = articles.map((a) => ({
            title: a.title,
            link: `${SITE_URL}/news/${a.slug}`,
            guid: `${SITE_URL}/news/${a.slug}`,
            description: a.description,
            pubDate: a.date ? new Date(a.date) : undefined,
            categories: a.category ? [a.category] : undefined,
            imageUrl: a.image
              ? a.image.startsWith('http')
                ? a.image
                : `${SITE_URL}${a.image}`
              : undefined,
          }));

          const xml = renderRssFeed({
            title: 'RMH Studios — News',
            link: `${SITE_URL}/news`,
            feedUrl: `${SITE_URL}/news/rss.xml`,
            description: 'The latest news curated and published by RMH Studios.',
            items,
          });

          return new Response(xml, {
            headers: {
              'Content-Type': 'application/rss+xml; charset=utf-8',
              'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            },
          });
        } catch (error) {
          console.error('News RSS error:', error);
          return new Response('Internal Server Error', { status: 500 });
        }
      },
    },
  },
});
