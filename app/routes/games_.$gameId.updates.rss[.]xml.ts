/**
 * GET /games/{gameId}/updates/rss.xml — a game's newest patch notes, as RSS 2.0.
 *
 * An id that is not a catalogue game played on this site is a 404.
 */

import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { renderRssFeed } from '@/lib/rss';
import { GAME_ID_PATTERN, updatesFeed } from '@/lib/arcade/updates-rss.server';

// A server route answers its own 404: `notFound()` is for the router's render path, and thrown from a
// server handler it reaches the client as a 500.
const NOT_FOUND = () =>
  new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export const Route = createFileRoute('/games_/$gameId/updates/rss.xml')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!GAME_ID_PATTERN.test(params.gameId)) return NOT_FOUND();
        const feed = await updatesFeed(params.gameId);
        if (!feed) return NOT_FOUND();

        const xml = renderRssFeed({
          title: feed.title,
          link: feed.link,
          feedUrl: `${SITE_URL}/games/${params.gameId}/updates/rss.xml`,
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
