import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getSession } from '@/lib/pf2ecal/sessions.server';
import { MAX_SESSION_HOURS, updateSessionSchema } from '@/lib/pf2ecal/types';

/**
 * PATCH  /api/pf2ecal/sessions/:id — edit, move, cancel or un-cancel.
 * DELETE /api/pf2ecal/sessions/:id — remove a session entirely.
 *
 * Cancelling and deleting are different operations on purpose. Cancelling keeps
 * the row so the `.ics` feed can publish `STATUS:CANCELLED` and the night
 * disappears from everyone's phone; deleting drops it, which a subscribed
 * calendar will not notice. The UI offers cancel first for exactly that reason,
 * and only a rule-generated session that nobody wanted at all is worth
 * deleting.
 */
export const Route = createFileRoute('/api/pf2ecal/sessions/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: updateSessionSchema },
        async ({ params, userId, body }) => {
          const existing = await prisma.pf2eSession.findUnique({
            where: { id: params.id },
            select: { startsAt: true, endsAt: true },
          });
          if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

          // A patch may move one end only, so the range is re-checked against
          // what is stored rather than against the patch alone — zod can only
          // see the fields it was given, and "start moved past the stored end"
          // is precisely the edit that would otherwise produce a negative
          // duration and a DTEND before its DTSTART in the feed.
          const startsAt = body.startsAt ? new Date(body.startsAt) : existing.startsAt;
          const endsAt = body.endsAt ? new Date(body.endsAt) : existing.endsAt;
          if (endsAt.getTime() <= startsAt.getTime()) {
            return Response.json(
              { error: 'The end time must come after the start time.' },
              { status: 400 },
            );
          }
          if (endsAt.getTime() - startsAt.getTime() > MAX_SESSION_HOURS * 3_600_000) {
            return Response.json(
              { error: `A session cannot run longer than ${MAX_SESSION_HOURS} hours.` },
              { status: 400 },
            );
          }

          await prisma.pf2eSession.update({
            where: { id: params.id },
            data: {
              ...(body.title !== undefined && { title: body.title }),
              ...(body.notes !== undefined && { notes: body.notes }),
              ...(body.location !== undefined && { location: body.location }),
              ...(body.startsAt !== undefined && { startsAt }),
              ...(body.endsAt !== undefined && { endsAt }),
              ...(body.canceled !== undefined && {
                canceledAt: body.canceled ? new Date() : null,
              }),
              // Any hand edit detaches the row from the recurring rule, so
              // re-tuning CAMPAIGN_RULE later cannot undo what was just done.
              pinnedToRule: false,
              updatedById: userId,
            },
          });
          return Response.json({ session: await getSession(params.id) });
        },
      ),

      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params }) => {
        // `deleteMany` rather than `delete`: two people pressing delete on the
        // same session should both get a 200, not a P2025 turned into a 500 for
        // whoever was second.
        const { count } = await prisma.pf2eSession.deleteMany({ where: { id: params.id } });
        return Response.json({ deleted: count > 0 });
      }),
    },
  },
});
