import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getStudioOverview } from '@/lib/creator/studio.server';

export const route = apiRoute('/api/creator/studio-overview', {
  GET: defineHandler({}, async ({ session }) => {
    return Response.json({ overview: await getStudioOverview(session.user.id) });
  }),
});
