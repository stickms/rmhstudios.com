import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getProgressSummary } from '@/lib/progress-summary.server';

/** GET /api/progress — the signed-in user's level, quests, and season summary. */
export const route = apiRoute('/api/progress', {
  GET: defineHandler({}, async ({ session }) => {
    return Response.json(await getProgressSummary(session.user.id));
  }),
});
