/**
 * Away messages for direct messages (sprint 06 #18). Server-only.
 *
 * One away message per member; it ends by itself (a read-time check). While it is active, the first message a
 * member of an accepted conversation sends gets one labelled automatic reply per away period. The hook re-checks
 * everything that protects a person (blocks, mutes, message requests, DM privacy) and never trusts the sender's client.
 */
import { prisma } from '@/lib/prisma.server';
import { activeMuteWhere } from '@/lib/moderation/mute-expiry';
import { dmKeyOf, findDmByPair } from '@/lib/chat/chat.server';
import { getChatAccess } from '@/lib/chat-plus/access.server';
import { canDirectMessage } from '@/lib/chat-plus/dm-privacy.server';
import { postChatMessage } from '@/lib/chat-plus/post.server';
import {
  awayFirstDay,
  awayLastDay,
  isAwayActive,
  isAwayEnded,
  resolveAwayWindow,
  type AwayWindowError,
} from '@/lib/messages/away';
import type { OwnAway } from '@/lib/messages/away.contract';

interface AwayRow {
  id: string;
  userId: string;
  body: string;
  startsAt: Date;
  endsAt: Date;
  tz: string;
  showOnProfile: boolean;
}

function toOwn(row: AwayRow, now: Date): OwnAway {
  return {
    id: row.id,
    body: row.body,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    startDay: awayFirstDay(row.startsAt, row.tz),
    endDay: awayLastDay(row.endsAt, row.tz),
    tz: row.tz,
    showOnProfile: row.showOnProfile,
    active: isAwayActive(row, now),
  };
}

/** The member's own away message, or null when none is set or the last one ended. */
export async function getAway(userId: string, now: Date = new Date()): Promise<OwnAway | null> {
  const row = await prisma.awayMessage.findUnique({ where: { userId } });
  if (!row || isAwayEnded(row, now)) return null;
  return toOwn(row, now);
}

/** Chats that were answered during the current period, so the member can follow up when back. */
export async function autoRepliedChatIds(awayId: string): Promise<string[]> {
  const rows = await prisma.awayReplySent.findMany({ where: { awayId }, select: { chatId: true } });
  return rows.map((r) => r.chatId);
}

export type SetAwayResult = { ok: true; away: OwnAway } | { ok: false; code: AwayWindowError };

/**
 * Set or change the away message. Changing one that is still in force (text, end date, profile line) keeps its `id`,
 * so nobody gets a second reply; setting one after the last ended makes a new row and so a new period.
 */
export async function setAway(
  userId: string,
  input: { body: string; startDay?: string | null | undefined; endDay: string; tz: string; showOnProfile: boolean },
  now: Date = new Date(),
): Promise<SetAwayResult> {
  const window = resolveAwayWindow({ startDay: input.startDay, endDay: input.endDay, tz: input.tz, now });
  if (!window.ok) return { ok: false, code: window.error };

  const existing = await prisma.awayMessage.findUnique({ where: { userId } });
  if (existing && !isAwayEnded(existing, now)) {
    // A period that already began keeps its start; only a period still ahead may move it.
    const startsAt = existing.startsAt.getTime() <= now.getTime() ? existing.startsAt : window.startsAt;
    const row = await prisma.awayMessage.update({
      where: { userId },
      data: {
        body: input.body,
        startsAt,
        endsAt: window.endsAt,
        tz: input.tz,
        showOnProfile: input.showOnProfile,
      },
    });
    return { ok: true, away: toOwn(row, now) };
  }

  const data = {
    userId,
    body: input.body,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    tz: input.tz,
    showOnProfile: input.showOnProfile,
  };
  // The ended row (and its reply markers, by cascade) goes with it: a new id is a new period.
  const [, row] = await prisma.$transaction([
    prisma.awayMessage.deleteMany({ where: { userId } }),
    prisma.awayMessage.create({ data }),
  ]);
  return { ok: true, away: toOwn(row, now) };
}

/** Turn it off (one click). Deleting the row ends the period; its reply markers go with it. */
export async function clearAway(userId: string): Promise<void> {
  await prisma.awayMessage.deleteMany({ where: { userId } });
}

/** A block in either direction, or a mute either way, between two members. */
async function pairIsClosed(a: string, b: string): Promise<boolean> {
  const [block, mute] = await Promise.all([
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    }),
    prisma.userMute.findFirst({
      where: {
        AND: [
          {
            OR: [
              { muterId: a, mutedId: b },
              { muterId: b, mutedId: a },
            ],
          },
          activeMuteWhere(new Date()),
        ],
      },
      select: { id: true },
    }),
  ]);
  return Boolean(block) || Boolean(mute);
}

export type AwayReplyResult =
  | { sent: true; messageId: string }
  | {
      sent: false;
      reason:
        | 'self'
        | 'automatic'
        | 'sender-excluded'
        | 'not-away'
        | 'no-conversation'
        | 'not-accepted'
        | 'closed'
        | 'dm-privacy'
        | 'already-sent'
        | 'no-access'
        | 'failed';
    };

/**
 * Called by `sendDirectMessage` after a message to `recipientId` was stored in an ordinary (not request) direct chat.
 * Best-effort: it never throws. The claim row is inserted first and the reply sent only when this call inserted it, so
 * two concurrent messages send one reply; a reply that could not be posted gives the claim back.
 */
export async function afterDirectMessage(input: {
  senderId: string;
  recipientId: string;
  chatId: string;
  /** The incoming message's `meta`; an automatic message never gets a reply. */
  meta?: unknown;
  now?: Date;
}): Promise<AwayReplyResult> {
  const { senderId, recipientId, chatId } = input;
  const now = input.now ?? new Date();
  try {
    if (senderId === recipientId) return { sent: false, reason: 'self' };
    const meta = input.meta as { autoReply?: unknown } | null | undefined;
    if (meta && typeof meta === 'object' && meta.autoReply) return { sent: false, reason: 'automatic' };

    const away = await prisma.awayMessage.findUnique({ where: { userId: recipientId } });
    if (!away || !isAwayActive(away, now)) return { sent: false, reason: 'not-away' };

    // Bots and banned members get no reply: a bot would only answer back, and a ban should not be a conversation.
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { isBot: true, bannedUntil: true },
    });
    if (!sender || sender.isBot || (sender.bannedUntil && sender.bannedUntil.getTime() > now.getTime())) {
      return { sent: false, reason: 'sender-excluded' };
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, kind: 'dm', dmKey: dmKeyOf(...sortedPair(senderId, recipientId)) },
      select: { id: true, messageRequest: { select: { status: true } } },
    });
    if (!chat) return { sent: false, reason: 'no-conversation' };
    // Only an accepted conversation: a reply into a request would accept or reveal it.
    if (chat.messageRequest && chat.messageRequest.status !== 'accepted') {
      return { sent: false, reason: 'not-accepted' };
    }
    if (await pairIsClosed(senderId, recipientId)) return { sent: false, reason: 'closed' };
    if (!(await canDirectMessage(recipientId, senderId))) return { sent: false, reason: 'dm-privacy' };

    const claim = await prisma.awayReplySent.createMany({
      data: [{ awayId: away.id, chatId }],
      skipDuplicates: true,
    });
    if (claim.count !== 1) return { sent: false, reason: 'already-sent' };

    try {
      const access = await getChatAccess('dm', chatId, recipientId);
      if (!access) {
        await releaseClaim(away.id, chatId);
        return { sent: false, reason: 'no-access' };
      }
      const posted = await postChatMessage(access, {
        senderId: recipientId,
        content: away.body,
        kind: 'text',
        meta: { autoReply: 'away', awayId: away.id },
      });
      return { sent: true, messageId: posted.message.id };
    } catch {
      await releaseClaim(away.id, chatId);
      return { sent: false, reason: 'failed' };
    }
  } catch {
    return { sent: false, reason: 'failed' };
  }
}

function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function releaseClaim(awayId: string, chatId: string): Promise<void> {
  try {
    await prisma.awayReplySent.deleteMany({ where: { awayId, chatId } });
  } catch {
    // Nothing more to do: the member simply gets no reply for this chat this period.
  }
}

export interface AwayStatus {
  active: boolean;
  endsAt: string | null;
  tz: string | null;
}

const NONE: AwayStatus = { active: false, endsAt: null, tz: null };

/**
 * What `viewerId` may learn about `userId`: only that they are away and the end instant (never the text). Nothing
 * unless the viewer could message the member now; the header also needs an accepted conversation, and the profile line
 * the member's opt-in.
 */
export async function awayStatusFor(
  viewerId: string,
  userId: string,
  context: 'header' | 'profile',
  now: Date = new Date(),
): Promise<AwayStatus> {
  if (viewerId === userId) return NONE;
  const away = await prisma.awayMessage.findUnique({ where: { userId } });
  if (!away || !isAwayActive(away, now)) return NONE;
  if (context === 'profile' && !away.showOnProfile) return NONE;
  if (await pairIsClosed(viewerId, userId)) return NONE;
  if (!(await canDirectMessage(viewerId, userId))) return NONE;
  if (context === 'header') {
    const [one, two] = sortedPair(viewerId, userId);
    const dm = await findDmByPair(one, two);
    if (!dm || (dm.request && dm.request.status !== 'accepted')) return NONE;
  }
  return { active: true, endsAt: away.endsAt.toISOString(), tz: away.tz };
}

/** Prisma operations for `anonymizeAccount`'s transaction: the reply markers, then the away message. */
export function awayErasureOps(userId: string) {
  return [
    prisma.awayReplySent.deleteMany({ where: { away: { userId } } }),
    prisma.awayMessage.deleteMany({ where: { userId } }),
  ];
}

/** The member's away message for the account export (text and dates). */
export async function exportAwayMessage(userId: string) {
  const row = await prisma.awayMessage.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    body: row.body,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeZone: row.tz,
    showOnProfile: row.showOnProfile,
    createdAt: row.createdAt.toISOString(),
  };
}
