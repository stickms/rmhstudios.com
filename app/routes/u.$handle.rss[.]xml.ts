/**
 * GET /u/{handle}/rss.xml — a user's public posts, as RSS 2.0.
 *
 * Visibility is decided by `userFeedItems`, which shares its predicate with the
 * tag feed: PUBLIC audience only, nothing deleted, nothing paywalled, no
 * community posts. A feed has no viewer, so nothing relationship-dependent can
 * be included.
 */

import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { renderRssFeed } from '@/lib/rss';
import { userFeedItems } from '@/lib/feed/rss.server';

const HANDLE_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;

// A server route answers its own 404: `notFound()` is for the router's render path, and thrown from a
// server handler it reaches the client as a 500.
const NOT_FOUND = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export const Route = createFileRoute('/u/$handle/rss.xml')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const handle = params.handle.replace(/^@/, '');
        if (!HANDLE_PATTERN.test(handle)) return NOT_FOUND();

        const feed = await userFeedItems(handle);
        // 404 rather than an empty feed: a silent feed for a handle that never
        // existed is indistinguishable from one for an account with no posts.
        if (!feed) return NOT_FOUND();

        const xml = renderRssFeed({
          title: `${feed.displayName} — RMH Studios`,
          link: `${SITE_URL}/u/${handle}`,
          feedUrl: `${SITE_URL}/u/${handle}/rss.xml`,
          description: `Public posts by ${feed.displayName} on RMH Studios.`,
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
