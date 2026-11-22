import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createScheduledMessageApi, listScheduledMessagesApi } from '@/lib/messages/scheduled.contract';
import { createScheduledMessageBody, listScheduledMessagesQuery } from '@/lib/messages/scheduled-schema';
import { listScheduledMessages, scheduleMessage } from '@/lib/messages/scheduled.server';

/**
 * GET  /api/messages/scheduled?chatId= - the caller's scheduled messages.
 * POST /api/messages/scheduled - hold a message for later (1 minute to 30 days
 *      ahead, at most 20 pending). Session only; only the caller's rows.
 */
export const route = apiRoute('/api/messages/scheduled', {
  GET: implement(
    listScheduledMessagesApi,
    {
      rateLimit: 'read',
      query: listScheduledMessagesQuery,
    },
    async ({ userId, query }) => ({
      messages: await listScheduledMessages(userId, query.chatId),
    }),
  ),
  POST: implement(
    createScheduledMessageApi,
    {
      rateLimit: 'write',
      body: createScheduledMessageBody,
    },
    async ({ userId, body }) => {
      const result = await scheduleMessage(userId, body);
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
      return Response.json(
        {
          message: result.row,
        },
        {
          status: 201,
        },
      );
    },
  ),
});
