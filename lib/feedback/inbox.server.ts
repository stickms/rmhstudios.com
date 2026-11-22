import { notice } from '@/lib/notifications/notice-keys';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import {
  INBOX_PAGE_SIZE,
  SEARCH_WINDOW,
  decodeCursor,
  encodeCursor,
  firstLine,
  likePattern,
} from '@/lib/feedback/inbox';
import { feedbackContextSchema, type FeedbackContext, type FeedbackInput } from '@/lib/feedback-schema';
import type { AdminFeedbackDetail, AdminFeedbackRow, MyFeedbackRow } from '@/lib/feedback/inbox.contract';

const MINE_CAP = 100;

/** The build the server is running, for the one context item the browser cannot read. */
export function currentBuildId(): string {
  return (process.env.RELEASE_SHA || process.env.GIT_SHA || process.env.SOURCE_COMMIT || 'unknown').slice(0, 12);
}

/**
 * The context to store: re-parsed (so the path is stripped of its query again and every cap holds whatever the client
 * did), with the build stamped by the server. An unticked item is absent from the input and so absent here; an empty
 * context is stored as null. `where` is kept only on accessibility reports.
 */
export function contextToStore(input: Pick<FeedbackInput, 'category' | 'context'>): FeedbackContext | null {
  if (!input.context) return null;
  const parsed = feedbackContextSchema.safeParse(input.context);
  if (!parsed.success) return null;
  const ctx: FeedbackContext = {
    ...parsed.data,
  };
  if (ctx.build !== undefined) ctx.build = currentBuildId();
  if (input.category !== 'accessibility') delete ctx.where;
  return Object.keys(ctx).length > 0 ? ctx : null;
}

export async function createFeedback(userId: string, input: FeedbackInput) {
  const context = contextToStore(input);
  return prisma.feedback.create({
    data: {
      category: input.category,
      message: input.message,
      userId,
      assistiveTech: input.category === 'accessibility' ? (input.assistiveTech ?? null) : null,
      ...(context
        ? {
            context: context as Prisma.InputJsonValue,
          }
        : {}),
    },
    include: {
      user: {
        select: userChipSelect,
      },
    },
  });
}

function readContext(raw: unknown): FeedbackContext | null {
  const p = feedbackContextSchema.safeParse(raw);
  return p.success ? p.data : null;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export interface AdminListFilter {
  status?: string | undefined;
  category?: string | undefined;
  q?: string | undefined;
  after?: string | undefined;
  limit?: number | undefined;
}

/**
 * The ids a text search matches: ILIKE over the newest SEARCH_WINDOW rows only (the table grows without bound), the
 * other filters and the keyset applied to that window. Raw SQL over the `feedback` table's quoted camelCase columns.
 */
export function searchSql(f: AdminListFilter, take: number): Prisma.Sql {
  const cursor = f.after ? decodeCursor(f.after) : null;
  const where: Prisma.Sql[] = [Prisma.sql`"message" ILIKE ${likePattern(f.q ?? '')} ESCAPE '\\'`];
  if (f.status) where.push(Prisma.sql`"status" = ${f.status}`);
  if (f.category) where.push(Prisma.sql`"category" = ${f.category}`);
  if (cursor) where.push(Prisma.sql`("createdAt", "id") < (${cursor.createdAt}, ${cursor.id})`);
  return Prisma.sql`SELECT "id" FROM (
    SELECT "id", "message", "status", "category", "createdAt" FROM "feedback"
    ORDER BY "createdAt" DESC, "id" DESC LIMIT ${SEARCH_WINDOW}
  ) AS "recent" WHERE ${Prisma.join(where, ' AND ')}
  ORDER BY "createdAt" DESC, "id" DESC LIMIT ${take}`;
}

const rowSelect = {
  id: true,
  category: true,
  message: true,
  status: true,
  outcome: true,
  createdAt: true,
  user: {
    select: userChipSelect,
  },
} satisfies Prisma.FeedbackSelect;

export async function listForAdmin(f: AdminListFilter): Promise<{
  rows: AdminFeedbackRow[];
  nextCursor: string | null;
  counts: {
    new: number;
    in_progress: number;
    closed: number;
  } | null;
}> {
  const limit = f.limit ?? INBOX_PAGE_SIZE;
  const take = limit + 1;
  let found: Array<
    Prisma.FeedbackGetPayload<{
      select: typeof rowSelect;
    }>
  >;
  if (f.q) {
    const ids = (
      await prisma.$queryRaw<
        Array<{
          id: string;
        }>
      >(searchSql(f, take))
    ).map((r) => r.id);
    found = ids.length
      ? await prisma.feedback.findMany({
          where: {
            id: {
              in: ids,
            },
          },
          orderBy: [
            {
              createdAt: 'desc',
            },
            {
              id: 'desc',
            },
          ],
          select: rowSelect,
        })
      : [];
  } else {
    const cursor = f.after ? decodeCursor(f.after) : null;
    found = await prisma.feedback.findMany({
      where: {
        ...(f.status
          ? {
              status: f.status,
            }
          : {}),
        ...(f.category
          ? {
              category: f.category,
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                {
                  createdAt: {
                    lt: cursor.createdAt,
                  },
                },
                {
                  createdAt: cursor.createdAt,
                  id: {
                    lt: cursor.id,
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take,
      select: rowSelect,
    });
  }
  const hasMore = found.length > limit;
  const page = hasMore ? found.slice(0, limit) : found;
  const last = page[page.length - 1];
  let counts: {
    new: number;
    in_progress: number;
    closed: number;
  } | null = null;
  if (!f.after) {
    const [n, p, c] = await Promise.all([
      prisma.feedback.count({
        where: {
          status: 'new',
        },
      }),
      prisma.feedback.count({
        where: {
          status: 'in_progress',
        },
      }),
      prisma.feedback.count({
        where: {
          status: 'closed',
        },
      }),
    ]);
    counts = {
      new: n,
      in_progress: p,
      closed: c,
    };
  }
  return {
    rows: page.map((r) => ({
      id: r.id,
      category: r.category,
      firstLine: firstLine(r.message),
      status: r.status,
      outcome: r.outcome,
      createdAt: r.createdAt.toISOString(),
      user: {
        id: r.user.id,
        name: r.user.name || r.user.handle || 'Unknown',
      },
    })),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    counts,
  };
}

const detailSelect = {
  id: true,
  category: true,
  message: true,
  assistiveTech: true,
  context: true,
  status: true,
  outcome: true,
  adminNote: true,
  reply: true,
  repliedAt: true,
  replyNotifiedAt: true,
  createdAt: true,
  user: {
    select: userChipSelect,
  },
} satisfies Prisma.FeedbackSelect;

function toDetail(
  r: Prisma.FeedbackGetPayload<{
    select: typeof detailSelect;
  }>,
): AdminFeedbackDetail {
  return {
    id: r.id,
    category: r.category,
    message: r.message,
    assistiveTech: r.assistiveTech,
    context: readContext(r.context),
    status: r.status,
    outcome: r.outcome,
    adminNote: r.adminNote,
    reply: r.reply,
    repliedAt: iso(r.repliedAt),
    replyNotifiedAt: iso(r.replyNotifiedAt),
    createdAt: r.createdAt.toISOString(),
    user: {
      id: r.user.id,
      name: r.user.name || r.user.handle || 'Unknown',
      handle: r.user.handle,
    },
  };
}

export async function getForAdmin(id: string): Promise<AdminFeedbackDetail | null> {
  const r = await prisma.feedback.findUnique({
    where: {
      id,
    },
    select: detailSelect,
  });
  return r ? toDetail(r) : null;
}

export interface FeedbackEdit {
  status?: string | undefined;
  outcome?: string | undefined;
  adminNote?: string | undefined;
  reply?: string | undefined;
}

/**
 * Apply one admin edit: the row change and one audit row per kind of change in the same transaction. A new or changed
 * reply clears `replyNotifiedAt`; the notification itself is sent by `notifyReply` after the transaction commits.
 * Returns null when the row does not exist.
 */
export async function updateFeedback(
  adminId: string,
  id: string,
  edit: FeedbackEdit,
): Promise<{
  feedback: AdminFeedbackDetail;
  notified: boolean;
} | null> {
  const before = await prisma.feedback.findUnique({
    where: {
      id,
    },
    select: {
      reply: true,
    },
  });
  if (!before) return null;
  const replyChanged = edit.reply !== undefined && edit.reply !== before.reply;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.feedback.update({
      where: {
        id,
      },
      data: {
        updatedAt: now,
        handledById: adminId,
        ...(edit.status !== undefined
          ? {
              status: edit.status,
              outcome: edit.status === 'closed' ? (edit.outcome ?? null) : null,
            }
          : {}),
        ...(edit.adminNote !== undefined
          ? {
              adminNote: edit.adminNote === '' ? null : edit.adminNote,
            }
          : {}),
        ...(replyChanged
          ? {
              reply: edit.reply ?? null,
              repliedAt: now,
              replyNotifiedAt: null,
            }
          : {}),
      },
    });
    if (edit.status !== undefined) {
      await recordAdminActionIn(tx, adminId, 'feedback.status', {
        targetType: 'feedback',
        targetId: id,
        detail: edit.status === 'closed' ? `closed: ${edit.outcome}` : edit.status,
      });
    }
    if (edit.adminNote !== undefined) {
      // The note's text stays out of the audit log: it is internal and the row already holds it.
      await recordAdminActionIn(tx, adminId, 'feedback.note', {
        targetType: 'feedback',
        targetId: id,
      });
    }
    if (replyChanged) {
      await recordAdminActionIn(tx, adminId, 'feedback.reply', {
        targetType: 'feedback',
        targetId: id,
      });
    }
  });

  const notified = edit.reply !== undefined ? await notifyReply(id) : false;
  const feedback = await getForAdmin(id);
  return feedback
    ? {
        feedback,
        notified,
      }
    : null;
}

/**
 * Tell the member about the current reply, once. The claim is a compare-and-set of `replyNotifiedAt` from null, so two
 * saves racing send one notification; if sending fails the claim is released so a retry can send it.
 */
export async function notifyReply(id: string): Promise<boolean> {
  const claim = await prisma.feedback.updateMany({
    where: {
      id,
      replyNotifiedAt: null,
      reply: {
        not: null,
      },
    },
    data: {
      replyNotifiedAt: new Date(),
    },
  });
  if (claim.count === 0) return false;
  const row = await prisma.feedback.findUnique({
    where: {
      id,
    },
    select: {
      userId: true,
    },
  });
  if (!row) return false;
  try {
    await createNotification({
      userId: row.userId,
      type: 'SYSTEM',
      entityType: 'feedback_reply',
      entityId: id,
      preview: notice('feedback-replied', {}),
      link: '/settings/feedback',
    });
  } catch (e) {
    await prisma.feedback.updateMany({
      where: {
        id,
      },
      data: {
        replyNotifiedAt: null,
      },
    });
    throw e;
  }
  return true;
}

/** The member's own feedback, newest first. Scoped by userId; the internal note is never selected. */
export async function listMine(userId: string): Promise<MyFeedbackRow[]> {
  const rows = await prisma.feedback.findMany({
    where: {
      userId,
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: MINE_CAP,
    select: {
      id: true,
      category: true,
      message: true,
      status: true,
      outcome: true,
      reply: true,
      repliedAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    firstLine: firstLine(r.message),
    message: r.message,
    status: r.status,
    outcome: r.outcome,
    reply: r.reply,
    repliedAt: iso(r.repliedAt),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Account deletion anonymises in place, so the cascade never fires: the member's feedback is deleted, and where they
 * were the admin who handled a row the reference is cleared. */
export function feedbackErasureOps(userId: string) {
  return [
    prisma.feedback.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.feedback.updateMany({
      where: {
        handledById: userId,
      },
      data: {
        handledById: null,
      },
    }),
  ];
}

/** The data export: what the member sent and what they were told. Never the internal note or who handled it. */
export async function exportFeedback(userId: string) {
  const rows = await prisma.feedback.findMany({
    where: {
      userId,
    },
    orderBy: [
      {
        createdAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    select: {
      id: true,
      category: true,
      message: true,
      assistiveTech: true,
      context: true,
      status: true,
      outcome: true,
      reply: true,
      repliedAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    repliedAt: iso(r.repliedAt),
  }));
}
