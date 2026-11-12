import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/profile/profile-extras.contract';
import { getCreatorAnalytics } from '@/lib/analytics.server';

/** GET /api/profile/analytics — the signed-in creator's own reach/engagement. */
export const route = apiRoute('/api/profile/analytics', {
  GET: implement(
    C.getCreatorAnalyticsApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'creator-analytics' } },
    async ({ session }) => {
      const analytics = await getCreatorAnalytics(session.user.id);
      return Response.json(analytics);
    },
  ),
});
