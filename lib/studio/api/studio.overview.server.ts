import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getStudioOverview } from '@/lib/creator/studio.server';

/** GET /api/studio/overview — the caller's Create/Earnings dashboard model. */
export const route = apiRoute('/api/studio/overview', {
  GET: defineHandler({}, async ({ session }) => {
    return Response.json(await getStudioOverview(session.user.id));
  }),
});
