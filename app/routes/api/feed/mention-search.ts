import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { cached } from '@/lib/cached.server';
import { mentionSearchApi } from '@/lib/feed/feed-reads.contract';
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
      GET: implement(
        mentionSearchApi,
        {
          auth: 'optional',
          rateLimit: {
            limit: 40,
            windowMs: 60_000,
            prefix: 'mention-search',
            message: 'Rate limited',
          },
          // A missing or non-string `q` is the empty query (the default suggestions), not a 400.
          query: z.object({ q: z.string().trim().catch('') }),
        },
        async ({ userId, query }) => {
          const q = query.q;
          const viewerId = userId ?? undefined;

          // perf: autocomplete fires per keystroke; a ~30s per-(viewer,q) cache
          // absorbs repeat prefixes/backspacing. Cost: follow-graph changes take
          // up to 30s to affect ranking.
          const users = await cached(
            `mention-search:${viewerId ?? 'anon'}:${q.toLowerCase()}`,
            30_000,
            () => searchMentionUsers(q, viewerId),
          );

          return { users };
        },
      ),
    },
  },
});
