import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { rssItems } from '@/lib/dunesday/feed';
import { FEED_ID } from '@/lib/dunesday/sync-schema';
import { feedContext, loadFeed } from '@/lib/dunesday/sync.server';
import { renderRssFeed } from '@/lib/rss';
import { SITE_URL } from '@/lib/seo';

/**
 * GET /api/dunesday/feeds/:feedId/rss.xml — tonight's lineup plus everything
 * ticked off, for feed readers (and RSS-to-anything bridges). Public by feed
 * id, like the calendar.
 */
export const Route = createFileRoute('/api/dunesday/feeds/$feedId/rss.xml')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          cache: { visibility: 'public', maxAge: 600, sMaxAge: 600, staleWhileRevalidate: 3600 },
        },
        async ({ params }) => {
          if (!FEED_ID.test(params.feedId)) return new Response('Not found', { status: 404 });
          const row = await loadFeed(params.feedId);
          if (!row) return new Response('Not found', { status: 404 });
          const xml = renderRssFeed({
            title: 'Dunesday Marathon',
            link: `${SITE_URL}/dunesday`,
            feedUrl: `${SITE_URL}/api/dunesday/feeds/${row.feedId}/rss.xml`,
            description:
              'Tonight’s lineup and progress toward Avengers: Doomsday and Dune: Part Three.',
            items: rssItems(feedContext(row)),
          });
          return new Response(xml, {
            headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
          });
        },
      ),
    },
  },
});
