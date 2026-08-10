import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getSession } from '@/lib/pf2ecal/sessions.server';
import { createSessionSchema } from '@/lib/pf2ecal/types';

/**
 * POST /api/pf2ecal/sessions — add a one-off session.
 *
 * Auth is the default (`'required'`): the page is unlisted and every signed-in
 * account may edit it, so the session check is the whole authorization model.
 * There is deliberately no owner check anywhere in this feature — the table
 * asked for a shared board, and `createdById` records who did what rather than
 * restricting who may.
 *
 * `occurrenceKey` is left null, which is what marks the row as hand-added and
 * keeps the recurring rule from ever claiming it.
 */
export const Route = createFileRoute('/api/pf2ecal/sessions')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: createSessionSchema },
        async ({ userId, body }) => {
          const created = await prisma.pf2eSession.create({
            data: {
              title: body.title,
              notes: body.notes,
              location: body.location,
              startsAt: new Date(body.startsAt),
              endsAt: new Date(body.endsAt),
              pinnedToRule: false,
              createdById: userId,
              updatedById: userId,
            },
            select: { id: true },
          });
          return Response.json({ session: await getSession(created.id) }, { status: 201 });
        },
      ),
    },
  },
});
