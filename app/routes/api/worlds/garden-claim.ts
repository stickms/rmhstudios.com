import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { claimWaterings } from '@/lib/worlds/snapshots.server';

/** POST /api/worlds/garden-claim — collect waterings friends gave since last load. */
export const Route = createFileRoute('/api/worlds/garden-claim')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'write' }, async ({ userId }) =>
        Response.json({ count: await claimWaterings(userId) }),
      ),
    },
  },
});
