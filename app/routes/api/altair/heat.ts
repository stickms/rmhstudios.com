import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { maxUnlockedHeat } from '@/lib/altair/solo/heat.server';
import { HEAT_MAX } from '@/lib/altair/data/heat';

/**
 * GET — the highest Heat tier this account may start, from the server's ledger of verified victories.
 * Signed-out visitors get 0: Heat runs are server-issued and replay-verified, so they need an account.
 */
export const Route = createFileRoute('/api/altair/heat')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) => {
        const unlocked = userId ? await maxUnlockedHeat(userId) : 0;
        return Response.json({ unlocked, max: HEAT_MAX });
      }),
    },
  },
});
