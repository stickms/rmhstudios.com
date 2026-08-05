import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { articleTakeaways, isAITextConfigured } from '@/lib/ai/text.server';

/**
 * GET /api/ai/takeaways?slug=… — "key takeaways" bullets for a devlog post.
 *
 * Generated on first request and then served from `apiCache` for half a day.
 * A devlog is written once and read many times, so this is close to a static
 * asset with an expensive first render: the cache key carries the post's
 * `updatedAt`, which means editing a post silently invalidates its takeaways
 * instead of leaving a stale summary of an older draft in front of readers.
 *
 * Deliberately open to signed-out readers (`auth: 'optional'`) — the article
 * itself is public, and a summary gated behind login would be a worse page for
 * the exact visitor most likely to be deciding whether to read it. The AI rate
 * limit plus the cache bound what that costs; the set of slugs is finite.
 */
const query = z.object({ slug: z.string().min(1).max(200) });

const TTL_MS = 12 * 60 * 60_000;
/** Below this, a post is already its own summary. */
const MIN_CONTENT_CHARS = 1200;

export const Route = createFileRoute('/api/ai/takeaways')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'ai', query }, async ({ query }) => {
        const post = await prisma.blogPost.findUnique({
          where: { slug: query.slug },
          select: { title: true, content: true, updatedAt: true },
        });
        if (!post) return Response.json({ error: 'Not found' }, { status: 404 });

        if (post.content.length < MIN_CONTENT_CHARS) return Response.json({ takeaways: [] });

        const key = `ai:takeaways:${query.slug}:${post.updatedAt.getTime()}`;
        const cached = apiCache.get<string[]>(key);
        if (cached) return Response.json({ takeaways: cached });

        if (!isAITextConfigured()) return Response.json({ takeaways: [] });

        const takeaways = await articleTakeaways({ title: post.title, content: post.content });
        // Only a real result is cached. Caching `[]` would pin a transient
        // upstream failure to this post for the next twelve hours.
        if (takeaways.length > 0) apiCache.set(key, takeaways, TTL_MS);

        return Response.json({ takeaways });
      }),
    },
  },
});
