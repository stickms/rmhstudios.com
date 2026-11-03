import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getNews } from '@/lib/elections/news.server';
import { STATE_NAMES } from '@/lib/elections/states';

const query = z.object({ state: z.string().length(2).toUpperCase().optional() });

/**
 * GET /api/elections/news?state= — election headlines from public RSS feeds (NPR, PBS, Politico, the
 * Guardian, BBC, CBS, ABC, NBC, The Hill and Google News), newest first, each linking to its publisher.
 * Headline + snippet only. Cached 30 s on election night, 5 min otherwise.
 */
export const Route = createFileRoute('/api/elections/news')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          query,
          cache: { visibility: 'public', maxAge: 20, sMaxAge: 30 },
          etag: false,
          microCache: false,
          label: 'elections.news',
        },
        async ({ query: q }) => {
          if (q.state && !STATE_NAMES[q.state]) return Response.json({ error: 'Unknown state' }, { status: 400 });
          return Response.json(await getNews(q.state ?? null));
        },
      ),
    },
  },
});
