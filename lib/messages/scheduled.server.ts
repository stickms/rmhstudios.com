/**
 * Scheduled direct and group messages (s03-12): store, list, edit, cancel and
 * deliver. Server-only.
 *
 * Delivery goes through `sendDirectMessage` / `sendGroupMessage`, the functions
 * the send endpoints use, so every check (restriction, membership, DM privacy,
 * image ownership, a block in either direction) runs again at the moment of
 * delivery, so a member who blocked the sender between scheduling and delivery
 * must not hear from them. Scheduling checks the block too, to refuse early. Nothing is published to the recipient until delivery, so a pending row
 * is invisible to everyone but its sender.
 */

import { prisma } from '@/lib/prisma.server';
import {
  findDm,
  findGroupMembership,
} from '@/lib/chat/chat.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { altTextViolation } from '@/lib/feed/alt-text.server';
import {
  imageAltsAligned,
  normalizeImageAlts,
} from '@/lib/messages/image-alts';
import {
  isBlockedPair,
  sendDirectMessage,
  sendGroupMessage,
  type SendFailCode,
} from '@/lib/messages/send.server';
import type { SentMessage } from '@/lib/messages/scheduled';
import {
  MAX_ATTEMPTS,
  MAX_PENDING,
  MAX_PER_RUN,
  STUCK_AFTER_MS,
  isFailCode,
  sendAtProblem,
  type ScheduledFailCode,
  type ScheduledMessageRow,
} from '@/lib/messages/scheduled';

/** How long a failed row stays in the strip before the cron removes it. */
const FAILED_KEEP_MS =
  30 *
  24 *
  60 *
  60 *
  1000;

type Row =
  {
    id: string;
    chatId: string;
    senderId: string;
    content: string;
    gifUrl:
      | string
      | null;
    imageUrls: string[];
    imageAlts?: string[];
    sendAt: Date;
    status: string;
    failCode:
      | string
      | null;
  };

export function toScheduledRow(
  r: Row,
): ScheduledMessageRow {
  return {
    id: r.id,
    chatId:
      r.chatId,
    content:
      r.content,
    gifUrl:
      r.gifUrl,
    imageUrls:
      r.imageUrls,
    imageAlts:
      normalizeImageAlts(
        r.imageUrls,
        r.imageAlts,
      ),
    sendAt:
      r.sendAt.toISOString(),
    status:
      r.status ===
      'failed'
        ? 'failed'
        : 'pending',
    failCode:
      isFailCode(
        r.failCode,
      )
        ? r.failCode
        : null,
  };
}

/** Where a member may send: a DM (with whom) or a group. `null` when the chat is not theirs. */
export type ChatTarget =
  | {
      kind: 'dm';
      otherId: string;
    }
  | {
      kind: 'group';
    };

export async function resolveChatTarget(
  userId: string,
  chatId: string,
): Promise<ChatTarget | null> {
  const dm =
    await findDm(
      chatId,
    );
  if (
    dm
  ) {
    if (
      dm.participantOneId !==
        userId &&
      dm.participantTwoId !==
        userId
    )
      return null;
    return {
      kind: 'dm',
      otherId:
        dm.participantOneId ===
        userId
          ? dm.participantTwoId
          : dm.participantOneId,
    };
  }
  const member =
    await findGroupMembership(
      chatId,
      userId,
      {
        id: true,
      },
    );
  return member
    ? {
        kind: 'group',
      }
    : null;
}

export async function listScheduledMessages(
  userId: string,
  chatId?: string,
): Promise<
  ScheduledMessageRow[]
> {
  const rows =
    await prisma.scheduledChatMessage.findMany(
      {
        where:
          {
            senderId:
              userId,
            ...(chatId
              ? {
                  chatId,
                }
              : {}),
          },
        orderBy:
          {
            sendAt:
              'asc',
          },
        take: 200,
      },
    );
  return rows.map(
    toScheduledRow,
  );
}

export type ScheduleResult =
  | {
      ok: true;
      row: ScheduledMessageRow;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const refuse =
  (
    status: number,
    error: string,
  ): {
    ok: false;
    status: number;
    error: string;
  } => ({
    ok: false,
    status,
    error,
  });

export interface ScheduleInput {
  chatId: string;
  content: string;
  gifUrl?:
    | string
    | undefined;
  imageUrls?:
    | string[]
    | undefined;
  /** One description per image, same length as `imageUrls`. */
  imageAlts?:
    | string[]
    | undefined;
  sendAt: string;
}

/** Store a message for later, after the checks a hand-sent one would pass now. */
export async function scheduleMessage(
  userId: string,
  input: ScheduleInput,
  now: number = Date.now(),
): Promise<ScheduleResult> {
  const sendAt =
    new Date(
      input.sendAt,
    );
  const problem =
    sendAtProblem(
      sendAt.getTime(),
      now,
    );
  if (
    problem ===
    'too-soon'
  )
    return refuse(
      400,
      'Pick a time at least a minute from now',
    );
  if (
    problem ===
    'too-far'
  )
    return refuse(
      400,
      'Pick a time within the next 30 days',
    );

  const restricted =
    await restrictionResponse(
      userId,
      'message',
    );
  if (
    restricted
  )
    return refuse(
      restricted.status,
      'Messaging is restricted on your account',
    );

  const target =
    await resolveChatTarget(
      userId,
      input.chatId,
    );
  if (
    !target
  )
    return refuse(
      404,
      'Not found',
    );
  if (
    target.kind ===
      'dm' &&
    (await isBlockedPair(
      userId,
      target.otherId,
    ))
  ) {
    return refuse(
      403,
      'You can no longer message this person',
    );
  }
  if (
    input.imageUrls?.some(
      (
        u,
      ) =>
        !ownsFeedImageUrl(
          u,
          userId,
        ),
    )
  ) {
    return refuse(
      400,
      'Invalid image reference',
    );
  }
  if (
    !imageAltsAligned(
      input.imageUrls,
      input.imageAlts,
    )
  ) {
    return refuse(
      400,
      'Provide exactly one description per image',
    );
  }
  const altViolation =
    await altTextViolation(
      userId,
      input.imageUrls,
      input.imageAlts,
    );
  if (
    altViolation
  ) {
    return refuse(
      422,
      altViolation,
    );
  }

  // Count and insert under a per-sender transaction lock, so two requests in
  // flight cannot both see 19 and both insert.
  const created =
    await prisma.$transaction(
      async (
        tx,
      ) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`scheduled-msg:${userId}`}, 0))`;
        const pending =
          await tx.scheduledChatMessage.count(
            {
              where:
                {
                  senderId:
                    userId,
                  status:
                    {
                      in: [
                        'pending',
                        'sending',
                      ],
                    },
                },
            },
          );
        if (
          pending >=
          MAX_PENDING
        )
          return null;
        return tx.scheduledChatMessage.create(
          {
            data: {
              chatId:
                input.chatId,
              senderId:
                userId,
              content:
                input.content,
              gifUrl:
                input.gifUrl ??
                null,
              imageUrls:
                input.imageUrls ??
                [],
              imageAlts:
                normalizeImageAlts(
                  input.imageUrls,
                  input.imageAlts,
                ),
              sendAt,
            },
          },
        );
      },
    );
  if (
    !created
  ) {
    return refuse(
      409,
      `You can schedule up to ${MAX_PENDING} messages at a time`,
    );
  }
  const row =
    created;
  return {
    ok: true,
    row: toScheduledRow(
      row,
    ),
  };
}

/** Change the text or the time of one of the caller's pending rows. Another member's row is "not found". */
export async function editScheduledMessage(
  userId: string,
  id: string,
  change: {
    content?:
      | string
      | undefined;
    sendAt?:
      | string
      | undefined;
  },
  now: number = Date.now(),
): Promise<ScheduleResult> {
  const existing =
    await prisma.scheduledChatMessage.findFirst(
      {
        where:
          {
            id,
            senderId:
              userId,
          },
      },
    );
  if (
    !existing
  )
    return refuse(
      404,
      'Not found',
    );
  if (
    existing.status !==
    'pending'
  )
    return refuse(
      409,
      'This message can no longer be changed',
    );

  let sendAt:
    | Date
    | undefined;
  if (
    change.sendAt !==
    undefined
  ) {
    sendAt =
      new Date(
        change.sendAt,
      );
    const problem =
      sendAtProblem(
        sendAt.getTime(),
        now,
      );
    if (
      problem ===
      'too-soon'
    )
      return refuse(
        400,
        'Pick a time at least a minute from now',
      );
    if (
      problem ===
      'too-far'
    )
      return refuse(
        400,
        'Pick a time within the next 30 days',
      );
  }
  const content =
    change.content ??
    existing.content;
  if (
    !content.trim() &&
    !existing.gifUrl &&
    existing
      .imageUrls
      .length ===
      0
  ) {
    return refuse(
      400,
      'Message must have text, an image, or a GIF',
    );
  }

  // Only a still-pending row: the cron may have claimed it since the read above.
  const updated =
    await prisma.scheduledChatMessage.updateMany(
      {
        where:
          {
            id,
            senderId:
              userId,
            status:
              'pending',
          },
        data: {
          ...(change.content !==
          undefined
            ? {
                content:
                  change.content,
              }
            : {}),
          ...(sendAt
            ? {
                sendAt,
              }
            : {}),
        },
      },
    );
  if (
    updated.count ===
    0
  )
    return refuse(
      409,
      'This message can no longer be changed',
    );

  const row =
    await prisma.scheduledChatMessage.findFirst(
      {
        where:
          {
            id,
            senderId:
              userId,
          },
      },
    );
  return row
    ? {
        ok: true,
        row: toScheduledRow(
          row,
        ),
      }
    : refuse(
        404,
        'Not found',
      );
}

/** Cancel a pending row or dismiss a failed one. */
export async function cancelScheduledMessage(
  userId: string,
  id: string,
): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  const removed =
    await prisma.scheduledChatMessage.deleteMany(
      {
        where:
          {
            id,
            senderId:
              userId,
            status:
              {
                in: [
                  'pending',
                  'failed',
                ],
              },
          },
      },
    );
  if (
    removed.count >
    0
  )
    return {
      ok: true,
    };
  const inFlight =
    await prisma.scheduledChatMessage.findFirst(
      {
        where:
          {
            id,
            senderId:
              userId,
          },
        select:
          {
            id: true,
          },
      },
    );
  return inFlight
    ? refuse(
        409,
        'This message is being sent',
      )
    : refuse(
        404,
        'Not found',
      );
}

/** The reason code recorded for a send function's failure. */
export function failCodeFor(
  code: SendFailCode,
): ScheduledFailCode {
  switch (
    code
  ) {
    case 'restricted':
      return 'restricted';
    case 'not-found':
    case 'not-member':
      return 'not-member';
    case 'cannot-message':
      return 'cannot-message';
    case 'blocked':
      return 'blocked';
    case 'invalid-image':
      return 'invalid-image';
    case 'empty':
    case 'alt-mismatch':
    case 'alt-required':
      return 'invalid';
    case 'rate-limited':
      return 'error';
  }
}

export type DeliveryOutcome =
  | {
      delivered: true;
      message: SentMessage;
    }
  | {
      delivered: false;
      code: ScheduledFailCode;
    };

/**
 * Send one claimed (`sending`) row. A sent row is deleted; a refused one is
 * marked `failed` with its code and nobody is notified. A thrown error leaves
 * the row in `sending` for the stuck-row sweep.
 */
async function deliver(
  row: Row,
): Promise<DeliveryOutcome> {
  const finishFailed =
    async (
      code: ScheduledFailCode,
    ): Promise<DeliveryOutcome> => {
      await prisma.scheduledChatMessage.updateMany(
        {
          where:
            {
              id: row.id,
              status:
                'sending',
            },
          data: {
            status:
              'failed',
            failCode:
              code,
          },
        },
      );
      return {
        delivered: false,
        code,
      };
    };

  const target =
    await resolveChatTarget(
      row.senderId,
      row.chatId,
    );
  if (
    !target
  )
    return finishFailed(
      'not-member',
    );
  const media =
    {
      gifUrl:
        row.gifUrl ??
        undefined,
      imageUrls:
        row.imageUrls,
      imageAlts:
        normalizeImageAlts(
          row.imageUrls,
          row.imageAlts,
        ),
    };
  const sent =
    target.kind ===
    'dm'
      ? await sendDirectMessage(
          {
            userId:
              row.senderId,
            conversationId:
              row.chatId,
            input:
              {
                content:
                  row.content,
                ...media,
              },
            pairRateLimit: false,
          },
        )
      : await sendGroupMessage(
          {
            userId:
              row.senderId,
            groupId:
              row.chatId,
            input:
              {
                content:
                  row.content,
                ...media,
              },
          },
        );
  if (
    !sent.ok
  )
    return finishFailed(
      failCodeFor(
        sent.code,
      ),
    );

  await prisma.scheduledChatMessage.deleteMany(
    {
      where:
        {
          id: row.id,
        },
    },
  );
  return {
    delivered: true,
    message:
      sent
        .value
        .message,
  };
}

/** Claim a pending row for delivery: only one caller can move it to `sending`. */
async function claim(
  id: string,
  senderId:
    | string
    | null,
  dueBy: Date | null,
): Promise<Row | null> {
  const claimed =
    await prisma.scheduledChatMessage.updateMany(
      {
        where:
          {
            id,
            status:
              'pending',
            ...(senderId
              ? {
                  senderId,
                }
              : {}),
            ...(dueBy
              ? {
                  sendAt:
                    {
                      lte: dueBy,
                    },
                }
              : {}),
          },
        data: {
          status:
            'sending',
          attempts:
            {
              increment: 1,
            },
        },
      },
    );
  if (
    claimed.count ===
    0
  )
    return null;
  return prisma.scheduledChatMessage.findUnique(
    {
      where:
        {
          id,
        },
    },
  );
}

export type SendNowResult =
  | {
      ok: true;
      message: SentMessage;
    }
  | {
      ok: false;
      status: number;
      error: string;
      code?: ScheduledFailCode;
    };

/** Deliver one of the caller's pending rows immediately, through the normal path. */
export async function sendScheduledNow(
  userId: string,
  id: string,
): Promise<SendNowResult> {
  const row =
    await claim(
      id,
      userId,
      null,
    );
  if (
    !row
  ) {
    const existing =
      await prisma.scheduledChatMessage.findFirst(
        {
          where:
            {
              id,
              senderId:
                userId,
            },
          select:
            {
              status: true,
            },
        },
      );
    if (
      !existing
    )
      return refuse(
        404,
        'Not found',
      );
    return refuse(
      409,
      'This message cannot be sent now',
    );
  }
  const outcome =
    await deliver(
      row,
    );
  return outcome.delivered
    ? {
        ok: true,
        message:
          outcome.message,
      }
    : {
        ok: false,
        status: 409,
        error:
          'The message could not be sent',
        code: outcome.code,
      };
}

export interface RunSummary {
  delivered: number;
  failed: number;
  /** Rows another worker claimed first. */
  skipped: number;
}

/**
 * One cron pass. Rows stuck in `sending` for ten minutes go back to pending once
 * and fail with `error` the second time; then due rows are claimed and sent in
 * `sendAt` order, at most 500 per run. Safe to run twice at once: a row is only
 * ever claimed by the `updateMany` that moves it out of `pending`.
 */
export async function runDueScheduledMessages(
  now: Date = new Date(),
): Promise<RunSummary> {
  const stuckBefore =
    new Date(
      now.getTime() -
        STUCK_AFTER_MS,
    );
  await prisma.scheduledChatMessage.updateMany(
    {
      where:
        {
          status:
            'sending',
          updatedAt:
            {
              lt: stuckBefore,
            },
          attempts:
            {
              gte: MAX_ATTEMPTS,
            },
        },
      data: {
        status:
          'failed',
        failCode:
          'error',
      },
    },
  );
  await prisma.scheduledChatMessage.updateMany(
    {
      where:
        {
          status:
            'sending',
          updatedAt:
            {
              lt: stuckBefore,
            },
          attempts:
            {
              lt: MAX_ATTEMPTS,
            },
        },
      data: {
        status:
          'pending',
      },
    },
  );
  await prisma.scheduledChatMessage.deleteMany(
    {
      where:
        {
          status:
            'failed',
          updatedAt:
            {
              lt: new Date(
                now.getTime() -
                  FAILED_KEEP_MS,
              ),
            },
        },
    },
  );

  const due =
    await prisma.scheduledChatMessage.findMany(
      {
        where:
          {
            status:
              'pending',
            sendAt:
              {
                lte: now,
              },
          },
        orderBy:
          {
            sendAt:
              'asc',
          },
        take: MAX_PER_RUN,
        select:
          {
            id: true,
          },
      },
    );

  const summary: RunSummary =
    {
      delivered: 0,
      failed: 0,
      skipped: 0,
    };
  for (const {
    id,
  } of due) {
    const row =
      await claim(
        id,
        null,
        now,
      );
    if (
      !row
    ) {
      summary.skipped += 1;
      continue;
    }
    try {
      const outcome =
        await deliver(
          row,
        );
      if (
        outcome.delivered
      )
        summary.delivered += 1;
      else
        summary.failed += 1;
    } catch (e) {
      // Left in `sending`: the sweep above retries it once, then fails it.
      console.error(
        '[messages.send-scheduled] delivery threw',
        {
          id,
          error:
            e,
        },
      );
      summary.failed += 1;
    }
  }
  return summary;
}

/** Everything a member has scheduled, for the account export. */
export async function exportScheduledMessages(
  userId: string,
) {
  const rows =
    await prisma.scheduledChatMessage.findMany(
      {
        where:
          {
            senderId:
              userId,
          },
        orderBy:
          {
            sendAt:
              'asc',
          },
      },
    );
  return rows.map(
    (
      r,
    ) => ({
      id: r.id,
      chatId:
        r.chatId,
      content:
        r.content,
      gifUrl:
        r.gifUrl,
      imageUrls:
        r.imageUrls,
      imageAlts:
        normalizeImageAlts(
          r.imageUrls,
          r.imageAlts,
        ),
      sendAt:
        r.sendAt.toISOString(),
      status:
        r.status,
      failCode:
        r.failCode,
      createdAt:
        r.createdAt.toISOString(),
    }),
  );
}
