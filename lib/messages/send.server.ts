/**
 * The one place a direct or group message is written for a member. Server-only.
 *
 * Extracted from `POST /api/messages/$conversationId` and
 * `POST /api/group-chats/$id/messages` so the scheduled-message cron (s03-12)
 * delivers through exactly the checks and side effects a hand-sent message gets:
 * restriction, membership, image ownership, DM privacy, the expiry stamp, the
 * chat's `lastMessageAt`, the realtime fan-out and the unread counter. The
 * endpoints keep what belongs to a request (IP rate limits, reading the body)
 * and answer `failure.response` as they always did.
 *
 * A failure carries a stable `code` as well as the `Response` the endpoint
 * returns, so a caller with no request (the cron) can say why a message was not
 * sent without parsing an error string.
 */

import { prisma } from '@/lib/prisma.server';
import { findDm, findGroupMembership } from '@/lib/chat/chat.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { getActiveBan } from '@/lib/admin-audit.server';
import { checkRateLimit } from '@/lib/rate-limit.server';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { altTextViolation } from '@/lib/feed/alt-text.server';
import { imageAltsAligned, normalizeImageAlts } from '@/lib/messages/image-alts';
import { notifyUser } from '@/lib/message-events';
import { publishGroupMessage, type GroupMessagePayload } from '@/lib/group-events';
import { messageStamp } from '@/lib/chat-plus/post.server';
import { adjustDmUnread } from '@/lib/chat-plus/unread.server';
import { groupMessageSelect, serializeGroupMessages } from '@/lib/group-chat/serialize.server';
import type { SentDirectMessage } from '@/lib/messages/messages.contract';

export type SendFailCode =
  | 'restricted'
  | 'not-found'
  | 'not-member'
  | 'invalid-image'
  | 'alt-mismatch'
  | 'alt-required'
  | 'cannot-message'
  | 'blocked'
  | 'rate-limited'
  | 'empty';

export interface SendFailure {
  ok: false;
  code: SendFailCode;
  /** What the endpoint answers; the cron ignores it and records `code`. */
  response: Response;
}

export type SendResult<T> =
  | {
      ok: true;
      value: T;
    }
  | SendFailure;

function fail(
  code: SendFailCode,
  error: string,
  status: number,
  headers?: HeadersInit,
  /** Extra body fields, for a failure the composer reads by `code`. */
  extra?: Record<string, string>,
): SendFailure {
  return {
    ok: false,
    code,
    response: Response.json(
      {
        error,
        ...extra,
      },
      {
        status,
        headers,
      },
    ),
  };
}

/**
 * The checks on a message's image descriptions, shared by every send path: the
 * list must be exactly as long as the images, and the sender's "Require image
 * descriptions" setting must hold. The `422` carries `code: 'alt-text-required'`
 * so the composer can point at the images instead of printing the sentence.
 */
export async function guardImageAlts(
  userId: string,
  imageUrls: string[] | undefined,
  imageAlts: string[] | undefined,
): Promise<SendFailure | null> {
  if (!imageAltsAligned(imageUrls, imageAlts)) {
    return fail('alt-mismatch', 'Provide exactly one description per image', 400);
  }
  const violation = await altTextViolation(userId, imageUrls, imageAlts);
  if (violation) {
    return fail('alt-required', violation, 422, undefined, {
      code: 'alt-text-required',
    });
  }
  return null;
}

/** What a direct message carries: the parsed `sendToConversationBody`. */
export interface DirectMessageInput {
  content: string;
  gifUrl?: string | undefined;
  imageUrls?: string[] | undefined;
  /** One description per image, same length as `imageUrls`. */
  imageAlts?: string[] | undefined;
}

export interface SendDirectOptions {
  userId: string;
  conversationId: string;
  input: DirectMessageInput;
  /** The per-(sender to recipient) flood limit. On for a hand-sent message; the cron bounds volume by the 20-pending cap instead. */
  pairRateLimit: boolean;
  /** Already loaded and checked by `guardDirect` (the endpoint does so before it reads the body); skips the second lookup. */
  conversation?: DirectConversation;
}

export type DirectConversation = NonNullable<Awaited<ReturnType<typeof findDm>>>;

/** A block in either direction between two people (yourself never blocks). The one check every DM path shares. */
export async function isBlockedPair(userId: string, otherId: string): Promise<boolean> {
  if (userId === otherId) return false;
  const hit = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherId },
        { blockerId: otherId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

/** The restriction, existence and participant checks, in the order the endpoint always ran them. */
export async function guardDirect(userId: string, conversationId: string): Promise<SendResult<DirectConversation>> {
  const restricted = await restrictionResponse(userId, 'message');
  if (restricted) return { ok: false, code: 'restricted', response: restricted };
  const conversation = await findDm(conversationId);
  if (!conversation) return fail('not-found', 'Conversation not found', 404);
  if (conversation.participantOneId !== userId && conversation.participantTwoId !== userId) {
    return fail('not-member', 'Forbidden', 403);
  }
  // A block in either direction ends the conversation for sending (Saved Messages never blocks).
  const otherId =
    conversation.participantOneId === userId ? conversation.participantTwoId : conversation.participantOneId;
  if (await isBlockedPair(userId, otherId)) {
    return fail('blocked', 'You can no longer message this person', 403);
  }
  return { ok: true, value: conversation };
}

/**
 * Send into an existing DM (or Saved Messages). Every check runs here, so the
 * cron re-runs them at delivery time.
 */
export async function sendDirectMessage(opts: SendDirectOptions): Promise<
  SendResult<{
    message: SentDirectMessage;
  }>
> {
  const { userId, conversationId, input } = opts;

  let conversation = opts.conversation;
  if (!conversation) {
    const gate = await guardDirect(userId, conversationId);
    if (!gate.ok) return gate;
    conversation = gate.value;
  }
  // M2: a conversation with yourself is Saved Messages — no recipient to
  // notify, no DM-privacy rule to apply, nothing to count as unread.
  const isSavedChat = conversation.participantOneId === conversation.participantTwoId;

  // Images must belong to the sender (filename is prefixed with their id).
  if (input.imageUrls?.some((u) => !ownsFeedImageUrl(u, userId))) {
    return fail('invalid-image', 'Invalid image reference', 400);
  }
  const altFailure = await guardImageAlts(userId, input.imageUrls, input.imageAlts);
  if (altFailure) return altFailure;

  // Re-check DM privacy of recipient
  const recipientId =
    conversation.participantOneId === userId ? conversation.participantTwoId : conversation.participantOneId;

  // Per-(sender→recipient) limit: bounds targeted flooding of one person while
  // staying generous for a normal rapid exchange (~160/min effective).
  if (opts.pairRateLimit) {
    const pairRl = await checkRateLimit(`${userId}:${recipientId}`, {
      limit: 40,
      windowMs: 60_000,
      prefix: 'dm:to',
    });
    if (!pairRl.allowed) {
      return fail('rate-limited', "You're messaging this person too quickly. Please slow down.", 429, {
        'Retry-After': String(pairRl.retryAfter),
      });
    }
  }

  const recipient = isSavedChat
    ? null
    : await prisma.user.findUnique({
        where: {
          id: recipientId,
        },
        select: {
          profile: {
            select: {
              dmPrivacy: true,
            },
          },
        },
      });

  const dmPrivacy = recipient?.profile?.dmPrivacy ?? 'EVERYONE';

  if (dmPrivacy === 'NONE') {
    return fail('cannot-message', 'This user is no longer accepting messages.', 403);
  }

  if (dmPrivacy === 'FOLLOWERS') {
    const follows = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: recipientId,
          followingId: userId,
        },
      },
    });
    if (!follows) {
      return fail('cannot-message', 'This user only accepts messages from people they follow.', 403);
    }
  }

  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        chatId: conversationId,
        senderId: userId,
        content: input.content,
        gifUrl: input.gifUrl ?? null,
        imageUrls: input.imageUrls ?? [],
        imageAlts: normalizeImageAlts(input.imageUrls, input.imageAlts),
        read: isSavedChat,
        // M3 + M6: expiry from the chat's timer, and the shared-media flags.
        ...messageStamp(conversation.disappearAfterSec, input),
      },
    }),
    prisma.chat.update({
      where: {
        id: conversationId,
      },
      data: {
        lastMessageAt: new Date(),
      },
    }),
  ]);

  const messagePayload: SentDirectMessage = {
    id: message.id,
    conversationId,
    content: message.content,
    senderId: message.senderId,
    read: message.read,
    createdAt: message.createdAt.toISOString(),
    gifUrl: message.gifUrl,
    imageUrls: message.imageUrls,
    imageAlts: message.imageAlts,
    reactions: [],
    expiresAt: message.expiresAt?.toISOString() ?? null,
  };

  // Bump the recipient's denormalized unread counter (only if warm) before we
  // notify them, so their SSE stream reads the fresh count without a COUNT.
  if (!isSavedChat) {
    void adjustDmUnread(recipientId, 1);

    // Notify recipient via SSE with message payload
    notifyUser(recipientId, {
      type: 'new-message',
      message: messagePayload,
    });
  }

  return {
    ok: true,
    value: {
      message: messagePayload,
    },
  };
}

/** What a group message carries: the endpoint's parsed body. */
export interface GroupMessageInput {
  content?: string | undefined;
  gifUrl?: string | undefined;
  imageUrls?: string[] | undefined;
  imageAlts?: string[] | undefined;
  poll?:
    | {
        question: string;
        options: string[];
      }
    | undefined;
}

export interface SendGroupOptions {
  userId: string;
  groupId: string;
  input: GroupMessageInput;
  /** Already loaded by `guardGroup` (the endpoint does so before it reads the body). */
  membership?: GroupMembership;
}

export type GroupMembership = NonNullable<Awaited<ReturnType<typeof loadGroupMembership>>>;

function loadGroupMembership(groupId: string, userId: string) {
  return findGroupMembership(groupId, userId, { id: true, chat: { select: { disappearAfterSec: true } } });
}

/** Ban and restriction: the endpoint runs these before its IP rate limit. */
export async function guardGroupAccount(userId: string): Promise<SendFailure | null> {
  const ban = await getActiveBan(userId);
  if (ban) return fail('restricted', 'Your account is suspended', 403);
  const restricted = await restrictionResponse(userId, 'message');
  if (restricted) return { ok: false, code: 'restricted', response: restricted };
  return null;
}

/** Membership alone (the endpoint's second step, after its IP rate limit). */
export async function guardGroupMembership(userId: string, groupId: string): Promise<SendResult<GroupMembership>> {
  const membership = await loadGroupMembership(groupId, userId);
  if (!membership) return fail('not-member', 'Not found', 404);
  return { ok: true, value: membership };
}

/** Account checks then membership, for callers with no request (the cron). */
export async function guardGroup(userId: string, groupId: string): Promise<SendResult<GroupMembership>> {
  const denied = await guardGroupAccount(userId);
  if (denied) return denied;
  return guardGroupMembership(userId, groupId);
}

/** Send into a group chat the caller is a member of. */
export async function sendGroupMessage(opts: SendGroupOptions): Promise<
  SendResult<{
    message: GroupMessagePayload;
  }>
> {
  const { userId, groupId } = opts;
  const { content, gifUrl, imageUrls, imageAlts, poll } = opts.input;

  let membership = opts.membership;
  if (!membership) {
    const gate = await guardGroup(userId, groupId);
    if (!gate.ok) return gate;
    membership = gate.value;
  }

  const text = content?.trim() ?? '';
  const hasMedia = !!gifUrl || (imageUrls?.length ?? 0) > 0;
  if (!text && !hasMedia && !poll) return fail('empty', 'Empty message', 400);
  // Images must belong to the sender (filename is prefixed with their id).
  if (imageUrls?.some((u) => !ownsFeedImageUrl(u, userId))) {
    return fail('invalid-image', 'Invalid image reference', 400);
  }
  const altFailure = await guardImageAlts(userId, imageUrls, imageAlts);
  if (altFailure) return altFailure;

  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        chatId: groupId,
        senderId: userId,
        content: text,
        gifUrl: gifUrl ?? null,
        imageUrls: imageUrls ?? [],
        imageAlts: normalizeImageAlts(imageUrls, imageAlts),
        pollQuestion: poll?.question ?? null,
        pollOptions: poll?.options ?? [],
        // M3 + M6: expiry from the group's timer, and the shared-media flags.
        ...messageStamp(membership.chat.disappearAfterSec, {
          content: text,
          gifUrl,
          imageUrls,
        }),
      },
      select: groupMessageSelect,
    }),
    prisma.chat.update({
      where: {
        id: groupId,
      },
      data: {
        lastMessageAt: new Date(),
      },
    }),
    prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId: groupId,
          userId,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    }),
  ]);

  const [payload] = await serializeGroupMessages([message], userId);
  if (!payload) throw new Error('group message was not serialized');
  // Push to connected members over SSE (best-effort). myVote is per-viewer,
  // so it stays null in the fan-out; recipients haven't voted yet anyway.
  publishGroupMessage(groupId, {
    ...payload,
    poll: payload.poll
      ? {
          ...payload.poll,
          myVote: null,
        }
      : null,
  });

  return {
    ok: true,
    value: {
      message: payload,
    },
  };
}
