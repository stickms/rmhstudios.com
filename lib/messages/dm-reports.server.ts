/**
 * Reports of a direct or group message (s13-17).
 *
 * - `dmReportTarget`: who a report of the message is about, only for a member of its conversation who did not write
 *   it. Anyone else gets the same `not-found` as an unknown id, so message ids cannot be probed.
 * - `dmReportViews`: the one message a moderator reads (text, time, earlier versions), never the conversation around it.
 * - `takeDownDmMessage`: remove the message as a moderator; both members see the existing deleted-message row.
 */
import { prisma } from '@/lib/prisma.server';
import { getChatAccess } from '@/lib/chat-plus/access.server';
import { publishGroupEvent } from '@/lib/group-events';
import { findDm } from '@/lib/chat/chat.server';
import { isLineKind, type ChatKind } from '@/lib/chat-plus/types';
import { DELETED_BY_MODERATOR } from '@/lib/messages/edit-policy';
import { readPriorRevisionsFor } from '@/lib/messages/edit-history.server';
import { publishMutation } from '@/lib/messages/mutations.server';
import type { DmReportView } from '@/lib/messages/dm-report';

export type DmReportTarget = { ok: true; authorId: string } | { ok: false; reason: 'not-found' | 'own' };

/** The member who wrote a message, with no membership check (the report route's best-effort target lookup). */
export async function dmMessageAuthor(messageId: string): Promise<string | null> {
  const row = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { senderId: true } });
  return row?.senderId ?? null;
}

/**
 * May `reporterId` report this message, and who is it about? A message that is gone, unsent, expired, a system or
 * tip line, or in a conversation the reporter is not in reads `not-found`; the reporter's own reads `own`.
 */
export async function dmReportTarget(
  messageId: string,
  reporterId: string,
  now: Date = new Date(),
): Promise<DmReportTarget> {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      senderId: true,
      chatId: true,
      kind: true,
      deletedAt: true,
      expiresAt: true,
      chat: { select: { kind: true } },
    },
  });
  if (!message) return { ok: false, reason: 'not-found' };
  if (message.deletedAt || isLineKind(message.kind)) return { ok: false, reason: 'not-found' };
  if (message.expiresAt && message.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'not-found' };
  const kind: ChatKind = message.chat.kind === 'group' ? 'group' : 'dm';
  const access = await getChatAccess(kind, message.chatId, reporterId);
  if (!access) return { ok: false, reason: 'not-found' };
  if (message.senderId === reporterId) return { ok: false, reason: 'own' };
  return { ok: true, authorId: message.senderId };
}

/**
 * The moderator's view of each reported message, keyed by message id. A moderation read path (admin only): an unsent
 * message is still readable here, which is the point of keeping the row.
 */
export async function dmReportViews(ids: readonly string[]): Promise<Map<string, DmReportView>> {
  const out = new Map<string, DmReportView>();
  if (ids.length === 0) return out;
  const [rows, versions] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        content: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
        gifUrl: true,
        imageUrls: true,
        imageAlts: true,
        chat: { select: { kind: true } },
      },
    }),
    readPriorRevisionsFor(ids),
  ]);
  for (const row of rows) {
    out.set(row.id, {
      conversation: row.chat.kind === 'group' ? 'group' : 'direct',
      at: row.createdAt.toISOString(),
      edited: row.editedAt !== null,
      removed: row.deletedAt !== null,
      text: row.content,
      hasImage: row.imageUrls.length > 0 || !!row.gifUrl,
      imageAlts: row.imageAlts.map((a) => a.trim()).filter(Boolean),
      versions: versions.get(row.id) ?? [],
    });
  }
  return out;
}

export interface DmTakedown {
  /** The message was removed by this call (false: gone already, or already unsent). */
  removed: boolean;
}

/**
 * Remove a reported message as a moderator.
 *
 * A direct message keeps its row (`deletedAt`, `deletedBy: 'moderator'`) so both members see the deleted-message row
 * and the text stays readable to moderators, exactly as an unsend does; open threads are told. A group chat has no
 * deleted-message row (its readers do not redact), so a group message is deleted outright. Idempotent.
 */
export async function takeDownDmMessage(messageId: string, now: Date = new Date()): Promise<DmTakedown> {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { chatId: true, senderId: true, threadParentId: true, chat: { select: { kind: true } } },
  });
  if (!message) return { removed: false };

  if (message.chat.kind === 'group') {
    // s14-20: a thread reply takes one off its parent's reply count in the same transaction, never below zero (the
    // delete cascades the reply's reactions and versions). A top-level message has no parent: a plain delete.
    const parentId = message.threadParentId;
    const { count } = parentId
      ? await prisma.$transaction(async (tx) => {
          const deleted = await tx.chatMessage.deleteMany({ where: { id: messageId } });
          if (deleted.count > 0) {
            await tx.chatMessage.updateMany({
              where: { id: parentId, replyCount: { gt: 0 } },
              data: { replyCount: { decrement: 1 } },
            });
          }
          return deleted;
        })
      : await prisma.chatMessage.deleteMany({ where: { id: messageId } });
    if (count > 0) {
      // Open group views drop the line now rather than at the next reload.
      publishGroupEvent(message.chatId, {
        type: 'chat-update',
        update: { kind: 'group', chatId: message.chatId, op: 'removed', messageId },
      });
    }
    return { removed: count > 0 };
  }

  const claimed = await prisma.chatMessage.updateMany({
    where: { id: messageId, deletedAt: null },
    data: { deletedAt: now, deletedBy: DELETED_BY_MODERATOR },
  });
  if (claimed.count === 0) return { removed: false };

  // Reactions point at content that is gone.
  await prisma.chatMessageReaction.deleteMany({ where: { messageId } }).catch(() => ({ count: 0 }));

  const [row, dm] = await Promise.all([
    prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        content: true,
        editedAt: true,
        deletedAt: true,
        deletedBy: true,
        gifUrl: true,
        gifAlt: true,
        imageUrls: true,
        imageAlts: true,
        audioUrl: true,
      },
    }),
    findDm(message.chatId),
  ]);
  if (row && dm) {
    await publishMutation('message-deleted', {
      conversation: dm,
      actorId: message.senderId,
      row: { ...row, conversationId: message.chatId },
    }).catch(() => undefined);
  }
  return { removed: true };
}
