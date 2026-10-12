/**
 * M8 — receipt and typing privacy, reciprocal. Server-only.
 *
 * Each participant has two per-conversation switches (stored on
 * `ConversationPref`). Both are reciprocal: if EITHER side has one off, nobody
 * in that conversation sees that signal — you cannot hide your own receipts
 * while still watching theirs.
 *
 * Gated at the source: `typing.ts` does not publish the event, `read.ts` does
 * not publish the read ping, and the read-path serialisers blank `read` on the
 * viewer's own messages, so the signal cannot leak through the API either.
 */

import { prisma } from '@/lib/prisma.server';
import { scopeKeyOf } from '@/lib/chat-plus/types';

export interface PairPrivacy {
  /** Either participant has read receipts off. */
  receiptsHidden: boolean;
  /** Either participant has typing indicators off. */
  typingHidden: boolean;
}

export async function getPairPrivacy(
  conversationId: string,
  participants: readonly [string, string],
): Promise<PairPrivacy> {
  const rows = await prisma.conversationPref.findMany({
    where: {
      scopeKey: scopeKeyOf('dm', conversationId),
      userId: { in: [...new Set(participants)] },
    },
    select: { hideReceipts: true, hideTyping: true },
  });
  return {
    receiptsHidden: rows.some((r) => r.hideReceipts),
    typingHidden: rows.some((r) => r.hideTyping),
  };
}

/** Receipts for a whole page of conversations (the inbox), one query. */
export async function receiptsHiddenFor(
  conversations: { id: string; participantOneId: string; participantTwoId: string }[],
): Promise<Set<string>> {
  if (conversations.length === 0) return new Set();
  const userIds = new Set<string>();
  for (const c of conversations) {
    userIds.add(c.participantOneId);
    userIds.add(c.participantTwoId);
  }
  const keys = conversations.map((c) => scopeKeyOf('dm', c.id));
  const rows = await prisma.conversationPref.findMany({
    where: { userId: { in: [...userIds] }, scopeKey: { in: keys }, hideReceipts: true },
    select: { scopeKey: true },
  });
  return new Set(rows.map((r) => r.scopeKey.slice('dm:'.length)));
}

/** Blank `read` on the viewer's own messages when receipts are hidden. */
export function maskReceipts<T extends { senderId: string; read?: boolean }>(
  rows: T[],
  viewerId: string,
  hidden: boolean,
): T[] {
  if (!hidden) return rows;
  return rows.map((r) => (r.senderId === viewerId && r.read ? { ...r, read: false } : r));
}
