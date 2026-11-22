import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/post-alerts.contract';
import { setPostAlertsBody } from '@/lib/communities/post-alerts-schema';
import { requireMember } from '@/lib/communities/guard.server';
import { getPostAlerts, setPostAlerts } from '@/lib/communities/post-alerts.server';

/**
 * GET /api/communities/$slug/alerts — the caller's "new post alerts" choice for the community (members only).
 * PUT /api/communities/$slug/alerts — turn alerts for every new visible post on or off for the caller.
 *
 * Membership is checked by the guard and again by the write itself (it updates the caller's own membership row only).
 */
export const route = apiRoute('/api/communities/$slug/alerts', {
  GET: implement(
    C.getPostAlertsApi,
    {
      rateLimit: 'read',
    },
    async ({ params, session }) => {
      const guard = await requireMember(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      const alerts = await getPostAlerts(guard.value.id, session.user.id);
      if (!alerts)
        return Response.json(
          {
            ...refusalBody('COMMUNITY_JOIN_REQUIRED'),
          },
          {
            status: 403,
          },
        );
      return alerts;
    },
  ),
  PUT: implement(
    C.setPostAlertsApi,
    {
      rateLimit: 'write',
      body: setPostAlertsBody,
    },
    async ({ params, session, body }) => {
      const guard = await requireMember(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      const alerts = await setPostAlerts(guard.value.id, session.user.id, body.level);
      if (!alerts)
        return Response.json(
          {
            ...refusalBody('COMMUNITY_JOIN_REQUIRED'),
          },
          {
            status: 403,
          },
        );
      return alerts;
    },
  ),
});
