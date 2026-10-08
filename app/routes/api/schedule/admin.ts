import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { RECURRENCES, SLOT_KINDS } from '@/lib/schedule/slots';

/**
 * `/api/schedule/admin` — running the grid (L1, and the first piece of L4).
 *
 * Somebody has to schedule the slots, and the alternative to a route is a
 * deploy per booking. `auth: 'admin'` throughout.
 *
 * DELETE unpublishes rather than deleting: a recurring slot paused for a week
 * and put back should not have to be re-created from memory, which is also the
 * only way its `startsAt` survives intact.
 */

const slotSchema = z.object({
  kind: z.enum(SLOT_KINDS),
  title: z.string().trim().min(1).max(120),
  href: z.string().trim().max(200).nullable().optional(),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(0).max(24 * 60).default(0),
  recurrence: z.enum(RECURRENCES).default('once'),
  until: z.string().datetime().nullable().optional(),
});

export const Route = createFileRoute('/api/schedule/admin')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json({
          slots: await prisma.scheduledSlot.findMany({
            orderBy: { startsAt: 'desc' },
            take: 200,
          }),
        }),
      ),

      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: slotSchema },
        async ({ session, body }) =>
          Response.json(
            await prisma.scheduledSlot.create({
              data: {
                kind: body.kind,
                title: body.title,
                href: body.href ?? null,
                startsAt: new Date(body.startsAt),
                durationMinutes: body.durationMinutes,
                recurrence: body.recurrence,
                until: body.until ? new Date(body.until) : null,
                createdById: session.user.id,
              },
            }),
          ),
      ),

      DELETE: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: z.object({ id: z.string().min(1).max(40) }) },
        async ({ body }) => {
          const { count } = await prisma.scheduledSlot.updateMany({
            where: { id: body.id },
            data: { published: false },
          });
          return Response.json({ unpublished: count > 0 });
        },
      ),
    },
  },
});
