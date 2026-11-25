/**
 * A push when someone sends a member a direct message (sprint 13 20). Server-only.
 *
 * The push says who it is from and nothing else: no message text, no attachment name or description, no conversation
 * name. A lock screen is not private, and a member who wants the words opens the app. It goes through `dispatch()` with
 * the `messages` category (push on, in-app off), so the member's switches, the conversation's mute (`dm:<id>`) and quiet
 * hours (held, replayed once per conversation) all apply before anything reaches a device.
 *
 * Called by `sendDirectMessage` after the message is written, so a scheduled message pushes too. Held message requests,
 * Saved Messages and the away auto-reply (which is written by `postChatMessage`, not by a person) never reach it.
 */
import { prisma } from '@/lib/prisma.server';
import { dispatch } from '@/lib/notify/dispatch.server';
import { redisIncrBy } from '@/lib/redis.server';
import { notice } from '@/lib/notifications/notice-keys';
import { getConversationPref, scopeKeyFor, shouldDeliver } from '@/lib/notify/conversation-prefs.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';

/** At most one push per conversation per this long, however many messages arrive. */
export const MESSAGE_PUSH_WINDOW_MS = 2 * 60 * 1000;

/** The name a push gives for a sender whose name is empty. */
const FALLBACK_NAME = 'Someone';

/** In-process fallback for the coalescing key when Redis is off: key to the time the window ends. */
const localWindows = new Map<string, number>();

/** Test hook: forget every in-process window. */
export function resetMessagePushWindows(): void {
  localWindows.clear();
}

/**
 * True for the first message of a window (the one that pushes), false for the rest. Redis holds the key when it is on;
 * otherwise this process does.
 */
async function claimWindow(recipientId: string, conversationId: string, now: number): Promise<boolean> {
  const key = `dm-push:${recipientId}:${conversationId}`;
  const count = await redisIncrBy(key, 1, MESSAGE_PUSH_WINDOW_MS);
  if (count !== null) return count === 1;
  const until = localWindows.get(key);
  if (until !== undefined && until > now) return false;
  localWindows.set(key, now + MESSAGE_PUSH_WINDOW_MS);
  if (localWindows.size > 5000) {
    for (const [k, end] of localWindows) if (end <= now) localWindows.delete(k);
  }
  return true;
}

export interface DirectMessagePushInput {
  senderId: string;
  recipientId: string;
  conversationId: string;
}

/** Best-effort: never throws, whatever fails. Deliberately takes no message content, so none can leak into a push. */
export async function afterDirectMessagePush(input: DirectMessagePushInput): Promise<void> {
  try {
    const { senderId, recipientId, conversationId } = input;
    // Saved Messages has no recipient to tell.
    if (senderId === recipientId) return;
    // Gate before claim: a message that a mute silences must not use up the window, or the first message after the
    // member unmutes would be coalesced away. (`dispatch()` runs the same gate again; it is one indexed read.)
    const scopeKey = scopeKeyFor('dm', conversationId);
    if (!shouldDeliver(await getConversationPref(recipientId, scopeKey), true)) return;
    if (!(await claimWindow(recipientId, conversationId, Date.now()))) return;
    const sender = await prisma.user.findUnique({ where: { id: senderId }, select: userDisplaySelect });
    const name = (sender ? resolveUserDisplay(sender).name : null)?.trim() || FALLBACK_NAME;
    await dispatch({
      userId: recipientId,
      category: 'messages',
      type: 'SYSTEM',
      actorId: senderId,
      entityType: 'dm',
      entityId: conversationId,
      preview: notice('dm-received', { name }),
      link: `/messages/${conversationId}`,
      // The conversation's own gate (mute) runs first, then the member's Messages switches, then quiet hours.
      scopeKey,
      // Every message in a direct conversation addresses the member, so "mentions only" must never silence one.
      isMention: true,
    });
  } catch (err) {
    console.error('[messages] push failed:', err instanceof Error ? err.message : 'unknown');
  }
}
