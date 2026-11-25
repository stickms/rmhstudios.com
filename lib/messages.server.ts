import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { dmChatSelect, dmKeyOf, dmsOf, inboxVisibleTo, toDmRow } from '@/lib/chat/chat.server';
import { resolveUserDisplay } from '@/lib/user-display';
import { conversationPreview, type ConversationPreview } from '@/lib/messages/message-view';
import { liveMessages } from '@/lib/chat-plus/expiry.server';
import { folderChatIds } from '@/lib/chat-plus/folders.server';
import { receiptsHiddenFor } from '@/lib/chat-plus/receipts.server';
import { requestOut } from '@/lib/messages/requests';
import { listConversationPrefs } from '@/lib/notify/conversation-prefs.server';
import { dmScopeKey, marksOf, mergePinnedFirst } from '@/lib/messages/pins';
import { pinnedChatIds } from '@/lib/messages/pins.server';

export interface ConversationListItem {
  id: string;
  otherUser: { id: string; name: string | null; image: string | null; username: string | null; isBot: boolean };
  lastMessage: {
    id: string;
    content: string;
    /** 'text' | 'voice' | 'image' | 'gif' | 'deleted' | 'empty' — lets the UI say
     *  "Voice message" or "This message was deleted" in the viewer's language. */
    previewKind: ConversationPreview['kind'];
    senderId: string;
    read: boolean;
    createdAt: string;
    gifUrl: string | null;
    imageUrls: string[];
  } | null;
  unreadCount: number;
  lastMessageAt: string;
  /** s14-12: the member pinned this conversation. */
  pinned: boolean;
  /** s14-12: a mute is in force, or only mentions notify. */
  muted: boolean;
}

/**
 * List a user's DM conversations, most-recent first (cursor-paginated). Shared
 * by the `/api/messages` GET handler and the `/messages` route loader so the
 * inbox is server-rendered / prefetched instead of fetched on mount.
 */
export async function listConversations(
  userId: string,
  opts: {
    cursor?: string | null;
    limit?: number;
    /** M1 — only the chats in this folder. */
    folderId?: string | null;
    /** M1 — only conversations with something unread (the built-in "Unread" tab). */
    unreadOnly?: boolean;
  } = {}
): Promise<{ conversations: ConversationListItem[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = opts.limit ?? 20;
  const inFolder = opts.folderId ? await folderChatIds(userId, opts.folderId, 'dm') : undefined;
  // s14-12: only the default view (no folder, not "Unread") lifts pinned conversations to the top. Their ids leave
  // the paged query on EVERY page so the cursor walks one fixed set; the rows themselves join page one.
  const defaultView = !opts.folderId && !opts.unreadOnly;
  const pinnedIds = defaultView ? await pinnedChatIds(userId) : [];
  const userSelect = {
    id: true, name: true, image: true, username: true, isBot: true,
    profile: { select: { displayName: true, customImage: true } },
  } as const;
  const select = {
    ...dmChatSelect,
    members: { select: { userId: true, slot: true, user: { select: userSelect } }, orderBy: { slot: 'asc' } },
    messages: {
      // M3: an expired disappearing message is never the "last message".
      where: { AND: [liveMessages()] },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { id: true, content: true, senderId: true, read: true, createdAt: true, gifUrl: true, imageUrls: true, deletedAt: true, audioUrl: true },
    },
  } as const satisfies Prisma.ChatSelect;
  const baseWhere = {
    ...dmsOf(userId),
    // A message request waiting for this viewer (or declined by them) lives in the Requests folder.
    AND: [inboxVisibleTo(userId)],
    // M2: Saved Messages (a conversation with yourself) is pinned separately
    // at the top of the inbox, so it is not part of this paged list.
    NOT: { dmKey: dmKeyOf(userId, userId) },
  } satisfies Prisma.ChatWhereInput;
  // Explicit keyset (lastMessageAt, id) rather than Prisma's `cursor`: the cursor row may have been pinned (so the
  // `notIn` now excludes it) or hidden since the previous page, and the page must still resume exactly after it.
  const cursorRow = opts.cursor
    ? await prisma.chat.findUnique({ where: { id: opts.cursor }, select: { lastMessageAt: true } })
    : null;
  if (opts.cursor && !cursorRow) return { conversations: [], nextCursor: null, hasMore: false };
  const afterCursor: Prisma.ChatWhereInput[] = cursorRow
    ? [
        {
          OR: [
            { lastMessageAt: { lt: cursorRow.lastMessageAt } },
            { lastMessageAt: cursorRow.lastMessageAt, id: { lt: opts.cursor as string } },
          ],
        },
      ]
    : [];
  const pageRows = await prisma.chat.findMany({
    where: {
      ...baseWhere,
      AND: [inboxVisibleTo(userId), ...afterCursor],
      ...(inFolder ? { id: { in: inFolder } } : {}),
      ...(pinnedIds.length > 0 ? { id: { notIn: pinnedIds } } : {}),
      ...(opts.unreadOnly
        ? {
            messages: {
              some: { senderId: { not: userId }, read: false, deletedAt: null, AND: [liveMessages()] },
            },
          }
        : {}),
    },
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select,
  });
  // The pinned conversations the member is still in and can see (a left or hidden one is simply absent).
  const pinnedRows =
    pinnedIds.length > 0 && !opts.cursor
      ? await prisma.chat.findMany({ where: { ...baseWhere, id: { in: pinnedIds } }, select })
      : [];
  const hasMore = pageRows.length > limit;
  const shownPage = hasMore ? pageRows.slice(0, limit) : pageRows;
  const shownRows = [...pinnedRows, ...shownPage];
  const items = shownRows.flatMap((chat) => {
    const dm = toDmRow(chat);
    if (!dm) return [];
    const userOf = (id: string) => chat.members.find((m) => m.userId === id)?.user;
    const participantOne = userOf(dm.participantOneId);
    const participantTwo = userOf(dm.participantTwoId);
    if (!participantOne || !participantTwo) return [];
    return [{ ...dm, participantOne, participantTwo, messages: chat.messages }];
  });


  const unreadCounts = await prisma.chatMessage.groupBy({
    by: ['chatId'],
    where: {
      chatId: { in: items.map((c) => c.id) },
      senderId: { not: userId },
      read: false,
      AND: [liveMessages()],
    },
    _count: { id: true },
  });
  // M8: where either side has read receipts off, our own last message is never
  // reported as read. One batched query, and only when there is something to hide.
  const needsMask = items.some((c) => c.messages[0]?.senderId === userId && c.messages[0]?.read);
  const receiptsHidden = needsMask ? await receiptsHiddenFor(items) : new Set<string>();
  const unreadMap = new Map(unreadCounts.map((u) => [u.chatId, u._count.id]));

  // s14-12: one batched preference read per page gives every row its two marks.
  const prefs = await listConversationPrefs(userId, items.map((c) => dmScopeKey(c.id)));
  const result: ConversationListItem[] = items.map((conv) => {
    const otherUser = conv.participantOneId === userId ? conv.participantTwo : conv.participantOne;
    const resolved = resolveUserDisplay(otherUser);
    const lastMessage = conv.messages[0] ?? null;
    return {
      id: conv.id,
      otherUser: {
        id: otherUser.id,
        name: resolved.name,
        image: resolved.image,
        username: otherUser.username,
        isBot: otherUser.isBot,
      },
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            // Redacted through the shared preview helper rather than passed
            // through raw. An unsent message keeps its content column (so a
            // report stays reviewable), which means the inbox line would
            // otherwise still show the text after a reload — the one place
            // unsend visibly failed to take effect.
            content: conversationPreview(lastMessage).text,
            previewKind: conversationPreview(lastMessage).kind,
            senderId: lastMessage.senderId,
            read:
              lastMessage.read &&
              !(lastMessage.senderId === userId && (receiptsHidden.has(conv.id) || requestOut(conv.request, userId))),
            createdAt: lastMessage.createdAt.toISOString(),
            gifUrl: lastMessage.gifUrl,
            imageUrls: lastMessage.imageUrls,
          }
        : null,
      unreadCount: unreadMap.get(conv.id) ?? 0,
      lastMessageAt: conv.lastMessageAt.toISOString(),
      ...marksOf(prefs.get(dmScopeKey(conv.id))),
    };
  });
  const pinnedSet = new Set(pinnedRows.map((c) => c.id));
  const ordered = pinnedSet.size
    ? mergePinnedFirst(
        result.filter((c) => pinnedSet.has(c.id)),
        result.filter((c) => !pinnedSet.has(c.id)),
      )
    : result;

  return {
    conversations: ordered,
    nextCursor: hasMore ? shownPage[shownPage.length - 1].id : null,
    hasMore,
  };
}
