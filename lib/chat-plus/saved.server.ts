/**
 * M2 — Saved Messages: a conversation with yourself. Server-only.
 *
 * It is an ordinary `Conversation` whose two participants are the same user
 * (the `(participantOneId, participantTwoId)` unique key already allows it), so
 * it gets text, links, images, GIFs, voice notes, pins, search, reactions and
 * the media panel for free. What differs is only what it must NOT do: no unread
 * count, no recipient notification, no DM-privacy check, no call button. It is
 * created lazily on first open and excluded from the normal conversation list,
 * which pins it at the top as a separate row instead.
 */

import { prisma } from '@/lib/prisma.server';
import { conversationPreview } from '@/lib/messages/message-view';
import { liveMessages } from '@/lib/chat-plus/expiry.server';

export interface SavedSummary {
  conversationId: string;
  /** Plain text of the last note, or empty for media-only. */
  preview: string;
  previewKind: string;
  lastMessageAt: string;
}

export async function getSavedSummary(userId: string): Promise<SavedSummary | null> {
  const conv = await prisma.conversation.findUnique({
    where: {
      participantOneId_participantTwoId: { participantOneId: userId, participantTwoId: userId },
    },
    select: {
      id: true,
      lastMessageAt: true,
      messages: {
        where: { deletedAt: null, AND: [liveMessages()] },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, gifUrl: true, imageUrls: true, audioUrl: true, deletedAt: true },
      },
    },
  });
  if (!conv) return null;
  const last = conv.messages[0];
  const p = last ? conversationPreview(last) : { kind: 'empty', text: '' };
  return {
    conversationId: conv.id,
    preview: p.text,
    previewKind: p.kind,
    lastMessageAt: conv.lastMessageAt.toISOString(),
  };
}

/** The viewer's Saved Messages conversation id, creating it on first use. */
export async function ensureSavedConversation(userId: string): Promise<string> {
  const conv = await prisma.conversation.upsert({
    where: {
      participantOneId_participantTwoId: { participantOneId: userId, participantTwoId: userId },
    },
    create: { participantOneId: userId, participantTwoId: userId },
    update: {},
    select: { id: true },
  });
  return conv.id;
}
