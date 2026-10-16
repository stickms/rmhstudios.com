import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { createFriendly, listFriendly } from '@/lib/competitive/friendly.server';

const schema = z.object({
  game: z.string().max(40),
  opponent: z.string().min(1).max(64),
  handicap: z.boolean().default(false),
});

/**
 * GET  /api/friendly — the caller's open friendly challenges.
 * POST /api/friendly — send an unranked challenge, optionally with an Elo-gap handicap.
 */
export const Route = createFileRoute('/api/friendly/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { challenges: await listFriendly(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler({ rateLimit: 'write', body: schema }, async ({ userId, user, body }) => {
        const res = await createFriendly(userId, user.name ?? null, body);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ id: res.id }, { status: 201 });
      }),
    },
  },
});
