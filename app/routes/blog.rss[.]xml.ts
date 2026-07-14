import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { getAllPosts } from '@/lib/blog';
import { renderRssFeed, type RssItem } from '@/lib/rss';

/**
 * /blog/rss.xml — RSS 2.0 feed of blog posts so readers/aggregators can
 * subscribe. Cached for an hour at the edge (stale-while-revalidate a day).
 */
export const Route = createFileRoute('/blog/rss.xml')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const posts = await getAllPosts(['slug', 'title', 'date', 'description', 'image', 'tags']);
          const items: RssItem[] = posts.map((p) => {
            const image = typeof p.image === 'string' ? p.image : undefined;
            return {
              title: String(p.title ?? ''),
              link: `${SITE_URL}/blog/${p.slug}`,
              guid: `${SITE_URL}/blog/${p.slug}`,
              description: String(p.description ?? ''),
              pubDate: p.date ? new Date(String(p.date)) : undefined,
              categories: Array.isArray(p.tags) ? (p.tags as string[]) : undefined,
              imageUrl: image ? (image.startsWith('http') ? image : `${SITE_URL}${image}`) : undefined,
            };
          });

          const xml = renderRssFeed({
            title: 'RMH Studios — Blog',
            link: `${SITE_URL}/blog`,
            feedUrl: `${SITE_URL}/blog/rss.xml`,
            description: 'Developer logs, updates, and stories from RMH Studios.',
            items,
          });

          return new Response(xml, {
            headers: {
              'Content-Type': 'application/rss+xml; charset=utf-8',
              'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            },
          });
        } catch (error) {
          console.error('Blog RSS error:', error);
          return new Response('Internal Server Error', { status: 500 });
        }
      },
    },
  },
});
