import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { isTrackableTitle } from '@/lib/games/route-match';
import { recordHeartbeat } from '@/lib/playtime/playtime.server';
import { grantDueDrops } from '@/lib/cards/cards.server';
import type { GrantedDrop } from '@/lib/cards/types';

/**
 * POST /api/games/playtime — one playtime heartbeat for the title the caller has
 * open. The client sends about one every 30 s (see PlaytimeTracker); the server
 * decides what it is worth (`creditSeconds`), so a faster client earns nothing
 * extra.
 *
 * Its own rate-limit bucket, per user + IP: the shared `write` bucket is per IP,
 * and a school or office behind one address would exhaust it on heartbeats alone.
 */
export const Route = createFileRoute('/api/games/playtime')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            policy: 'write',
            scope: 'user',
            prefix: 'playtime-heartbeat',
            limit: 6,
            windowMs: 60_000,
          },
          body: z.object({ gameId: z.string().min(1).max(64) }),
        },
        async ({ userId, body }) => {
          if (!isTrackableTitle(body.gameId)) {
            return Response.json({ error: 'Unknown title' }, { status: 400 });
          }
          const beat = await recordHeartbeat(userId, body.gameId);
          // Trading-card drops ride on credited play. A failure here must never fail
          // the heartbeat: the drop is granted again by the next beat.
          let drops: GrantedDrop[] = [];
          if (beat.credited > 0) {
            try {
              drops = await grantDueDrops(userId, body.gameId);
            } catch (err) {
              console.error('[cards] grantDueDrops failed:', err);
            }
          }
          return Response.json({ ...beat, drops });
        },
      ),
    },
  },
});
