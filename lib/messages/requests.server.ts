/**
 * Message requests, the server half (sprint 04 #16). Server-only.
 *
 * `requestGate` is the one question every DM write path asks (start, send, voice,
 * forward, scheduled delivery): allowed, a request, or refused. `openRequest`
 * creates the request under a per-sender advisory lock; `decideRequest` is the
 * recipient accepting or declining; `listRequests` / `countPendingRequests` feed
 * the Requests folder and the sidebar count.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { dmKeyOf } from '@/lib/chat/chat.server';
import { notifyUser } from '@/lib/message-events';
import { redisDel } from '@/lib/redis.server';
import { createNotification } from '@/lib/notifications.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import type { MessageRequestPage } from '@/lib/messages/requests.contract';
import {
  REQUEST_CAP_WINDOW_MS,
  REQUEST_DAILY_CAP,
  cooldownActive,
  decideGate,
  gateRefusalCopy,
  privacyAllows,
  type DmPrivacyValue,
  type GateDecision,
  type RequestFacts,
} from '@/lib/messages/requests';

const factsSelect = { senderId: true, recipientId: true, status: true, decidedAt: true } as const;

/** The request on the chat between two people, whichever of them sent it. */
export async function findPairRequest(a: string, b: string): Promise<RequestFacts | null> {
  return prisma.messageRequest.findFirst({
    where: {
      OR: [
        { senderId: a, recipientId: b },
        { senderId: b, recipientId: a },
      ],
    },
    select: factsSelect,
  });
}

async function pairHasHistory(a: string, b: string): Promise<boolean> {
  const [one, two] = a < b ? [a, b] : [b, a];
  const hit = await prisma.chatMessage.findFirst({
    where: { chat: { dmKey: dmKeyOf(one, two) } },
    select: { id: true },
  });
  return !!hit;
}

function windowStart(now: Date): Date {
  return new Date(now.getTime() - REQUEST_CAP_WINDOW_MS);
}

export interface RequestGateOptions {
  now?: Date;
  /** The pair's request, when the caller already loaded it with the chat (`DmRow.request`); `null` means none. */
  request?: RequestFacts | null | undefined;
}

/**
 * May `senderId` write to `recipientId` right now? `allowed` is the recipient's
 * privacy rule (or an accepted request) passing; `request` means it refuses but
 * the recipient takes requests and this sender may open one; `refused` carries
 * why. The queries after the first two run only when they can change the answer,
 * so a member who never turned requests on costs no more than the privacy check
 * always did.
 */
export async function requestGate(
  senderId: string,
  recipientId: string,
  opts: RequestGateOptions = {},
): Promise<GateDecision> {
  if (senderId === recipientId) return { outcome: 'allowed' };
  const now = opts.now ?? new Date();
  const [recipient, request] = await Promise.all([
    prisma.user.findUnique({
      where: { id: recipientId },
      select: { profile: { select: { dmPrivacy: true, dmRequests: true } } },
    }),
    opts.request !== undefined ? Promise.resolve(opts.request) : findPairRequest(senderId, recipientId),
  ]);
  const privacy: DmPrivacyValue = recipient?.profile?.dmPrivacy ?? 'EVERYONE';
  const requestsOn = recipient?.profile?.dmRequests ?? false;

  const follows =
    privacy === 'FOLLOWERS' && request?.status !== 'pending' && request?.status !== 'accepted'
      ? !!(await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: recipientId, followingId: senderId } },
          select: { followerId: true },
        }))
      : false;

  const settled = request?.status === 'pending' || request?.status === 'accepted';
  const mayAsk = !settled && requestsOn && !privacyAllows(privacy, follows);
  const [hasHistory, sentInWindow] = mayAsk
    ? await Promise.all([
        request ? Promise.resolve(false) : pairHasHistory(senderId, recipientId),
        prisma.messageRequest.count({
          where: { senderId, status: { not: 'draft' }, createdAt: { gte: windowStart(now) } },
        }),
      ])
    : [false, 0];

  return decideGate({
    senderId,
    recipientId,
    privacy,
    recipientFollowsSender: follows,
    requestsOn,
    request,
    hasHistory,
    sentInWindow,
    now,
  });
}

/**
 * For a write that is not a plain text send (a poll, a checklist, a slash command, a
 * reaction): the refusal when the chat is still a message request, or null. Privacy
 * refusals are not decided here; those paths never applied the rule and still do not.
 */
export async function requestWriteRefusal(
  senderId: string,
  otherId: string,
  request: RequestFacts | null | undefined,
): Promise<string | null> {
  const gate = await requestGate(senderId, otherId, { request: request ?? null });
  if (gate.outcome === 'request') return 'A message request can only contain text.';
  if (gate.outcome === 'refused' && (gate.reason === 'pending' || gate.reason === 'incoming')) {
    return gateRefusalCopy(gate.reason);
  }
  // The sender's own declined or draft request: the privacy rule still refuses them, and a poll, a checklist,
  // a slash command or a settings line would land in a chat the recipient has not accepted. Same copy as pending,
  // so a decline reads as "sent" to them.
  if (
    gate.outcome === 'refused' &&
    request &&
    request.senderId === senderId &&
    (request.status === 'declined' || request.status === 'draft')
  ) {
    return gateRefusalCopy('pending');
  }
  return null;
}

export type OpenRequestResult<T> =
  { ok: true; value: T | null } | { ok: false; reason: 'NONE' | 'FOLLOWERS' | 'pending' | 'cap' };

/**
 * Open (or reuse) the request on a chat, and with `message` write its one text
 * message in the same transaction. Takes `dm-request:<senderId>` first, so two
 * racing sends cannot both pass the daily cap or both open a request on one chat.
 * Without `message` the chat is only a draft: nothing is visible to the
 * recipient and nothing counts against the cap.
 */
export async function openRequest<T>(args: {
  senderId: string;
  chatId: string;
  /** The recipient's privacy rule, for the refusal a lost race gets. */
  privacy: 'FOLLOWERS' | 'NONE';
  now?: Date;
  message?: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<OpenRequestResult<T>> {
  const now = args.now ?? new Date();
  const { senderId, chatId, privacy } = args;
  const refused = { ok: false as const, reason: privacy };

  return prisma.$transaction(async (tx): Promise<OpenRequestResult<T>> => {
    await lockKey(tx, `dm-request:${senderId}`);
    const row = await tx.messageRequest.findUnique({
      where: { chatId },
      select: { id: true, ...factsSelect },
    });

    if (row) {
      if (row.senderId !== senderId) return refused;
      if (row.status === 'pending' || row.status === 'accepted') {
        return row.status === 'pending' ? { ok: false, reason: 'pending' } : refused;
      }
      if (row.status === 'declined' && cooldownActive(row.decidedAt, now)) return refused;
    } else if (await tx.chatMessage.findFirst({ where: { chatId }, select: { id: true } })) {
      return refused;
    }

    if (!args.message) {
      // A draft only marks the chat as the sender's; a declined chat past its cooldown stays as it is until a message is sent.
      if (!row) {
        const recipientId = await otherMemberOf(tx, chatId, senderId);
        if (!recipientId) return refused;
        await tx.messageRequest.create({
          data: { chatId, senderId, recipientId, status: 'draft', createdAt: now },
        });
      }
      return { ok: true, value: null };
    }

    const sent = await tx.messageRequest.count({
      where: {
        senderId,
        status: { not: 'draft' },
        createdAt: { gte: windowStart(now) },
        NOT: { chatId },
      },
    });
    if (sent >= REQUEST_DAILY_CAP) return { ok: false, reason: 'cap' };

    if (row) {
      await tx.messageRequest.update({
        where: { chatId },
        data: { status: 'pending', createdAt: now, decidedAt: null },
      });
    } else {
      const recipientId = await otherMemberOf(tx, chatId, senderId);
      if (!recipientId) return refused;
      await tx.messageRequest.create({
        data: { chatId, senderId, recipientId, status: 'pending', createdAt: now },
      });
    }
    return { ok: true, value: await args.message(tx) };
  });
}

async function otherMemberOf(tx: Prisma.TransactionClient, chatId: string, senderId: string): Promise<string | null> {
  const member = await tx.chatMember.findFirst({
    where: { chatId, userId: { not: senderId } },
    select: { userId: true },
  });
  return member?.userId ?? null;
}

/**
 * A draft marks a chat opened while the sender could only have asked. Once they
 * write as an ordinary sender (the recipient's rule changed, or they follow back)
 * it is stale and would keep the chat out of the recipient's inbox: drop it.
 */
export async function clearStaleDraft(
  request: Pick<RequestFacts, 'status'> | null | undefined,
  chatId: string,
): Promise<void> {
  if (request?.status !== 'draft') return;
  await prisma.messageRequest.deleteMany({ where: { chatId, status: 'draft' } });
}

/** Pending requests waiting for `userId`, leaving out anyone they or the sender have since blocked. */
function pendingWhere(userId: string): Prisma.MessageRequestWhereInput {
  return {
    recipientId: userId,
    status: 'pending',
    sender: { blocksMade: { none: { blockedId: userId } }, blocksReceived: { none: { blockerId: userId } } },
  };
}

/** How many requests wait for `userId` (the "Requests (n)" in the messages list). */
export function countPendingRequests(userId: string): Promise<number> {
  return prisma.messageRequest.count({ where: pendingWhere(userId) });
}

/** The Requests folder: newest first, each with the one message the sender left. */
export async function listRequests(
  userId: string,
  opts: { cursor?: string | undefined; limit?: number } = {},
): Promise<MessageRequestPage> {
  const limit = opts.limit ?? 20;
  const [rows, total] = await Promise.all([
    prisma.messageRequest.findMany({
      where: pendingWhere(userId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: { id: true, chatId: true, senderId: true, createdAt: true, sender: { select: userDisplaySelect } },
    }),
    countPendingRequests(userId),
  ]);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const messages = page.length
    ? await prisma.chatMessage.findMany({
        where: { chatId: { in: page.map((r) => r.chatId) }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { chatId: true, senderId: true, content: true },
      })
    : [];

  return {
    requests: page.map((r) => {
      const resolved = resolveUserDisplay(r.sender);
      const message = messages.find((m) => m.chatId === r.chatId && m.senderId === r.senderId);
      return {
        id: r.id,
        sender: {
          id: r.sender.id,
          name: resolved.name,
          image: resolved.image,
          username: r.sender.username,
        },
        content: message?.content ?? '',
        createdAt: r.createdAt.toISOString(),
      };
    }),
    total,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    hasMore,
  };
}

export type DecideResult = { ok: true; conversationId: string; senderId: string } | { ok: false; status: 404 };

/**
 * The recipient answers a request. Only the recipient's own pending request is
 * found, so a sender, a stranger and an already-answered request all read as
 * "not found". The status change is a compare-and-set, so a double click or two
 * tabs decide it once.
 *
 * Accept makes the chat ordinary: the sender's message turns unread for the
 * recipient (it was stored read so it never counted while pending), and the
 * sender is told. Decline starts the 30-day cooldown and tells the sender nothing.
 */
export async function decideRequest(args: {
  recipientId: string;
  requestId: string;
  action: 'accept' | 'decline';
  now?: Date;
}): Promise<DecideResult> {
  const now = args.now ?? new Date();
  const row = await prisma.messageRequest.findFirst({
    where: { id: args.requestId, recipientId: args.recipientId, status: 'pending' },
    select: { id: true, chatId: true, senderId: true },
  });
  if (!row) return { ok: false, status: 404 };

  const accept = args.action === 'accept';
  const decided = await prisma.$transaction(async (tx) => {
    const cas = await tx.messageRequest.updateMany({
      where: { id: row.id, recipientId: args.recipientId, status: 'pending' },
      data: { status: accept ? 'accepted' : 'declined', decidedAt: now },
    });
    if (cas.count !== 1) return false;
    if (accept) {
      await tx.chatMessage.updateMany({
        where: { chatId: row.chatId, senderId: row.senderId, read: true, deletedAt: null },
        data: { read: false },
      });
    }
    return true;
  });
  if (!decided) return { ok: false, status: 404 };

  if (accept) {
    // The unread badge reads a cached counter; drop it so the next read recounts.
    await redisDel(`dm:unread:${args.recipientId}`).catch(() => {});
    notifyUser(args.recipientId);
    await createNotification({
      userId: row.senderId,
      actorId: args.recipientId,
      type: 'SYSTEM',
      entityType: 'message-request',
      entityId: row.id,
      preview: 'accepted your message request',
      link: `/messages/${row.chatId}`,
    });
  }
  return { ok: true, conversationId: row.chatId, senderId: row.senderId };
}

export interface MessageRequestExport {
  with: string;
  direction: 'sent' | 'received';
  status: string;
  requestedAt: string;
  decidedAt: string | null;
}

/**
 * Who asked whom, when, and what came of it, for the account export. The message
 * itself is in the conversation export. A request the member sent reads "pending"
 * even when declined, exactly as it does to them in the app.
 */
export async function exportMessageRequests(userId: string): Promise<MessageRequestExport[]> {
  const rows = await prisma.messageRequest.findMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
    orderBy: { createdAt: 'asc' },
    select: { senderId: true, recipientId: true, status: true, createdAt: true, decidedAt: true },
  });
  return rows
    .filter((r) => r.status !== 'draft')
    .map((r) => {
      const sent = r.senderId === userId;
      const hidden = sent && r.status === 'declined';
      return {
        with: sent ? r.recipientId : r.senderId,
        direction: sent ? ('sent' as const) : ('received' as const),
        status: hidden ? 'pending' : r.status,
        requestedAt: r.createdAt.toISOString(),
        decidedAt: hidden ? null : (r.decidedAt?.toISOString() ?? null),
      };
    });
}
