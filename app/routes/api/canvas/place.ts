import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { placePixel } from '@/lib/canvas/canvas.server';
import { placePixelSchema } from '@/lib/canvas/schema';

/** POST /api/canvas/place — place one pixel; the per-member cooldown is enforced in the DB (Z5). */
export const Route = createFileRoute('/api/canvas/place')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'canvas-place' },
          body: placePixelSchema,
        },
        async ({ userId, body }) => {
          const r = await placePixel(userId, body);
          if (!r.ok) {
            return Response.json({ error: r.error, nextAt: r.nextAt }, { status: r.status });
          }
          return Response.json({ nextAt: r.nextAt });
        },
      ),
    },
  },
});
