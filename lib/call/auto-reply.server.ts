/**
 * The automatic "sorry, I can't take your call" DM. Server-only (web tier).
 *
 * The call hub decides that a call could not ring (busy, rang out, or the user
 * asked not to be rung) and asks the web tier to send this. The hub's word is
 * not trusted for anything but the trigger: every decision that protects a
 * person is re-made here against the database, so a bug or a replayed request in
 * the hub cannot make this send to someone it should not.
 *
 * What it will NOT do, in order:
 *   1. send unless the callee's own mode asks for it for this trigger;
 *   2. send to anyone who could not have rung them (blocked either way, muted,
 *      or outside their call-privacy setting) — a reply would confirm the account
 *      is live and is exactly the contact they closed off;
 *   3. send past the caller's own DM privacy;
 *   4. send twice to the same caller within `AUTO_REPLY_COOLDOWN_MS`, which also
 *      caps what the writer can cost.
 * The message is labelled automatic, carries `meta.autoReply`, and is built from
 * the callee's note only (see `buildAutoReplyPrompt`: the caller is never shown to
 * the model).
 */

import { prisma } from '@/lib/prisma.server';
import { aiChat, isAITextConfigured } from '@/lib/ai/text.server';
import { getChatAccess } from '@/lib/chat-plus/access.server';
import { postChatMessage } from '@/lib/chat-plus/post.server';
import { canDirectMessage } from '@/lib/chat-plus/dm-privacy.server';
import { canCall, DEFAULT_CALL_PRIVACY, isCallPrivacy } from '@/lib/call/state';
import {
  AUTO_REPLY_COOLDOWN_MS,
  DEFAULT_CALL_ANSWER_MODE,
  autoReplyContent,
  buildAutoReplyPrompt,
  fallbackAutoReply,
  isCallAnswerMode,
  normalizeBusyNote,
  sanitizeAutoReply,
  shouldAutoReply,
  type AutoReplyTrigger,
} from '@/lib/call/answer';

export type AutoReplyResult =
  | { sent: true; messageId: string }
  | {
      sent: false;
      reason: 'self' | 'mode' | 'not-permitted' | 'dm-privacy' | 'cooldown' | 'in-flight' | 'no-access';
    };

/** Pairs being handled right now, so two near-simultaneous triggers send once. */
const inFlight = new Set<string>();

/** One short writer call. Null when unconfigured, failed, or rejected by `sanitizeAutoReply`. */
async function writeWithAi(trigger: AutoReplyTrigger, note: string | null): Promise<string | null> {
  if (!isAITextConfigured()) return null;
  try {
    const { system, user } = buildAutoReplyPrompt(trigger, note);
    return sanitizeAutoReply(await aiChat(system, user, 120, 0.4));
  } catch {
    // Best-effort by nature: a writer outage must still leave the caller with a reply.
    return null;
  }
}

/** Could `callerId` have rung `calleeId` right now? Same rule the hub applies. */
async function callerMayRing(
  callerId: string,
  calleeId: string,
  privacyRaw: unknown,
): Promise<boolean> {
  const [block, mute, calleeFollows, callerFollows] = await Promise.all([
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: callerId, blockedId: calleeId },
          { blockerId: calleeId, blockedId: callerId },
        ],
      },
      select: { blockerId: true },
    }),
    prisma.callMute.findFirst({
      where: { userId: calleeId, mutedUserId: callerId, until: { gt: new Date() } },
      select: { id: true },
    }),
    prisma.follow.findFirst({
      where: { followerId: calleeId, followingId: callerId },
      select: { followerId: true },
    }),
    prisma.follow.findFirst({
      where: { followerId: callerId, followingId: calleeId },
      select: { followerId: true },
    }),
  ]);
  return canCall({
    privacy: isCallPrivacy(privacyRaw) ? privacyRaw : DEFAULT_CALL_PRIVACY,
    blocked: Boolean(block),
    muted: Boolean(mute),
    calleeFollowsCaller: Boolean(calleeFollows),
    callerFollowsCallee: Boolean(callerFollows),
  }).allowed;
}

export async function sendCallAutoReply(input: {
  callerId: string;
  calleeId: string;
  trigger: AutoReplyTrigger;
}): Promise<AutoReplyResult> {
  const { callerId, calleeId, trigger } = input;
  if (callerId === calleeId) return { sent: false, reason: 'self' };

  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: calleeId },
    select: { callAnswerMode: true, callBusyNote: true, callPrivacy: true },
  });
  const mode = isCallAnswerMode(prefs?.callAnswerMode)
    ? prefs.callAnswerMode
    : DEFAULT_CALL_ANSWER_MODE;
  if (!shouldAutoReply(mode, trigger)) return { sent: false, reason: 'mode' };

  const key = `${calleeId}:${callerId}`;
  if (inFlight.has(key)) return { sent: false, reason: 'in-flight' };
  inFlight.add(key);
  try {
    if (!(await callerMayRing(callerId, calleeId, prefs?.callPrivacy))) {
      return { sent: false, reason: 'not-permitted' };
    }
    if (!(await canDirectMessage(calleeId, callerId))) {
      return { sent: false, reason: 'dm-privacy' };
    }

    // Normalised pair order, as every other conversation writer does.
    const [one, two] = calleeId < callerId ? [calleeId, callerId] : [callerId, calleeId];
    const conversation = await prisma.conversation.upsert({
      where: { participantOneId_participantTwoId: { participantOneId: one, participantTwoId: two } },
      create: { participantOneId: one, participantTwoId: two },
      update: {},
      select: { id: true },
    });

    const recent = await prisma.directMessage.findFirst({
      where: {
        conversationId: conversation.id,
        senderId: calleeId,
        createdAt: { gt: new Date(Date.now() - AUTO_REPLY_COOLDOWN_MS) },
        meta: { path: ['autoReply'], equals: true },
      },
      select: { id: true },
    });
    if (recent) return { sent: false, reason: 'cooldown' };

    const access = await getChatAccess('dm', conversation.id, calleeId);
    if (!access) return { sent: false, reason: 'no-access' };

    const note = normalizeBusyNote(prefs?.callBusyNote);
    const text = (await writeWithAi(trigger, note)) ?? fallbackAutoReply(trigger, note);

    const posted = await postChatMessage(access, {
      senderId: calleeId,
      content: autoReplyContent(text),
      kind: 'text',
      meta: { autoReply: true, trigger },
    });
    return { sent: true, messageId: posted.message.id };
  } finally {
    inFlight.delete(key);
  }
}
