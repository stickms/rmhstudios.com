import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getElectionStreamsApi } from '@/lib/elections/elections.contract';
import { mergeStreams, parseFeaturedStreams } from '@/lib/elections/streams';
import { getAutoStreams } from '@/lib/elections/stream-discovery.server';

/**
 * GET /api/elections/streams — the featured live streams for the watch panel, from
 * `ELECTIONS_STREAMS` (a JSON array of `{ "label": "…", "url": "https://…" }`). Only
 * entries that parse as an embeddable YouTube/Twitch link are returned. Configured
 * rather than hard-coded: live-stream URLs change every election and a stale one
 * is an empty box on the busiest night of the year. On top of those, newsroom broadcasts that are live
 * right now are discovered automatically (`stream-discovery.server.ts`), so nobody has to find a link.
 */
export const Route = createFileRoute('/api/elections/streams')({
  server: {
    handlers: {
      GET: implement(getElectionStreamsApi, 
        {
          auth: 'none',
          rateLimit: 'read',
          cache: { visibility: 'public', maxAge: 60, sMaxAge: 300 },
        },
        async () =>
          Response.json({
            streams: mergeStreams(
              parseFeaturedStreams(process.env.ELECTIONS_STREAMS),
              await getAutoStreams(),
            ),
          }),
      ),
    },
  },
});
