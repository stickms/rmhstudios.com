import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { claimAdventDoor, getAdventState } from '@/lib/gifting/advent.server';

/** Advent calendar (G2): GET the caller's doors, POST to open today's. */
export const Route = createFileRoute('/api/advent/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await getAdventState(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
      POST: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'advent-claim' } },
        async ({ userId }) => {
          const res = await claimAdventDoor(userId);
          if (!res.ok) {
            const status = res.error === 'failed' ? 500 : 409;
            return Response.json({ error: res.error }, { status });
          }
          return Response.json(res);
        },
      ),
    },
  },
});
