import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { editMessageAltsApi } from '@/lib/messages/message-actions.contract';
import { editMessageAltsBody } from '@/lib/messages/image-alts-schema';
import { editMessageImageAlts } from '@/lib/messages/alt-edit.server';

/**
 * PATCH /api/messages/$conversationId/alt — change the descriptions of the
 * images in a message you sent. The conversation id is a direct or a group chat;
 * the sender check, the 24-hour window and the length match live in
 * `lib/messages/alt-edit.server.ts`. `messageId` travels in the body, as with
 * the sibling `edit` route.
 */

export const route = apiRoute('/api/messages/$conversationId/alt', {
  PATCH: implement(
    editMessageAltsApi,
    {
      rateLimit: {
        limit: 30,
        windowMs: 60_000,
        prefix: 'message:alt',
        scope: 'user',
      },
      body: editMessageAltsBody,
    },
    async ({ params, userId, body }) => {
      const result = await editMessageImageAlts({
        chatId: params.conversationId,
        messageId: body.messageId,
        userId,
        imageAlts: body.imageAlts,
      });
      if (!result.ok) {
        return Response.json(
          {
            error: result.error,
          },
          {
            status: result.status,
          },
        );
      }
      return {
        success: true as const,
        imageAlts: result.imageAlts,
      };
    },
  ),
});
