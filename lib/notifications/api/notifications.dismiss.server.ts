import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { dismissNotificationsApi } from '@/lib/notifications/inbox.contract';
import { dismissBody } from '@/lib/notifications/inbox-schema';
import { dismiss } from '@/lib/notifications/inbox.server';

/**
 * POST /api/notifications/dismiss — body { ids } (at most 100): delete several of the caller's notifications, such as
 * every row of a collapsed group. Ids that are not the caller's are ignored; if none are, the answer is 404.
 */
export const route = apiRoute('/api/notifications/dismiss', {
  POST: implement(
    dismissNotificationsApi,
    {
      rateLimit: 'write',
      body: dismissBody,
    },
    async ({ session, body }) => {
      const { found, changed } = await dismiss(session.user.id, body.ids);
      if (found === 0)
        return Response.json(
          {
            error: 'Notification not found',
          },
          {
            status: 404,
          },
        );
      return {
        success: true as const,
        dismissed: changed,
      };
    },
  ),
});
