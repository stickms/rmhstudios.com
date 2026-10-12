/**
 * M6 — pinned messages. Server-only.
 *
 * Pins live in their own small table (`ChatPin`) rather than as a column on the
 * message rows: a chat has at most ten of them, the lookup is one indexed read
 * on `(scopeKey, createdAt)`, and it adds nothing to the hot message tables.
 */

import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { type ChatAccess, publishChatUpdate } from '@/lib/chat-plus/access.server';
import { liveMessages } from '@/lib/chat-plus/expiry.server';
import { postSystemLine } from '@/lib/chat-plus/post.server';
import { MAX_PINS_PER_CHAT } from '@/lib/chat-plus/types';
import type { PinView } from '@/lib/chat-plus/settings.client';

export type { PinView };

interface PinnedRow {
  id: string;
  senderId: string;
  content: string;
  createdAt: Date;
  gifUrl: string | null;
  imageUrls: string[];
  audioUrl: string | null;
  kind: string;
}

async function loadPinnedMessages(
  access: ChatAccess,
  ids: string[],
): Promise<Map<string, PinnedRow & { senderName: string | null }>> {
  const out = new Map<string, PinnedRow & { senderName: string | null }>();
  if (ids.length === 0) return out;
  const live = liveMessages();
  if (access.kind === 'dm') {
    const rows = await prisma.directMessage.findMany({
      where: { id: { in: ids }, conversationId: access.id, deletedAt: null, AND: [live] },
      select: {
        id: true,
        senderId: true,
        content: true,
        createdAt: true,
        gifUrl: true,
        imageUrls: true,
        audioUrl: true,
        kind: true,
      },
    });
    for (const r of rows) out.set(r.id, { ...r, senderName: null });
  } else {
    const rows = await prisma.groupMessage.findMany({
      where: { id: { in: ids }, groupId: access.id, deletedAt: null, AND: [live] },
      select: {
        id: true,
        senderId: true,
        content: true,
        createdAt: true,
        gifUrl: true,
        imageUrls: true,
        audioUrl: true,
        kind: true,
        sender: { select: userDisplaySelect },
      },
    });
    for (const { sender, ...r } of rows) {
      out.set(r.id, { ...r, senderName: resolveUser(sender).name });
    }
  }
  return out;
}

/** The chat's pins, newest first. Pins whose message is gone are skipped. */
export async function listPins(access: ChatAccess): Promise<PinView[]> {
  const pins = await prisma.chatPin.findMany({
    where: { scopeKey: access.scopeKey },
    orderBy: { createdAt: 'desc' },
    take: MAX_PINS_PER_CHAT,
    select: { messageId: true, createdAt: true, pinnedById: true },
  });
  if (pins.length === 0) return [];
  const messages = await loadPinnedMessages(
    access,
    pins.map((p) => p.messageId),
  );
  const views: PinView[] = [];
  for (const p of pins) {
    const m = messages.get(p.messageId);
    if (!m) continue;
    views.push({
      messageId: m.id,
      text: m.content.replace(/\s+/g, ' ').trim().slice(0, 140),
      hasMedia: m.imageUrls.length > 0 || !!m.gifUrl || !!m.audioUrl,
      senderId: m.senderId,
      senderName: m.senderName,
      createdAt: m.createdAt.toISOString(),
      pinnedById: p.pinnedById,
    });
  }
  return views;
}

export type PinResult = { ok: true } | { ok: false; status: number; error: string };

export async function setPin(
  access: ChatAccess,
  messageId: string,
  pinned: boolean,
): Promise<PinResult> {
  if (pinned) {
    const found = await loadPinnedMessages(access, [messageId]);
    const msg = found.get(messageId);
    if (!msg || msg.kind === 'system' || msg.kind === 'tip') {
      return { ok: false, status: 404, error: 'Message not found' };
    }
    const existing = await prisma.chatPin.findUnique({
      where: { scopeKey_messageId: { scopeKey: access.scopeKey, messageId } },
      select: { id: true },
    });
    if (existing) return { ok: true };
    const count = await prisma.chatPin.count({ where: { scopeKey: access.scopeKey } });
    if (count >= MAX_PINS_PER_CHAT) {
      return { ok: false, status: 409, error: `You can pin up to ${MAX_PINS_PER_CHAT} messages` };
    }
    await prisma.chatPin.create({
      data: { scopeKey: access.scopeKey, messageId, pinnedById: access.viewerId },
    });
  } else {
    const res = await prisma.chatPin.deleteMany({
      where: { scopeKey: access.scopeKey, messageId },
    });
    if (res.count === 0) return { ok: true };
  }
  await postSystemLine(access, access.viewerId, {
    action: 'pin',
    pinned,
    actorId: access.viewerId,
  });
  publishChatUpdate(access, { kind: access.kind, chatId: access.id, op: 'pins' });
  return { ok: true };
}
