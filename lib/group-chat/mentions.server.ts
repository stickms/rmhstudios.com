/**
 * Group @mentions, server half (s07-05). Server-only.
 *
 * `recordMentions` runs after a group message has been written: one membership read, one `createMany`. Notifying is a
 * second step the send path runs after that and never lets fail the send. A group message cannot be edited today
 * (`lib/messages/mutations.server.ts` covers direct messages); a future group edit must call `recordMentions` with the
 * previous content and notify only newly mentioned members.
 */
import { prisma } from '@/lib/prisma.server';
import { mapWithConcurrency } from '@/lib/async-pool';
import { createNotification } from '@/lib/notifications.server';
import { scopeKeyFor } from '@/lib/notify/conversation-prefs.server';
import { liveMessages } from '@/lib/chat-plus/expiry.server';
import { userChipSelect } from '@/lib/user-display';
import { mentionTargets } from '@/lib/group-chat/mentions';
import type { MyMentionRow } from '@/lib/group-chat/mentions.contract';

const NOTIFY_CONCURRENCY = 4;
export const MENTIONS_PAGE = 20;
const SNIPPET = 160;

export interface RecordMentionsInput {
  messageId: string;
  chatId: string;
  content: string;
  senderId: string;
}

export interface RecordedMentions {
  /** Everyone the message mentions (stored). */
  mentioned: string[];
  /** The first ten, minus anyone banned: who may be notified. */
  notify: string[];
}

/** Store the message's mentions of current members. Returns nothing to do when the text names no member. */
export async function recordMentions(input: RecordMentionsInput): Promise<RecordedMentions> {
  if (!input.content.includes('@'))
    return {
      mentioned: [],
      notify: [],
    };
  const members = await prisma.chatMember.findMany({
    where: {
      chatId: input.chatId,
    },
    select: {
      userId: true,
      user: {
        select: {
          handle: true,
          bannedUntil: true,
        },
      },
    },
  });
  const rows = Array.isArray(members) ? members : [];
  const { mentioned, notify } = mentionTargets(
    input.content,
    rows.map((m) => ({
      id: m.userId,
      handle: m.user.handle,
    })),
    input.senderId,
  );
  if (mentioned.length === 0)
    return {
      mentioned,
      notify,
    };
  await prisma.chatMention.createMany({
    data: mentioned.map((userId) => ({
      messageId: input.messageId,
      chatId: input.chatId,
      userId,
    })),
    skipDuplicates: true,
  });
  const now = Date.now();
  const banned = new Set(
    rows.filter((m) => m.user.bannedUntil && m.user.bannedUntil.getTime() > now).map((m) => m.userId),
  );
  return {
    mentioned,
    notify: notify.filter((id) => !banned.has(id)),
  };
}

export interface NotifyMentionsInput {
  messageId: string;
  chatId: string;
  groupName: string;
  content: string;
  senderId: string;
  notify: readonly string[];
}

/**
 * One SYSTEM notification per mentioned member, through `createNotification` with the group's conversation key, so All
 * and Mentions only deliver and None stays silent (mute outranks mentions), and preferences and quiet hours apply. A block
 * in either direction with the sender skips the member. Returns how many were handed to `createNotification`.
 */
export async function notifyMentions(input: NotifyMentionsInput): Promise<number> {
  if (input.notify.length === 0) return 0;
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [
        {
          blockerId: input.senderId,
          blockedId: {
            in: [...input.notify],
          },
        },
        {
          blockedId: input.senderId,
          blockerId: {
            in: [...input.notify],
          },
        },
      ],
    },
    select: {
      blockerId: true,
      blockedId: true,
    },
  });
  const blocked = new Set<string>();
  for (const b of Array.isArray(blocks) ? blocks : []) {
    blocked.add(b.blockerId === input.senderId ? b.blockedId : b.blockerId);
  }
  const recipients = input.notify.filter((id) => !blocked.has(id) && id !== input.senderId);
  const preview = `${input.groupName}: ${input.content.trim().slice(0, 120)}`;
  await mapWithConcurrency(recipients, NOTIFY_CONCURRENCY, async (userId) => {
    try {
      await createNotification({
        userId,
        actorId: input.senderId,
        type: 'SYSTEM',
        entityType: 'group-mention',
        entityId: input.messageId,
        preview,
        link: `/groups/${input.chatId}#group-message-${input.messageId}`,
        conversationKey: scopeKeyFor('group', input.chatId),
        addressed: true,
      });
    } catch {
      /* one recipient failing never stops the rest, or the send */
    }
  });
  return recipients.length;
}

/** The viewer's own mentions in one group, newest first, paged by `createdAt` cursor. Blocked senders and gone messages are left out. */
export async function listMyMentions(
  userId: string,
  chatId: string,
  cursor: string | null,
): Promise<{
  mentions: MyMentionRow[];
  next: string | null;
}> {
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [
        {
          blockerId: userId,
        },
        {
          blockedId: userId,
        },
      ],
    },
    select: {
      blockerId: true,
      blockedId: true,
    },
  });
  const blockedIds = (Array.isArray(blocks) ? blocks : []).map((b) =>
    b.blockerId === userId ? b.blockedId : b.blockerId,
  );
  const before = cursor ? new Date(cursor) : null;
  const rows = await prisma.chatMention.findMany({
    where: {
      userId,
      chatId,
      ...(before && !Number.isNaN(before.getTime())
        ? {
            createdAt: {
              lt: before,
            },
          }
        : {}),
      message: {
        deletedAt: null,
        threadParentId: null,
        AND: [liveMessages()],
        ...(blockedIds.length
          ? {
              senderId: {
                notIn: blockedIds,
              },
            }
          : {}),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: MENTIONS_PAGE + 1,
    select: {
      messageId: true,
      createdAt: true,
      message: {
        select: {
          content: true,
          sender: {
            select: userChipSelect,
          },
        },
      },
    },
  });
  const page = rows.slice(0, MENTIONS_PAGE);
  const last = page[page.length - 1];
  return {
    mentions: page.map((r) => ({
      messageId: r.messageId,
      createdAt: r.createdAt.toISOString(),
      snippet: r.message.content.slice(0, SNIPPET),
      sender: {
        id: r.message.sender.id,
        name: r.message.sender.name,
        handle: r.message.sender.handle,
      },
    })),
    next: rows.length > MENTIONS_PAGE && last ? last.createdAt.toISOString() : null,
  };
}

/** Account erasure: mentions that name the member go; rows where the member wrote the message stay with the message. */
export function groupMentionErasureOps(userId: string) {
  return [
    prisma.chatMention.deleteMany({
      where: {
        userId,
      },
    }),
  ];
}

/** The send path's one call: record, then notify. Any failure is swallowed (logged) so the message is still sent. */
export async function afterGroupMessage(input: Omit<NotifyMentionsInput, 'notify'>): Promise<void> {
  try {
    const { notify } = await recordMentions(input);
    await notifyMentions({
      ...input,
      notify,
    });
  } catch (error) {
    console.error('group mentions failed', error);
  }
}
