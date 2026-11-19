import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { RECURRENCES, SLOT_KINDS } from '@/lib/schedule/slots';
import {
  durationMs,
  recurUntilFromSlotUntil,
  slotRecurrenceOf,
  slotRule,
  slotUntilFromRecurUntil,
} from '@/lib/calendar/event-model';

/**
 * `/api/schedule/admin` — running the grid (L1, and the first piece of L4).
 *
 * Somebody has to schedule the slots, and the alternative to a route is a
 * deploy per booking. `auth: 'admin'` throughout. A slot is a PLATFORM Event of
 * the slot's kind; this route speaks the slot shape it always did.
 *
 * DELETE unpublishes (the event becomes a DRAFT) rather than deleting: a
 * recurring slot paused for a week and put back should not have to be
 * re-created from memory, which is also the only way its `startsAt` survives
 * intact.
 */

const slotSchema = z.object({
  kind: z.enum(SLOT_KINDS),
  title: z.string().trim().min(1).max(120),
  href: z.string().trim().max(200).nullable().optional(),
  startsAt: z.string().datetime(),
  durationMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(0),
  recurrence: z.enum(RECURRENCES).default('once'),
  until: z.string().datetime().nullable().optional(),
});

const slotSelect = {
  id: true,
  kind: true,
  title: true,
  href: true,
  startsAt: true,
  endsAt: true,
  recurrence: true,
  recurUntil: true,
  visibility: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** An Event row in the shape the grid's admin tools read. */
function toSlot(e: {
  id: string;
  kind: string;
  title: string;
  href: string | null;
  startsAt: Date;
  endsAt: Date | null;
  recurrence: string | null;
  recurUntil: Date | null;
  visibility: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: e.id,
    kind: e.kind,
    title: e.title,
    href: e.href,
    startsAt: e.startsAt,
    durationMinutes: Math.round(durationMs(e) / 60_000),
    recurrence: slotRecurrenceOf(e.recurrence),
    until: slotUntilFromRecurUntil(e.recurUntil),
    published: e.visibility === 'PUBLIC',
    createdById: e.createdById,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/** Grid slots: the platform's events other than game nights, which have their own route. */
const slotWhere = { owner: 'PLATFORM', kind: { not: 'game-night' } } as const;

export const route = apiRoute('/api/schedule/admin', {
  GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
    Response.json({
      slots: (
        await prisma.event.findMany({
          where: slotWhere,
          orderBy: { startsAt: 'desc' },
          take: 200,
          select: slotSelect,
        })
      ).map(toSlot),
    }),
  ),

  POST: defineHandler(
    { auth: 'admin', rateLimit: 'write', body: slotSchema },
    async ({ session, body }) => {
      const startsAt = new Date(body.startsAt);
      const rule = slotRule(body.recurrence);
      const created = await prisma.event.create({
        data: {
          owner: 'PLATFORM',
          kind: body.kind,
          title: body.title,
          href: body.href ?? null,
          startsAt,
          endsAt:
            body.durationMinutes > 0
              ? new Date(startsAt.getTime() + body.durationMinutes * 60_000)
              : null,
          recurrence: rule,
          recurTz: rule ? 'UTC' : null,
          recurUntil: rule ? recurUntilFromSlotUntil(body.until ? new Date(body.until) : null) : null,
          createdById: session.user.id,
        },
        select: slotSelect,
      });
      return Response.json(toSlot(created));
    },
  ),

  DELETE: defineHandler(
    { auth: 'admin', rateLimit: 'write', body: z.object({ id: z.string().min(1).max(40) }) },
    async ({ body }) => {
      const { count } = await prisma.event.updateMany({
        where: { id: body.id, ...slotWhere },
        data: { visibility: 'DRAFT' },
      });
      return Response.json({ unpublished: count > 0 });
    },
  ),
});
