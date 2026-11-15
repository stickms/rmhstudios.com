import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { studyPlanSchema } from '@/lib/tools/schemas';
import { deleteStudyPlan, updateStudyPlan } from '@/lib/tools/tools.server';

/** PUT/DELETE /api/study-plans/:id — edit or remove one of the caller's own rows. */
export const route = apiRoute('/api/study-plans/$id', {
  PUT: defineHandler(
    { rateLimit: 'write', body: studyPlanSchema },
    async ({ userId, params, body }) =>
      (await updateStudyPlan(userId, params.id, body))
        ? Response.json({ ok: true })
        : Response.json({ error: 'Not found' }, { status: 404 }),
  ),
  DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) =>
    (await deleteStudyPlan(userId, params.id))
      ? Response.json({ ok: true })
      : Response.json({ error: 'Not found' }, { status: 404 }),
  ),
});
