import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { sendScheduledMessageNowApi } from '@/lib/messages/scheduled.contract';
import { sendScheduledNow } from '@/lib/messages/scheduled.server';

/**
 * POST /api/messages/scheduled/$id/send-now - deliver a pending message now,
 * through the same send function (and so the same checks) as the cron.
 */
export const route = apiRoute('/api/messages/scheduled/$id/send-now', {
  POST: implement(
    sendScheduledMessageNowApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const result = await sendScheduledNow(userId, params.id);
      if (!result.ok) {
        return Response.json(
          {
            error: result.error,
            code: result.code ?? null,
          },
          {
            status: result.status,
          },
        );
      }
      return Response.json({
        success: true,
        message: result.message,
      });
    },
  ),
});
