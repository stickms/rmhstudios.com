/**
 * `/api/speedrun/queue` — the admin review queue's page API (sprint 10, feature 16).
 *
 * GET lists the queue or the recent verdicts; POST gives a verdict or reopens a decided run. Both are admin-only. A
 * verdict applies only to a run still `pending` and a reopen only from the status the admin saw: otherwise 409 with
 * who decided, so a second admin is told rather than overwriting the first.
 */
import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { speedrunQueueActionApi, speedrunQueueApi } from '@/lib/speedrun/queue.contract';
import { listSpeedrunQueue } from '@/lib/speedrun/review-queue.server';
import { reopenEntry, reviewEntry, SpeedrunError } from '@/lib/speedrun/speedrun.server';

const querySchema = z.object({ view: z.enum(['pending', 'decided']) });

const bodySchema = z.union([
  z.object({
    action: z.literal('review'),
    entryId: z.string().min(1).max(64),
    status: z.enum(['verified', 'rejected']),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal('reopen'),
    entryId: z.string().min(1).max(64),
    from: z.enum(['verified', 'rejected']),
    reason: z.string().trim().min(1).max(200),
  }),
]);

export const route = apiRoute('/api/speedrun/queue', {
  GET: implement(speedrunQueueApi, { auth: 'admin', rateLimit: 'read', query: querySchema }, async ({ query }) => ({
    rows: await listSpeedrunQueue(query.view),
  })),

  POST: implement(
    speedrunQueueActionApi,
    { auth: 'admin', rateLimit: 'write', body: bodySchema },
    async ({ userId, body }) => {
      try {
        if (body.action === 'reopen') {
          const result = await reopenEntry({
            entryId: body.entryId,
            from: body.from,
            reason: body.reason,
            adminId: userId,
          });
          if (!result.ok) {
            return Response.json({ error: 'This run was already changed.', status: result.status }, { status: 409 });
          }
          return { ok: true as const };
        }
        // A rejection says why; a verification may.
        if (body.status === 'rejected' && !body.reason) {
          return Response.json({ error: 'A rejection needs a reason.' }, { status: 400 });
        }
        const result = await reviewEntry({
          entryId: body.entryId,
          status: body.status,
          reason: body.reason,
          adminId: userId,
        });
        if (!result.ok) {
          return Response.json(
            { error: 'This run was already decided.', status: result.status, decidedBy: result.decidedBy },
            { status: 409 },
          );
        }
        return { ok: true as const };
      } catch (error) {
        if (error instanceof SpeedrunError && error.code === 'ENTRY_NOT_FOUND') {
          return Response.json({ error: 'No such run.' }, { status: 404 });
        }
        throw error;
      }
    },
  ),
});
