import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { universalSearch } from '@/lib/search/universal.server';
import { isSearchTab, type SearchTab } from '@/lib/search/types';

/**
 * `type` values from before universal search landed. Kept so an older client
 * bundle (or a bookmarked URL) keeps working across a deploy.
 */
const LEGACY_TYPE_TO_TAB: Record<string, SearchTab> = {
  all: 'top',
  people: 'people',
  posts: 'posts',
  builds: 'builds',
  blog: 'blog',
};

function resolveTab(params: URLSearchParams): SearchTab {
  const tab = params.get('tab');
  if (isSearchTab(tab)) return tab;
  const legacy = params.get('type');
  return (legacy && LEGACY_TYPE_TO_TAB[legacy]) || 'top';
}

/**
 * GET /api/search?q=…&tab=top|people|posts|builds|blog|library|places
 *
 * Universal search across every corpus the site has: people, posts, user
 * builds, blog posts, news articles, library documents, and the static catalog
 * of games, apps and destination pages.
 *
 * Response carries three views of the same result set:
 *   - `people`/`posts`/`builds`/`blog` — the original arrays, unchanged shapes.
 *   - `groups` — every kind, each sorted by score.
 *   - `top` — the ranked cross-corpus mix, plus `meta.confidence`.
 *
 * `assist=1` permits a model-assisted retry, which only fires when the lexical
 * pass came back weak (see lib/search/expand.server.ts). Latency-sensitive
 * callers omit it.
 *
 * Signed-out callers are answered too, but only from the static catalog
 * (games, apps, destination pages): an in-memory scan with no DB or model cost.
 * This used to 401 them, and every surface rendered the 401 as "No results" —
 * so a visitor typing a game's exact name on /explore was told it did not
 * exist. People, posts and the document corpora still need a session (they
 * run several DB scans and bypass the anonymous page cache), and the
 * model-assisted retry never runs for a signed-out search. Rate-limited per IP.
 */
export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, userId }) => {
        const { allowed } = await checkRateLimit(getClientIp(request), {
          limit: 60,
          windowMs: 60_000,
          prefix: 'search',
        });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        const params = new URL(request.url).searchParams;
        const q = params.get('q')?.trim() ?? '';
        const tab = resolveTab(params);

        if (q.length < 2) {
          return Response.json({
            people: [],
            posts: [],
            builds: [],
            blog: [],
            top: [],
            groups: {},
            meta: { normalized: '', topScore: 0, confidence: 'low', total: 0 },
          });
        }

        try {
          const results = await universalSearch({
            query: q.slice(0, 200),
            tab,
            viewerId: userId,
            signedIn: Boolean(userId),
            assist: Boolean(userId) && params.get('assist') === '1',
          });
          return Response.json(results);
        } catch (error) {
          console.error('Search error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      }),
    },
  },
});
