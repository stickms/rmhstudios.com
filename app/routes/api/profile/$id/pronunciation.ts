import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { readPronunciation } from '@/lib/profile/plus.server';

/**
 * GET /api/profile/$id/pronunciation — stream a member's pronunciation clip (P3).
 * The URL carries the object's version (`?v=`), so a replaced clip is a new URL
 * and the response can be cached immutably. `$id` is the user id.
 */
export const Route = createFileRoute('/api/profile/$id/pronunciation')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read', etag: false }, async ({ params }) => {
        const clip = await readPronunciation(params.id);
        if (!clip) return new Response('Not found', { status: 404 });
        return new Response(new Uint8Array(clip.body), {
          headers: {
            'Content-Type': clip.contentType,
            'Content-Length': String(clip.body.length),
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }),
    },
  },
});
