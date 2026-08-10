import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { detachFromRule, getSession } from '@/lib/pf2ecal/sessions.server';
import { respondSchema } from '@/lib/pf2ecal/types';

/**
 * PUT    /api/pf2ecal/sessions/:id/response — I'm in / maybe / can't make it.
 * DELETE /api/pf2ecal/sessions/:id/response — clear my answer.
 *
 * `PUT` because it is idempotent and the client sends the whole answer: tapping
 * "Going" twice is the same request twice and must not stack. The upsert on
 * `(sessionId, userId)` is what makes that true at the database rather than in
 * the handler, so a double-tap on a slow connection cannot produce two rows.
 */
export const Route = createFileRoute('/api/pf2ecal/sessions/$id/response')({
  server: {
    handlers: {
      PUT: defineHandler(
        { rateLimit: { policy: 'write', scope: 'user' }, body: respondSchema },
        async ({ params, userId, body }) => {
          const exists = await prisma.pf2eSession.findUnique({
            where: { id: params.id },
            select: { id: true },
          });
          if (!exists) return Response.json({ error: 'Not found' }, { status: 404 });

          const note = body.note?.trim() || null;
          await prisma.pf2eSessionResponse.upsert({
            where: { sessionId_userId: { sessionId: params.id, userId } },
            create: { sessionId: params.id, userId, status: body.status, note },
            update: { status: body.status, note },
          });
          // Someone has now committed to this night; the rule stops owning it.
          await detachFromRule(params.id);
          return Response.json({ session: await getSession(params.id) });
        },
      ),

      DELETE: defineHandler(
        { rateLimit: { policy: 'write', scope: 'user' } },
        async ({ params, userId }) => {
          await prisma.pf2eSessionResponse.deleteMany({
            where: { sessionId: params.id, userId },
          });
          return Response.json({ session: await getSession(params.id) });
        },
      ),
    },
  },
});
