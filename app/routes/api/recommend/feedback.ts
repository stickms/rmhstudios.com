import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

/**
 * `POST /api/recommend/feedback` — the control beside "why am I seeing this" (M4).
 *
 * `FeedSignal` has collected three kinds since it was added and only the feed
 * has ever consumed them. Now the recommender reads them too, which is what
 * makes this control mean something: pressing "show me less of this" changes
 * what the games rail, the library rail and the build store show, not just the
 * timeline.
 *
 * A control that does nothing measurable is worse than no control at all — the
 * member learns the site ignores them, which is the lesson hardest to unteach.
 *
 * `upsert` rather than `create` so pressing it twice is not an error, and
 * `delete` is the undo: the same button, pressed again.
 */

const schema = z.object({
  kind: z.enum(['less_author', 'mute_tag', 'follow_tag']),
  /** An author id or a tag (lowercase, no '#'), per the model's own comment. */
  targetId: z.string().min(1).max(64),
  /** false removes the signal — the undo for a control pressed by mistake. */
  on: z.boolean().default(true),
});

export const Route = createFileRoute('/api/recommend/feedback')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: schema },
        async ({ session, body }) => {
          const userId = session.user.id;
          const where = {
            userId_kind_targetId: { userId, kind: body.kind, targetId: body.targetId },
          };

          if (body.on) {
            await prisma.feedSignal.upsert({
              where,
              create: { userId, kind: body.kind, targetId: body.targetId },
              update: {},
            });
          } else {
            await prisma.feedSignal.deleteMany({
              where: { userId, kind: body.kind, targetId: body.targetId },
            });
          }

          return Response.json({ ok: true, kind: body.kind, on: body.on });
        },
      ),
    },
  },
});
