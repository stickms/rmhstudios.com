import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { cached } from '@/lib/cached.server';
import { searchMentionUsers } from '@/lib/feed/mention-search.server';

/**
 * Viewer-aware user suggestions for `@mention` autocomplete.
 *
 * Ranking: mutual follows ("friends") first, then accounts the viewer follows,
 * then everyone else — so the people you actually talk to surface before
 * strangers. Only users with a `handle` are returned, since a mention needs one.
 * An empty query returns the viewer's friends/following as default suggestions.
 */
export const Route = createFileRoute('/api/feed/mention-search')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: {
            limit: 40,
            windowMs: 60_000,
            prefix: 'mention-search',
            message: 'Rate limited',
          },
        },
        async ({ request }) => {
          const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';

          const session = await auth.api.getSession({ headers: request.headers });
          const viewerId = session?.user?.id;

          // perf: autocomplete fires per keystroke; a ~30s per-(viewer,q) cache
          // absorbs repeat prefixes/backspacing. Cost: follow-graph changes take
          // up to 30s to affect ranking.
          const users = await cached(
            `mention-search:${viewerId ?? 'anon'}:${q.toLowerCase()}`,
            30_000,
            () => searchMentionUsers(q, viewerId),
          );

          return Response.json({ users });
        },
      ),
    },
  },
});
