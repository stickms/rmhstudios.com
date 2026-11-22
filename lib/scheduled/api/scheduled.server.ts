import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createScheduledSchema } from '@/lib/scheduled/scheduled-schema';
import { createScheduledApi, listScheduledApi } from '@/lib/scheduled/scheduled.contract';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { listScheduled } from '@/lib/scheduled/list.server';
import { createScheduledPost } from '@/lib/scheduled/create.server';

export const route = apiRoute('/api/scheduled', {
  // List the viewer's drafts + scheduled posts (publishing any that are due).
  GET: implement(listScheduledApi, {}, async ({ session }) => {
    return listScheduled(session.user.id);
  }),

  // Save a new draft or scheduled post.
  POST: implement(
    createScheduledApi,
    { body: createScheduledSchema, allowEmptyBody: true, verboseValidationErrors: true },
    async ({ request, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed } = rateLimit(ip, {
        limit: 30,
        windowMs: 60_000,
        prefix: 'scheduled-create',
      });
      if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

      const out = await createScheduledPost(userId, body);
      if (!out.ok) return Response.json(out.body, { status: out.status });
      const sp = out.post;

      return Response.json(sp, { status: 201 });
    },
  ),
});
