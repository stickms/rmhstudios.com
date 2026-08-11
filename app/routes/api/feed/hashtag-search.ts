import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

/**
 * Hashtag suggestions for `#tag` autocomplete.
 *
 * Backed by the normalized `hashtag` registry (populated at write time from post
 * content — see lib/tags-extract.server.ts), so a suggestion is an indexed
 * prefix lookup ordered by the denormalized `postCount` instead of scanning the
 * content of hundreds of recent RMHarks with `ILIKE '%#tag%'` and re-tallying on
 * every keystroke. An empty query returns the currently trending tags.
 */
export const Route = createFileRoute('/api/feed/hashtag-search')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: {
            limit: 40,
            windowMs: 60_000,
            prefix: 'hashtag-search',
            message: 'Rate limited',
          },
          // Hashtag typeahead: viewer-independent (tags are global), keyed by the
          // `?q=` prefix in the URL. This is the shape that benefits most from an
          // edge cache — one request per keystroke, and the popular prefixes are
          // hit by everyone. Short window because a new post can create a tag.
          cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
        },
        async ({ request }) => {
          const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() ?? '';

          // Tags are stored normalized (lowercased, no leading '#'), so the typed
          // prefix matches directly. Popularity order comes from the indexed
          // postCount column (hashtag_postCount_idx).
          const rows = await prisma.hashtag.findMany({
            where: q ? { tag: { startsWith: q } } : {},
            orderBy: { postCount: 'desc' },
            take: 15,
            select: { tag: true, postCount: true },
          });

          const tags = rows.map((r) => ({ tag: r.tag, count: r.postCount }));
          return Response.json({ tags });
        },
      ),
    },
  },
});
