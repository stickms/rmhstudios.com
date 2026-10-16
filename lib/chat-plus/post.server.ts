/**
 * One way to write a message into either kind of chat. Server-only.
 *
 * The pre-existing send routes keep their own code (they stamp `expiresAt` and
 * `attachFlags` with `messageStamp` below); everything P04 itself creates —
 * slash-command results, checklists, system lines, forwards and thread replies —
 * comes through here so expiry, flags, realtime fan-out and unread bookkeeping
 * are decided in exactly one place.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { notifyUser, type MessagePayload } from '@/lib/message-events';
import { publishGroupMessage, type GroupMessagePayload } from '@/lib/group-events';
import { groupMessageSelect, serializeGroupMessages } from '@/lib/group-chat/serialize.server';
import { toMessageView } from '@/lib/messages/message-view';
import { computeAttachFlags, expiryFor } from '@/lib/chat-plus/flags';
import { dmAudience, publishChatUpdate, type ChatAccess } from '@/lib/chat-plus/access.server';
import { adjustDmUnread } from '@/lib/chat-plus/unread.server';
import type { PollView, SystemAction, ThreadReply } from '@/lib/chat-plus/types';

/** The two columns every new message row gets. */
export function messageStamp(
  disappearAfterSec: number | null | undefined,
  parts: {
    content?: string | null;
    gifUrl?: string | null;
    imageUrls?: string[] | null;
    audioUrl?: string | null;
  },
  now: Date = new Date(),
): { expiresAt: Date | null; attachFlags: number } {
  return { expiresAt: expiryFor(disappearAfterSec, now), attachFlags: computeAttachFlags(parts) };
}

export interface PostInput {
  senderId: string;
  content: string;
  gifUrl?: string | null;
  imageUrls?: string[];
  kind?: string;
  meta?: Prisma.InputJsonValue;
  forwardCount?: number;
  /** Group legacy poll columns (used by `/poll` in a group chat). */
  poll?: { question: string; options: string[] };
  /** A DM poll's initial tallies, attached to the payload recipients receive. */
  dmPoll?: PollView;
  /** Group threads (M7). */
  threadParentId?: string;
  /** System lines (and self-notes) do not count as unread. */
  silent?: boolean;
  /** System lines skip the chat's disappearing timer. */
  noExpiry?: boolean;
}

export type PostedMessage =
  { kind: 'dm'; message: MessagePayload } | { kind: 'group'; message: GroupMessagePayload };

const dmSelect = {
  id: true,
  senderId: true,
  content: true,
  read: true,
  createdAt: true,
  gifUrl: true,
  imageUrls: true,
  editedAt: true,
  deletedAt: true,
  deletedBy: true,
  audioUrl: true,
  audioDurationMs: true,
  audioPeaks: true,
  kind: true,
  meta: true,
  forwardCount: true,
  expiresAt: true,
} as const;

export async function postChatMessage(
  access: ChatAccess,
  input: PostInput,
): Promise<PostedMessage> {
  const stamp = input.noExpiry
    ? { expiresAt: null, attachFlags: computeAttachFlags(input) }
    : messageStamp(access.disappearAfterSec, input);
  const kind = input.kind ?? 'text';

  if (access.kind === 'dm') {
    const silent = input.silent || access.isSelf;
    const row = await prisma
      .$transaction([
        prisma.directMessage.create({
          data: {
            conversationId: access.id,
            senderId: input.senderId,
            content: input.content,
            gifUrl: input.gifUrl ?? null,
            imageUrls: input.imageUrls ?? [],
            kind,
            meta: input.meta,
            forwardCount: input.forwardCount ?? 0,
            read: silent,
            ...stamp,
          },
          select: dmSelect,
        }),
        prisma.conversation.update({
          where: { id: access.id },
          data: { lastMessageAt: new Date() },
        }),
      ])
      .then(([m]) => m);

    const view = toMessageView(row);
    const payload: MessagePayload = {
      id: view.id,
      conversationId: access.id,
      content: view.content,
      senderId: view.senderId,
      read: view.read,
      createdAt: view.createdAt,
      gifUrl: view.gifUrl,
      imageUrls: view.imageUrls,
      reactions: [],
      kind: view.kind,
      meta: view.meta,
      forwardCount: view.forwardCount,
      expiresAt: view.expiresAt,
      poll: input.dmPoll ?? null,
    };

    // Ordinary messages go to the other side; system lines go to both (the
    // actor's other tabs need the line too).
    const audience =
      kind === 'system' || kind === 'tip'
        ? dmAudience(access)
        : access.otherId && access.otherId !== input.senderId
          ? [access.otherId]
          : [];
    if (!silent && access.otherId && access.otherId !== input.senderId) {
      await adjustDmUnread(access.otherId, 1);
    }
    for (const uid of audience) notifyUser(uid, { type: 'new-message', message: payload });
    return { kind: 'dm', message: payload };
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.groupMessage.create({
      data: {
        groupId: access.id,
        senderId: input.senderId,
        content: input.content,
        gifUrl: input.gifUrl ?? null,
        imageUrls: input.imageUrls ?? [],
        pollQuestion: input.poll?.question ?? null,
        pollOptions: input.poll?.options ?? [],
        kind,
        meta: input.meta,
        forwardCount: input.forwardCount ?? 0,
        threadParentId: input.threadParentId ?? null,
        ...stamp,
      },
      select: groupMessageSelect,
    }),
    prisma.groupChat.update({ where: { id: access.id }, data: { lastMessageAt: new Date() } }),
    prisma.groupChatMember.update({
      where: { groupId_userId: { groupId: access.id, userId: input.senderId } },
      data: { lastReadAt: new Date() },
    }),
  ];
  if (input.threadParentId) {
    ops.push(
      prisma.groupMessage.update({
        where: { id: input.threadParentId },
        data: { replyCount: { increment: 1 } },
        select: { replyCount: true },
      }),
    );
  }
  const results = await prisma.$transaction(ops);
  const row = results[0] as Parameters<typeof serializeGroupMessages>[0][number];
  const [payload] = await serializeGroupMessages([row], input.senderId);

  if (input.threadParentId) {
    const replyCount = (results[3] as { replyCount: number }).replyCount;
    const reply: ThreadReply = {
      id: payload.id,
      content: payload.content,
      createdAt: payload.createdAt,
      sender: payload.sender,
    };
    publishChatUpdate(access, {
      kind: 'group',
      chatId: access.id,
      op: 'thread',
      parentId: input.threadParentId,
      replyCount,
      reply,
    });
  } else {
    publishGroupMessage(access.id, {
      ...payload,
      poll: payload.poll ? { ...payload.poll, myVote: null } : null,
    });
  }
  return { kind: 'group', message: payload };
}

/** Plain-English fallback stored in `content` for a system action. */
export function systemFallback(action: SystemAction): string {
  switch (action.action) {
    case 'timer':
      return action.seconds
        ? `Disappearing messages set to ${
            action.seconds === 3600 ? '1 hour' : action.seconds === 86_400 ? '1 day' : '7 days'
          }`
        : 'Disappearing messages turned off';
    case 'theme':
      return action.themeKey ? 'Chat theme changed' : 'Chat theme reset';
    case 'pin':
      return action.pinned ? 'Pinned a message' : 'Unpinned a message';
    case 'tip':
      return `Tipped ${action.amount} coins`;
  }
}

/** Post a centred system line ("Sam set disappearing messages to 1 day"). */
export async function postSystemLine(
  access: ChatAccess,
  actorId: string,
  action: SystemAction,
): Promise<PostedMessage> {
  return postChatMessage(access, {
    senderId: actorId,
    content: systemFallback(action),
    kind: action.action === 'tip' ? 'tip' : 'system',
    meta: action as unknown as Prisma.InputJsonValue,
    silent: true,
    noExpiry: true,
  });
}
