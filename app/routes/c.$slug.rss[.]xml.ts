/**
 * GET /c/{slug}/rss.xml — the newest posts of a public community, as RSS 2.0.
 *
 * Visibility is decided by `communityFeed` (the strict public predicate); a private or unknown community is a 404,
 * never a 403, so the feed does not confirm that a private community exists.
 */

import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { renderRssFeed } from '@/lib/rss';
import { COMMUNITY_SLUG_PATTERN, communityFeed } from '@/lib/feed/rss-community.server';

// A server route answers its own 404: `notFound()` is for the router's render path, and thrown from a
// server handler it reaches the client as a 500.
const NOT_FOUND = () =>
  new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export const Route = createFileRoute('/c/$slug/rss.xml')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!COMMUNITY_SLUG_PATTERN.test(params.slug)) return NOT_FOUND();
        const feed = await communityFeed(params.slug);
        if (!feed) return NOT_FOUND();

        const xml = renderRssFeed({
          title: feed.title,
          link: feed.link,
          feedUrl: `${SITE_URL}/c/${params.slug}/rss.xml`,
          description: feed.description,
          items: feed.items,
        });

        return new Response(xml, {
          status: 200,
          headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
          },
        });
      },
    },
  },
});
