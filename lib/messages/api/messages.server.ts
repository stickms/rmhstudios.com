import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listConversationsApi, sendMessageApi } from '@/lib/messages/messages.contract';
import { sendMessageSchema } from '@/lib/messages/messages-schema';
import { prisma } from '@/lib/prisma.server';
import { findDmByPair, upsertDm } from '@/lib/chat/chat.server';
import { normalizeGifAlt } from '@/lib/feed/gif-alt';
import { guardImageAlts, isBlockedPair, sendRequestMessage } from '@/lib/messages/send.server';
import { clearStaleDraft, openRequest, requestGate } from '@/lib/messages/requests.server';
import { gateRefusalCopy } from '@/lib/messages/requests';
import { normalizeImageAlts } from '@/lib/messages/image-alts';
import { notifyUser } from '@/lib/message-events';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { listConversations } from '@/lib/messages.server';
import { adjustDmUnread } from '@/lib/chat-plus/unread.server';
import { messageStamp } from '@/lib/chat-plus/post.server';

/** A lost race on opening a request answers as the gate would have (s04-16). */
function requestRefusal(reason: 'NONE' | 'FOLLOWERS' | 'pending' | 'cap'): Response {
  if (reason === 'NONE') {
    return Response.json({ error: 'This user is not accepting messages.' }, { status: 403 });
  }
  if (reason === 'FOLLOWERS') {
    return Response.json(
      { error: 'This user only accepts messages from people they follow.' },
      { status: 403 },
    );
  }
  return Response.json(
    { error: gateRefusalCopy(reason) },
    { status: reason === 'cap' ? 429 : 403 },
  );
}

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
      const restricted = await restrictionResponse(session.user.id, 'message');
      if (restricted) return restricted;
      const body = await request.json();
      const parsed = sendMessageSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 },
        );
      }

      const { recipientId, content, gifUrl, gifAlt, imageUrls, imageAlts } = parsed.data;
      const senderId = session.user.id;

      if (recipientId === senderId) {
        return Response.json({ error: 'Cannot message yourself' }, { status: 400 });
      }

      // Images must belong to the sender (filename is prefixed with their id).
      if (imageUrls?.some((u) => !ownsFeedImageUrl(u, senderId))) {
        return Response.json({ error: 'Invalid image reference' }, { status: 400 });
      }
      const altFailure = await guardImageAlts(senderId, imageUrls, imageAlts);
      if (altFailure) return altFailure.response;
      const hasMedia = !!gifUrl || (imageUrls?.length ?? 0) > 0;

      // Check the recipient exists
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { id: true },
      });

      if (!recipient) {
        return Response.json({ error: 'User not found' }, { status: 404 });
      }

      // A block in either direction: no new conversation and no message (same answer as the send path).
      if (await isBlockedPair(senderId, recipientId)) {
        return Response.json(
          { error: 'You can no longer message this person' },
          { status: 403 },
        );
      }

      // Normalize participant order (alphabetical) for unique constraint
      const [pOne, pTwo] =
        senderId < recipientId ? [senderId, recipientId] : [recipientId, senderId];

      // DM privacy and message requests (s04-16): one gate for every way a DM is written. Nothing is
      // created for a sender it refuses.
      const existing = await findDmByPair(pOne, pTwo);
      const gate = await requestGate(senderId, recipientId, { request: existing?.request ?? null });
      if (gate.outcome === 'refused') {
        switch (gate.reason) {
          case 'NONE':
            return Response.json({ error: 'This user is not accepting messages.' }, { status: 403 });
          case 'FOLLOWERS':
            return Response.json(
              { error: 'This user only accepts messages from people they follow.' },
              { status: 403 },
            );
          case 'cap':
            return Response.json({ error: gateRefusalCopy('cap') }, { status: 429 });
          default:
            return Response.json({ error: gateRefusalCopy(gate.reason) }, { status: 403 });
        }
      }

      // Find or create conversation
      const conversation = existing ?? (await upsertDm(pOne, pTwo));

      if (gate.outcome === 'request') {
        // The recipient takes requests: one text message, held in their Requests folder. Without a
        // message the chat is only a draft the composer opens on ("Send a request").
        if (!content && !hasMedia) {
          const opened = await openRequest({
            senderId,
            chatId: conversation.id,
            privacy: gate.privacy,
          });
          if (!opened.ok) return requestRefusal(opened.reason);
          return { conversationId: conversation.id };
        }
        const sent = await sendRequestMessage({
          userId: senderId,
          conversationId: conversation.id,
          input: { content: content ?? '', gifUrl, imageUrls },
          disappearAfterSec: conversation.disappearAfterSec,
          privacy: gate.privacy,
        });
        if (!sent.ok) return sent.response;
        return { conversationId: conversation.id, message: sent.value.message };
      }

      await clearStaleDraft(existing?.request, conversation.id);

      // If content or media provided, create the message and bump lastMessageAt.
      if (content || hasMedia) {
        const [message] = await prisma.$transaction([
          prisma.chatMessage.create({
            data: {
              chatId: conversation.id,
              senderId,
              content: content ?? '',
              gifUrl: gifUrl ?? null,
              gifAlt: normalizeGifAlt(gifUrl, gifAlt),
              imageUrls: imageUrls ?? [],
              imageAlts: normalizeImageAlts(imageUrls, imageAlts),
              ...messageStamp(conversation.disappearAfterSec, { content, gifUrl, imageUrls }),
            },
          }),
          prisma.chat.update({
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
          gifAlt: message.gifAlt,
          imageUrls: message.imageUrls,
          imageAlts: message.imageAlts,
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
