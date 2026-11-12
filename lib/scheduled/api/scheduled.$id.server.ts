import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { patchScheduledSchema } from '@/lib/scheduled/scheduled-schema';
import { discardScheduledApi, updateScheduledApi } from '@/lib/scheduled/scheduled.contract';
import { prisma } from '@/lib/prisma.server';

export const route = apiRoute('/api/scheduled/$id', {
  // Edit a draft/scheduled post.
  PATCH: implement(
    updateScheduledApi,
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:scheduled/:id' },
      body: patchScheduledSchema,
      allowEmptyBody: true,
      verboseValidationErrors: true,
    },
    async ({ params, session, body }) => {
      const existing = await prisma.scheduledPost.findUnique({ where: { id: params.id } });
      if (!existing || existing.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      if (existing.publishedId) {
        return Response.json({ error: 'Already published' }, { status: 409 });
      }

      // Z7: a sealed time capsule is cancelled (DELETE), never edited.
      if (existing.isCapsule) {
        return Response.json({ error: 'A time capsule is sealed' }, { status: 409 });
      }

      const d = body;

      let scheduledAt: Date | null | undefined;
      if (d.scheduledAt !== undefined) {
        if (d.scheduledAt === null) {
          scheduledAt = null;
        } else {
          scheduledAt = new Date(d.scheduledAt);
          if (scheduledAt.getTime() <= Date.now()) {
            return Response.json(
              { error: 'Scheduled time must be in the future' },
              { status: 400 },
            );
          }
        }
      }

      const updated = await prisma.scheduledPost.update({
        where: { id: params.id },
        data: {
          ...(d.content !== undefined ? { content: d.content.trim() } : {}),
          ...(d.audience !== undefined ? { audience: d.audience } : {}),
          ...(d.unlockPrice !== undefined
            ? { unlockPrice: d.unlockPrice && d.unlockPrice > 0 ? d.unlockPrice : null }
            : {}),
          ...(scheduledAt !== undefined ? { scheduledAt } : {}),
        },
      });

      return Response.json(updated);
    },
  ),

  // Discard a draft/scheduled post.
  DELETE: implement(
    discardScheduledApi,
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:scheduled/:id' } },
    async ({ params, session }) => {
      const existing = await prisma.scheduledPost.findUnique({ where: { id: params.id } });
      if (!existing || existing.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }

      await prisma.scheduledPost.delete({ where: { id: params.id } });
      return { success: true as const };
    },
  ),
});
