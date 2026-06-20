import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Hashtag suggestions for `#tag` autocomplete.
 *
 * We don't maintain a tag table, so suggestions are derived on the fly from the
 * content of recent RMHarks: pull a bounded window of recent posts whose text
 * contains the typed prefix, extract every `#tag`, tally frequency, and return
 * the most-used matching tags. An empty query returns the currently trending
 * tags across the recent window.
 */
const HASHTAG_REGEX = /#(\w{1,50})/g;
const SCAN_LIMIT = 300;

export const Route = createFileRoute('/api/feed/hashtag-search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 40, windowMs: 60_000, prefix: 'hashtag-search' });
        if (!allowed) return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 });

        const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() ?? '';

        const posts = await prisma.rMHark.findMany({
          where: {
            deletedAt: null,
            content: { contains: q ? `#${q}` : '#', mode: 'insensitive' },
          },
          select: { content: true },
          orderBy: { createdAt: 'desc' },
          take: SCAN_LIMIT,
        });

        // Tally hashtags, preserving the first-seen casing for display.
        const counts = new Map<string, { tag: string; count: number }>();
        for (const post of posts) {
          for (const match of post.content.matchAll(HASHTAG_REGEX)) {
            const tag = match[1];
            const key = tag.toLowerCase();
            if (q && !key.startsWith(q)) continue;
            const existing = counts.get(key);
            if (existing) existing.count += 1;
            else counts.set(key, { tag, count: 1 });
          }
        }

        const tags = [...counts.values()]
          .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
          .slice(0, 15);

        return Response.json({ tags });
      },
    },
  },
});
