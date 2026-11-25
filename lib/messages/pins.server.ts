/**
 * Pinned direct conversations (s14-12): which chats a member pinned, and the one write that pins or unpins one.
 *
 * The pin is `ConversationPref.pinned` on the `dm:<chatId>` scope. The cap of {@link CONVERSATION_PIN_LIMIT} is a
 * check-then-write, so it runs in one transaction after `lockKey(tx, 'conversation-pins:<userId>')`: two concurrent
 * sixth pins queue behind the lock and the second sees five. A pin whose chat the member left, or can no longer see,
 * is skipped on read and cleared by the next pin write, so a `GET` never writes.
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { dmKeyOf, dmsOf, inboxVisibleTo } from '@/lib/chat/chat.server';
import { toView, type ConversationPrefView } from '@/lib/notify/conversation-prefs.server';
import { CONVERSATION_PIN_LIMIT, chatIdOfDmScope, dmScopeKey } from '@/lib/messages/pins';

/** Rows read for the member's pins. Far above the limit, so stale pins never hide a live one. */
const PIN_READ_CAP = 50;

/** The chat ids the member pinned (direct conversations only). Includes stale ones; the list query filters them. */
export async function pinnedChatIds(userId: string): Promise<string[]> {
  const rows = await prisma.conversationPref.findMany({
    where: { userId, pinned: true, scopeKey: { startsWith: 'dm:' } },
    select: { scopeKey: true },
    take: PIN_READ_CAP,
  });
  return rows.flatMap((r) => {
    const id = chatIdOfDmScope(r.scopeKey);
    return id ? [id] : [];
  });
}

export type SetPinnedResult = { ok: true; pref: ConversationPrefView } | { ok: false; reason: 'not-member' | 'limit' };

/** `where` for a direct conversation this member is in, can see in the inbox, and that is not Saved Messages. */
function pinnableChat(userId: string): { AND: object[]; NOT: { dmKey: string } } {
  return { AND: [dmsOf(userId), inboxVisibleTo(userId)], NOT: { dmKey: dmKeyOf(userId, userId) } };
}

/**
 * Pin or unpin one direct conversation. Pinning needs the caller to be in the chat (`not-member` otherwise, so a
 * fabricated key cannot use up slots) and fewer than the limit pinned; it first clears pins that no longer point at a
 * conversation the member can see. Unpinning never takes the cap check.
 */
export async function setPinned(userId: string, chatId: string, pinned: boolean): Promise<SetPinnedResult> {
  const scopeKey = dmScopeKey(chatId);
  if (!pinned) {
    await prisma.conversationPref.updateMany({ where: { userId, scopeKey }, data: { pinned: false } });
    const row = await prisma.conversationPref.findUnique({
      where: { userId_scopeKey: { userId, scopeKey } },
      select: { muteUntil: true, mentionsOnly: true, pinned: true },
    });
    return { ok: true, pref: toView(scopeKey, row) };
  }

  return prisma.$transaction(async (tx): Promise<SetPinnedResult> => {
    await lockKey(tx, `conversation-pins:${userId}`);

    const chat = await tx.chat.findFirst({ where: { id: chatId, ...pinnableChat(userId) }, select: { id: true } });
    if (!chat) return { ok: false, reason: 'not-member' };

    const held = await tx.conversationPref.findMany({
      where: { userId, pinned: true, scopeKey: { startsWith: 'dm:' } },
      select: { scopeKey: true },
      take: PIN_READ_CAP,
    });
    const heldIds = held.flatMap((r) => {
      const id = chatIdOfDmScope(r.scopeKey);
      return id ? [id] : [];
    });
    const live = new Set(
      heldIds.length === 0
        ? []
        : (
            await tx.chat.findMany({ where: { id: { in: heldIds }, ...pinnableChat(userId) }, select: { id: true } })
          ).map((c) => c.id),
    );
    const stale = heldIds.filter((id) => !live.has(id));
    if (stale.length > 0) {
      await tx.conversationPref.updateMany({
        where: { userId, scopeKey: { in: stale.map(dmScopeKey) } },
        data: { pinned: false },
      });
    }

    if (!live.has(chatId) && live.size >= CONVERSATION_PIN_LIMIT) return { ok: false, reason: 'limit' };

    const row = await tx.conversationPref.upsert({
      where: { userId_scopeKey: { userId, scopeKey } },
      create: { userId, scopeKey, pinned: true },
      update: { pinned: true },
      select: { muteUntil: true, mentionsOnly: true, pinned: true },
    });
    return { ok: true, pref: toView(scopeKey, row) };
  });
}
