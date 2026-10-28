import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { getAllPosts } from '@/lib/blog';
import { renderRssFeed, type RssItem } from '@/lib/rss';
import { cachedSWR } from '@/lib/cached.server';

/**
 * /blog/rss.xml — RSS 2.0 feed of blog posts so readers/aggregators can
 * subscribe. Cached for an hour at the edge (stale-while-revalidate a day).
 *
 * The rendered XML is also held in the shared single-flight SWR cache: the
 * status probe (and any edge miss) otherwise ran a Postgres query per request,
 * and a slow one outlived the probe's 4s timeout and paged oncall. Fresh for
 * five minutes, then served stale for up to an hour while one background
 * refresh runs; a failed refresh keeps the last good feed.
 */
const FEED_CACHE = { ttlMs: 5 * 60_000, swrMs: 60 * 60_000, l2: false };

async function buildFeed(): Promise<string> {
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

  return renderRssFeed({
    title: 'RMH Studios — Blog',
    link: `${SITE_URL}/blog`,
    feedUrl: `${SITE_URL}/blog/rss.xml`,
    description: 'Developer logs, updates, and stories from RMH Studios.',
    items,
  });
}

export const Route = createFileRoute('/blog/rss.xml')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const xml = await cachedSWR('blog:rss', FEED_CACHE, buildFeed);
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
