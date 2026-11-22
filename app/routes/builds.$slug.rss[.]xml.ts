/**
 * GET /builds/{slug}/rss.xml — the releases of a public member build, as RSS 2.0.
 *
 * Visibility is decided by `buildFeed`: an unlisted, private or unpublished build, and an official build, is a 404.
 */

import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { renderRssFeed } from '@/lib/rss';
import { BUILD_SLUG_PATTERN, buildFeed } from '@/lib/builds/rss.server';

// A server route answers its own 404: `notFound()` is for the router's render path, and thrown from a
// server handler it reaches the client as a 500.
const NOT_FOUND = () =>
  new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export const Route = createFileRoute('/builds/$slug/rss.xml')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!BUILD_SLUG_PATTERN.test(params.slug)) return NOT_FOUND();
        const feed = await buildFeed(params.slug);
        if (!feed) return NOT_FOUND();

        const xml = renderRssFeed({
          title: feed.title,
          link: feed.link,
          feedUrl: `${SITE_URL}/builds/${params.slug}/rss.xml`,
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
