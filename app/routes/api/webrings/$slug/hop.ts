import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { ringSlugSchema } from '@/lib/profile/webrings';
import { randomRingHop } from '@/lib/profile/webrings.server';

/**
 * GET /api/webrings/$slug/hop?from=<userId> — the "random" button on a ring
 * strip (P6). 302s to a random eligible member's profile (never `from` itself,
 * never someone deleted, banned or blocked either way with the viewer). If
 * nobody else is eligible it sends the visitor back to the ring page.
 */
const hopQuery = z.object({ from: z.string().min(1).max(64) });

export const Route = createFileRoute('/api/webrings/$slug/hop')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: hopQuery, etag: false },
        async ({ params, query, userId }) => {
          const slug = ringSlugSchema.safeParse(params.slug);
          if (!slug.success) return new Response('Not found', { status: 404 });
          const target = await randomRingHop(slug.data, query.from, userId);
          const location = target
            ? `/u/${encodeURIComponent(target.handle ?? target.id)}`
            : `/rings/${slug.data}`;
          return new Response(null, {
            status: 302,
            headers: { Location: location, 'Cache-Control': 'private, no-store' },
          });
        },
      ),
    },
  },
});
