import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

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
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 40, windowMs: 60_000, prefix: 'hashtag-search' });
        if (!allowed) return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 });

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
    },
  },
});
