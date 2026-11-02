import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { parseFeaturedStreams } from '@/lib/elections/streams';

/**
 * GET /api/elections/streams — the featured live streams for the watch panel, from
 * `ELECTIONS_STREAMS` (a JSON array of `{ "label": "…", "url": "https://…" }`). Only
 * entries that parse as an embeddable YouTube/Twitch link are returned. Configured
 * rather than hard-coded: live-stream URLs change every election and a stale one
 * is an empty box on the busiest night of the year.
 */
export const Route = createFileRoute('/api/elections/streams')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          cache: { visibility: 'public', maxAge: 60, sMaxAge: 300 },
        },
        async () => Response.json({ streams: parseFeaturedStreams(process.env.ELECTIONS_STREAMS) }),
      ),
    },
  },
});
