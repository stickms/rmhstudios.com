import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { cancelScheduledMessageApi, updateScheduledMessageApi } from '@/lib/messages/scheduled.contract';
import { patchScheduledMessageBody } from '@/lib/messages/scheduled-schema';
import { cancelScheduledMessage, editScheduledMessage } from '@/lib/messages/scheduled.server';

/**
 * PATCH  /api/messages/scheduled/$id - change the text or the time of a pending message.
 * DELETE /api/messages/scheduled/$id - cancel a pending message, or dismiss a failed one.
 * Another member's row answers 404, the same as a missing one.
 */
export const route = apiRoute('/api/messages/scheduled/$id', {
  PATCH: implement(
    updateScheduledMessageApi,
    {
      rateLimit: 'write',
      body: patchScheduledMessageBody,
    },
    async ({ userId, params, body }) => {
      const result = await editScheduledMessage(userId, params.id, body);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
            ...refusalCodeOf(result),
          },
          {
            status: result.status,
          },
        );
      return {
        message: result.row,
      };
    },
  ),
  DELETE: implement(
    cancelScheduledMessageApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const result = await cancelScheduledMessage(userId, params.id);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
            ...refusalCodeOf(result),
          },
          {
            status: result.status,
          },
        );
      return {
        success: true as const,
      };
    },
  ),
});
