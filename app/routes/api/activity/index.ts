import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { emitActivity } from '@/lib/activity/emit.server';
import {
  activityBatchSchema,
  ACTIVITY_KIND_MAX,
  ACTIVITY_ENTITY_ID_MAX,
  type ActivityMeta,
  type ActivityView,
} from '@/lib/activity/types';

/**
 * `/api/activity` — the activity stream's front door (C7).
 *
 * **POST** takes a BATCH and answers **202**, not 200. Nothing has been written
 * when it returns: the events go into the in-process buffer
 * (`lib/activity/emit.server.ts`) and reach Postgres as one `createMany` within
 * ~2s. The status code is the honest one, and it is also the contract — a
 * client that reads its own activity back immediately after posting will not
 * see it, and should not be encouraged to try.
 *
 * The rate limit is a bespoke bucket rather than the `write` policy: this is
 * viewport telemetry, so it is legitimately far chattier than a post or a
 * comment, and it should not share a bucket with them (a burst of scroll
 * beacons must never be what stops someone from replying). 60 batches/minute at
 * 50 events each is well past any honest client.
 *
 * **GET** returns the caller's own recent rows. `Activity.id` is a `BigInt`, so
 * it is serialized to a string — `JSON.stringify` throws on a BigInt, and that
 * failure surfaces as a bare 500 from `defineHandler`'s catch.
 */

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  kind: z.string().max(ACTIVITY_KIND_MAX).optional(),
  entityId: z.string().max(ACTIVITY_ENTITY_ID_MAX).optional(),
});

export const Route = createFileRoute('/api/activity/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: listQuery }, async ({ userId, query }) => {
        const rows = await prisma.activity.findMany({
          where: {
            userId,
            ...(query.kind ? { kind: query.kind } : {}),
            ...(query.entityId ? { entityId: query.entityId } : {}),
          },
          orderBy: { at: 'desc' },
          take: query.limit ?? 20,
          select: { id: true, verb: true, kind: true, entityId: true, meta: true, at: true },
        });

        const items: ActivityView[] = rows.map((row) => ({
          id: row.id.toString(),
          verb: row.verb,
          kind: row.kind,
          entityId: row.entityId,
          meta: (row.meta ?? {}) as ActivityMeta,
          at: row.at.toISOString(),
        }));
        return Response.json({ items });
      }),

      POST: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'activity-emit', scope: 'user' },
          body: activityBatchSchema,
        },
        async ({ userId, body }) => {
          for (const event of body.events) {
            emitActivity({
              userId,
              verb: event.verb,
              kind: event.kind,
              entityId: event.entityId,
              meta: event.meta,
            });
          }
          // 202: buffered, not written. See the note above.
          return Response.json({ accepted: body.events.length }, { status: 202 });
        },
      ),
    },
  },
});
