import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { patchScheduledSchema } from '@/lib/scheduled/scheduled-schema';
import { discardScheduledApi, updateScheduledApi } from '@/lib/scheduled/scheduled.contract';
import { prisma } from '@/lib/prisma.server';
import { updateScheduledPost } from '@/lib/scheduled/create.server';

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
      const out = await updateScheduledPost(session.user.id, params.id, body);
      if (!out.ok) return Response.json(out.body, { status: out.status });
      const updated = out.post;

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
