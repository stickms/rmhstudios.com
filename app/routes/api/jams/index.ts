import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { createJam, listJams } from '@/lib/competitive/jams.server';

const createSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(1).max(1000),
  theme: z.string().trim().min(1).max(120),
  startsAt: z.coerce.date(),
  submitEndsAt: z.coerce.date(),
  ratingEndsAt: z.coerce.date(),
});

/**
 * GET  /api/jams — recent jams (theme withheld until each starts).
 * POST /api/jams — admin: create a jam.
 */
export const Route = createFileRoute('/api/jams/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async () => {
        return Response.json(
          { jams: await listJams() },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: createSchema },
        async ({ userId, body }) => {
          const res = await createJam(userId, body);
          if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
          return Response.json({ slug: res.slug }, { status: 201 });
        },
      ),
    },
  },
});
