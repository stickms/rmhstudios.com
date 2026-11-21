/**
 * M8 — receipt and typing privacy, reciprocal. Server-only.
 *
 * (Sprint 06 #17 adds an account-wide default for both on `UserProfile`; the pure rule is `receipts.ts`.)
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
  const ids = [...new Set(participants)];
  // Saved Messages (a chat with yourself) has no other reader: never hidden.
  if (ids.length < 2) return { receiptsHidden: false, typingHidden: false };
  const [rows, profiles] = await Promise.all([
    prisma.conversationPref.findMany({
      where: { scopeKey: scopeKeyOf('dm', conversationId), userId: { in: ids } },
      select: { hideReceipts: true, hideTyping: true },
    }),
    // Sprint 06 #17: the account-wide switches, in the same round.
    prisma.userProfile.findMany({
      where: { userId: { in: ids } },
      select: { readReceipts: true, typingIndicators: true },
    }),
  ]);
  return {
    receiptsHidden: rows.some((r) => r.hideReceipts) || profiles.some((p) => !p.readReceipts),
    typingHidden: rows.some((r) => r.hideTyping) || profiles.some((p) => !p.typingIndicators),
  };
}

/** Receipts for a whole page of conversations (the inbox, search), two queries in parallel. */
export async function receiptsHiddenFor(
  conversations: { id: string; participantOneId: string; participantTwoId: string }[],
): Promise<Set<string>> {
  const pairs = conversations.filter((c) => c.participantOneId !== c.participantTwoId);
  if (pairs.length === 0) return new Set();
  const userIds = new Set<string>();
  for (const c of pairs) {
    userIds.add(c.participantOneId);
    userIds.add(c.participantTwoId);
  }
  const keys = pairs.map((c) => scopeKeyOf('dm', c.id));
  const [rows, off] = await Promise.all([
    prisma.conversationPref.findMany({
      where: { userId: { in: [...userIds] }, scopeKey: { in: keys }, hideReceipts: true },
      select: { scopeKey: true },
    }),
    prisma.userProfile.findMany({
      where: { userId: { in: [...userIds] }, readReceipts: false },
      select: { userId: true },
    }),
  ]);
  const hidden = new Set(rows.map((r) => r.scopeKey.slice('dm:'.length)));
  const offUsers = new Set(off.map((p) => p.userId));
  for (const c of pairs) {
    if (offUsers.has(c.participantOneId) || offUsers.has(c.participantTwoId)) hidden.add(c.id);
  }
  return hidden;
}

/** The viewer's own account-wide switches (for the options sheet). */
export async function getAccountReceiptPrefs(
  userId: string,
): Promise<{ readReceipts: boolean; typingIndicators: boolean }> {
  const row = await prisma.userProfile.findUnique({
    where: { userId },
    select: { readReceipts: true, typingIndicators: true },
  });
  return { readReceipts: row?.readReceipts ?? true, typingIndicators: row?.typingIndicators ?? true };
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
