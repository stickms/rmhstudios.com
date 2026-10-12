/**
 * M6 — the per-chat "Media & links" panel. Server-only.
 *
 * Reads the `attachFlags` column through its own composite index
 * `(chatId, attachFlags, createdAt)`, newest first, cursor-paginated — never a
 * scan over the whole conversation.
 */

import { prisma } from '@/lib/prisma.server';
import type { ChatAccess } from '@/lib/chat-plus/access.server';
import { liveMessages } from '@/lib/chat-plus/expiry.server';
import { extractLinks, flagsForTab } from '@/lib/chat-plus/flags';

export interface MediaItem {
  messageId: string;
  senderId: string;
  createdAt: string;
  type: 'image' | 'gif' | 'voice';
  url: string;
}
export interface LinkItem {
  messageId: string;
  senderId: string;
  createdAt: string;
  url: string;
}
export interface MediaPage<T> {
  items: T[];
  nextCursor: string | null;
}

const PAGE = 30;

type Row = {
  id: string;
  senderId: string;
  content: string;
  createdAt: Date;
  gifUrl: string | null;
  imageUrls: string[];
  audioUrl: string | null;
};

async function fetchRows(
  access: ChatAccess,
  tab: 'media' | 'links',
  cursor: string | null,
): Promise<Row[]> {
  const select = {
    id: true,
    senderId: true,
    content: true,
    createdAt: true,
    gifUrl: true,
    imageUrls: true,
    audioUrl: true,
  } as const;
  const common = {
    orderBy: { createdAt: 'desc' as const },
    take: PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select,
  };
  const flags = { in: flagsForTab(tab) };
  if (access.kind === 'dm') {
    const rows = await prisma.directMessage.findMany({
      where: {
        conversationId: access.id,
        attachFlags: flags,
        deletedAt: null,
        AND: [liveMessages()],
      },
      ...common,
    });
    if (rows.length === 0) return rows;
    // "Delete for me" must hide a message from this viewer's panel as well.
    const hides = await prisma.directMessageHide.findMany({
      where: { userId: access.viewerId, messageId: { in: rows.map((r) => r.id) } },
      select: { messageId: true },
    });
    const hidden = new Set(hides.map((h) => h.messageId));
    return hidden.size ? rows.filter((r) => !hidden.has(r.id)) : rows;
  }
  return prisma.groupMessage.findMany({
    where: { groupId: access.id, attachFlags: flags, deletedAt: null, AND: [liveMessages()] },
    ...common,
  });
}

export async function listSharedMedia(
  access: ChatAccess,
  tab: 'media',
  cursor: string | null,
): Promise<MediaPage<MediaItem>>;
export async function listSharedMedia(
  access: ChatAccess,
  tab: 'links',
  cursor: string | null,
): Promise<MediaPage<LinkItem>>;
export async function listSharedMedia(
  access: ChatAccess,
  tab: 'media' | 'links',
  cursor: string | null,
): Promise<MediaPage<MediaItem> | MediaPage<LinkItem>> {
  const rows = await fetchRows(access, tab, cursor);
  const hasMore = rows.length > PAGE;
  const page = hasMore ? rows.slice(0, PAGE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  if (tab === 'media') {
    const items: MediaItem[] = [];
    for (const r of page) {
      const base = { messageId: r.id, senderId: r.senderId, createdAt: r.createdAt.toISOString() };
      for (const url of r.imageUrls) items.push({ ...base, type: 'image', url });
      if (r.gifUrl) items.push({ ...base, type: 'gif', url: r.gifUrl });
      if (r.audioUrl) items.push({ ...base, type: 'voice', url: r.audioUrl });
    }
    return { items, nextCursor };
  }
  const items: LinkItem[] = [];
  for (const r of page) {
    for (const url of extractLinks(r.content, 5)) {
      items.push({
        messageId: r.id,
        senderId: r.senderId,
        createdAt: r.createdAt.toISOString(),
        url,
      });
    }
  }
  return { items, nextCursor };
}
