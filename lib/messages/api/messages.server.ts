import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listConversationsApi, sendMessageApi } from '@/lib/messages/messages.contract';
import { sendMessageSchema } from '@/lib/messages/messages-schema';
import { prisma } from '@/lib/prisma.server';
import { notifyUser } from '@/lib/message-events';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { listConversations } from '@/lib/messages.server';
import { adjustDmUnread } from '@/lib/chat-plus/unread.server';
import { messageStamp } from '@/lib/chat-plus/post.server';

/** GET /api/messages — list conversations for current user */

/** POST /api/messages — start or continue a conversation */

export const route = apiRoute('/api/messages', {
  GET: implement(listConversationsApi, {}, async ({ request, session }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    // M1: `?folder=<id>` or `?filter=unread` narrow the list server-side so
    // pagination stays correct while a folder tab is selected.
    const folderId = url.searchParams.get('folder');
    const unreadOnly = url.searchParams.get('filter') === 'unread';
    const result = await listConversations(session.user.id, { cursor, folderId, unreadOnly });
    return result;
  }),
  POST: implement(
    sendMessageApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'send-message' } },
    async ({ request, session }) => {
      const body = await request.json();
      const parsed = sendMessageSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 },
        );
      }

      const { recipientId, content, gifUrl, imageUrls } = parsed.data;
      const senderId = session.user.id;

      if (recipientId === senderId) {
        return Response.json({ error: 'Cannot message yourself' }, { status: 400 });
      }

      // Images must belong to the sender (filename is prefixed with their id).
      if (imageUrls?.some((u) => !ownsFeedImageUrl(u, senderId))) {
        return Response.json({ error: 'Invalid image reference' }, { status: 400 });
      }
      const hasMedia = !!gifUrl || (imageUrls?.length ?? 0) > 0;

      // Check recipient exists and DM privacy
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
        select: {
          id: true,
          profile: { select: { dmPrivacy: true } },
        },
      });

      if (!recipient) {
        return Response.json({ error: 'User not found' }, { status: 404 });
      }

      const dmPrivacy = recipient.profile?.dmPrivacy ?? 'EVERYONE';

      if (dmPrivacy === 'NONE') {
        return Response.json({ error: 'This user is not accepting messages.' }, { status: 403 });
      }

      if (dmPrivacy === 'FOLLOWERS') {
        // Check if recipient follows the sender
        const follows = await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: recipientId,
              followingId: senderId,
            },
          },
        });
        if (!follows) {
          return Response.json(
            {
              error: 'This user only accepts messages from people they follow.',
            },
            { status: 403 },
          );
        }
      }

      // Normalize participant order (alphabetical) for unique constraint
      const [pOne, pTwo] =
        senderId < recipientId ? [senderId, recipientId] : [recipientId, senderId];

      // Find or create conversation
      const conversation = await prisma.conversation.upsert({
        where: {
          participantOneId_participantTwoId: {
            participantOneId: pOne,
            participantTwoId: pTwo,
          },
        },
        create: {
          participantOneId: pOne,
          participantTwoId: pTwo,
        },
        update: {},
      });

      // If content or media provided, create the message and bump lastMessageAt.
      if (content || hasMedia) {
        const [message] = await prisma.$transaction([
          prisma.directMessage.create({
            data: {
              conversationId: conversation.id,
              senderId,
              content: content ?? '',
              gifUrl: gifUrl ?? null,
              imageUrls: imageUrls ?? [],
              ...messageStamp(conversation.disappearAfterSec, { content, gifUrl, imageUrls }),
            },
          }),
          prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
          }),
        ]);

        const messagePayload = {
          id: message.id,
          conversationId: conversation.id,
          content: message.content,
          senderId: message.senderId,
          read: message.read,
          createdAt: message.createdAt.toISOString(),
          gifUrl: message.gifUrl,
          imageUrls: message.imageUrls,
          reactions: [],
          expiresAt: message.expiresAt?.toISOString() ?? null,
        };

        // Bump the recipient's denormalized unread counter (only if warm) before
        // the SSE notify so their stream reads a fresh count — this path never
        // did, so the badge went stale until the Redis counter's TTL expired.
        void adjustDmUnread(recipientId, 1);

        // Notify recipient via SSE with message payload
        notifyUser(recipientId, {
          type: 'new-message',
          message: messagePayload,
        });

        return {
          conversationId: conversation.id,
          message: messagePayload,
        };
      }

      // No content — just return the conversation ID
      return { conversationId: conversation.id };
    },
  ),
});
