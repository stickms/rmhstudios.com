import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { defineHandler } from '@/lib/api/handler.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { archivableBytes, archiveCandidates, takeDownSong } from '@/lib/slice-it/library.server';

/**
 * L9 / L12 — take a song down, and see what storage could be reclaimed.
 *
 * The takedown is the load-bearing half. It **tombstones rather than deletes**:
 * `SongLeaderboard` cascades on song deletion, so removing the row for a DMCA
 * claim silently erases every score anyone ever set on that track — a
 * punishment aimed at one uploader that lands on hundreds of players. The row,
 * its charts and every score survive; the audio object goes, because that is
 * what the claim is actually about.
 *
 * The archive view is read-only on purpose. "Nobody played it in six months" is
 * a claim about `SongPlay`, which is only written for signed-in players, so
 * acting on it automatically would archive songs anonymous visitors play
 * constantly.
 */
const BodyZ = z.object({
  songId: z.string().min(1).max(64),
  reason: z.string().trim().min(1).max(500),
});

const QueryZ = z.object({
  months: z.coerce.number().int().min(1).max(60).default(6),
});

export const Route = createFileRoute('/api/slice-it/admin/takedown')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read', query: QueryZ }, async ({ query }) => {
        const [candidates, bytes] = await Promise.all([
          archiveCandidates(query.months, 100),
          archivableBytes(query.months),
        ]);
        return Response.json({ candidates, reclaimableBytes: bytes });
      }),

      POST: defineHandler({ auth: 'admin', rateLimit: 'write', body: BodyZ }, async ({
        userId,
        body,
      }) => {
        const result = await takeDownSong(body.songId, body.reason);
        if (result.tookDown) {
          // Audited, because a takedown is irreversible for the audio: the
          // object is gone and only the row can say who decided that and why.
          await logAdminAction(userId, 'slice_it.takedown', {
            targetType: 'song',
            targetId: body.songId,
            detail: body.reason,
          });
        }
        return Response.json({ success: true, ...result });
      }),
    },
  },
});
