import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { studyPlanSchema } from '@/lib/tools/schemas';
import { createStudyPlan, listStudyPlans } from '@/lib/tools/tools.server';

/** GET/POST /api/study-plans — the caller's own plans (P21 tools). */
export const route = apiRoute('/api/study-plans', {
  GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
    Response.json(
      { plans: await listStudyPlans(userId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  ),
  POST: defineHandler({ rateLimit: 'write', body: studyPlanSchema }, async ({ userId, body }) => {
    const r = await createStudyPlan(userId, body);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ id: r.id }, { status: 201 });
  }),
});
