/**
 * Recurring community threads (s08-09, server-only): the templates' CRUD for moderators, the one function that
 * posts an occurrence, and the account-deletion and export hooks.
 *
 * Posting goes through the same gates as a hand-written post. `prepareCommunityPost` runs first (membership, bans and
 * timeouts, flair, verification, AutoMod) because `publishScheduledPost` re-checks only sanctions and the
 * image-description rule; a refusal, or an outcome AutoMod would hold or flag, pauses the template and creates
 * nothing. A template posts as `createdById`, the moderator who last saved it.
 */
import type { CommunityRecurringThread, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { createNotification } from '@/lib/notifications.server';
import { userChipSelect } from '@/lib/user-display';
import { canModerate, type CommunityRole } from '@/lib/communities/access.server';
import { activeSanction } from '@/lib/communities/bans.server';
import { flairBelongsTo } from '@/lib/communities/flairs.server';
import { logModAction } from '@/lib/communities/modlog.server';
import { prepareCommunityPost } from '@/lib/communities/post-gate.server';
import { publishScheduledPost } from '@/lib/scheduled/publish.server';
import {
  MAX_ACTIVE,
  PAUSE_REASONS,
  composeContent,
  formatTime,
  nextThreadAt,
  parseTime,
  type Cadence,
  type PauseReason,
  type RecurrenceSpec,
  type RecurringThreadDTO,
} from '@/lib/communities/recurring';
import type { CreateRecurringBody } from '@/lib/communities/recurring-schema';

type Row = CommunityRecurringThread;
type RowWithAuthor = Row & {
  createdBy: {
    id: string;
    name: string | null;
    handle: string | null;
  } | null;
};

const AUTHOR_SELECT = {
  select: userChipSelect,
} as const;

/** A failure the route turns into a status; `code` is for the client, never free text from a caught error. */
export class RecurringError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RecurringError';
  }
}

const PAUSE_SET: ReadonlySet<string> = new Set(PAUSE_REASONS);

export function specOf(
  row: Pick<Row, 'cadence' | 'weekday' | 'dayOfMonth' | 'minuteOfDay' | 'timeZone'>,
): RecurrenceSpec {
  return {
    cadence: row.cadence === 'monthly' ? 'monthly' : 'weekly',
    weekday: row.weekday,
    dayOfMonth: row.dayOfMonth,
    minuteOfDay: row.minuteOfDay,
    timeZone: row.timeZone,
  };
}

export function toDTO(row: RowWithAuthor): RecurringThreadDTO {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    flairId: row.flairId,
    cadence: row.cadence === 'monthly' ? 'monthly' : 'weekly',
    weekday: row.weekday,
    dayOfMonth: row.dayOfMonth,
    time: formatTime(row.minuteOfDay),
    timeZone: row.timeZone,
    nextAt: row.nextAt.toISOString(),
    active: row.active,
    pausedReason: row.pausedReason && PAUSE_SET.has(row.pausedReason) ? (row.pausedReason as PauseReason) : null,
    lastPostId: row.lastPostId,
    lastPostedAt: row.lastPostedAt ? row.lastPostedAt.toISOString() : null,
    failures: row.failures,
    author: row.createdBy,
  };
}

function specFromBody(body: CreateRecurringBody): RecurrenceSpec {
  return {
    cadence: body.cadence,
    weekday: body.cadence === 'weekly' ? (body.weekday ?? 0) : null,
    dayOfMonth: body.cadence === 'monthly' ? (body.dayOfMonth ?? 1) : null,
    minuteOfDay: parseTime(body.time) ?? 0,
    timeZone: body.timeZone,
  };
}

/** Templates are visible to the community's moderators only: the caller has passed `requireMod`. */
export async function listRecurring(communityId: string): Promise<RecurringThreadDTO[]> {
  const rows = await prisma.communityRecurringThread.findMany({
    where: {
      communityId,
    },
    orderBy: [
      {
        active: 'desc',
      },
      {
        nextAt: 'asc',
      },
    ],
    take: 100,
    include: {
      createdBy: AUTHOR_SELECT,
    },
  });
  return rows.map(toDTO);
}

async function assertFlair(communityId: string, flairId: string | null | undefined): Promise<void> {
  if (flairId && !(await flairBelongsTo(communityId, flairId))) {
    throw new RecurringError(400, 'flair_invalid', 'Unknown flair');
  }
}

/** The cap, checked inside a transaction that holds the community's recurring lock. */
async function assertRoom(tx: Prisma.TransactionClient, communityId: string, exceptId?: string): Promise<void> {
  const active = await tx.communityRecurringThread.count({
    where: {
      communityId,
      active: true,
      ...(exceptId
        ? {
            id: {
              not: exceptId,
            },
          }
        : {}),
    },
  });
  if (active >= MAX_ACTIVE) {
    throw new RecurringError(409, 'recurring_cap', `A community can have ${MAX_ACTIVE} active recurring threads`);
  }
}

const lockOf = (communityId: string) => `recurring:${communityId}`;

export async function createRecurring(args: {
  communityId: string;
  actorId: string;
  body: CreateRecurringBody;
  now?: Date;
}): Promise<RecurringThreadDTO> {
  const { communityId, actorId, body } = args;
  await assertFlair(communityId, body.flairId);
  const spec = specFromBody(body);
  const now = (args.now ?? new Date()).getTime();
  const row = await prisma.$transaction(async (tx) => {
    await lockKey(tx, lockOf(communityId));
    await assertRoom(tx, communityId);
    const created = await tx.communityRecurringThread.create({
      data: {
        communityId,
        createdById: actorId,
        title: body.title,
        body: body.body,
        flairId: body.flairId ?? null,
        cadence: spec.cadence,
        weekday: spec.weekday,
        dayOfMonth: spec.dayOfMonth,
        minuteOfDay: spec.minuteOfDay,
        timeZone: spec.timeZone,
        nextAt: new Date(nextThreadAt(spec, now)),
      },
      include: {
        createdBy: AUTHOR_SELECT,
      },
    });
    await logModAction(tx, {
      communityId,
      actorId,
      action: 'recurring_created',
      targetType: 'recurring',
      targetId: created.id,
      detail: {
        name: created.title.slice(0, 60),
      },
    });
    return created;
  });
  return toDTO(row);
}

/**
 * A full edit makes the editor the author, clears the failure count and resumes a paused template (the cap applies
 * again); `{ active }` alone pauses or resumes without touching the rest.
 */
export async function updateRecurring(args: {
  communityId: string;
  id: string;
  actorId: string;
  body:
    | (CreateRecurringBody & {
        active?: boolean | undefined;
      })
    | {
        active: boolean;
      };
  now?: Date;
}): Promise<RecurringThreadDTO> {
  const { communityId, id, actorId } = args;
  const now = (args.now ?? new Date()).getTime();
  const full = 'title' in args.body ? args.body : null;
  if (full) await assertFlair(communityId, full.flairId);
  const row = await prisma.$transaction(async (tx) => {
    await lockKey(tx, lockOf(communityId));
    const current = await tx.communityRecurringThread.findFirst({
      where: {
        id,
        communityId,
      },
    });
    if (!current) throw new RecurringError(404, 'not_found', 'Not found');
    // Saving a full edit resumes unless the form says otherwise; a bare `{ active }` is the switch.
    const wantActive = full ? (full.active ?? true) : args.body.active;
    if (wantActive && !current.active) await assertRoom(tx, communityId, id);
    const spec = full ? specFromBody(full) : specOf(current);
    const scheduleChanged =
      full !== null &&
      (spec.cadence !== current.cadence ||
        spec.weekday !== current.weekday ||
        spec.dayOfMonth !== current.dayOfMonth ||
        spec.minuteOfDay !== current.minuteOfDay ||
        spec.timeZone !== current.timeZone);
    const wasActive = current.active;
    const resuming = wantActive && !wasActive;
    const data: Prisma.CommunityRecurringThreadUncheckedUpdateInput = {
      active: wantActive,
      pausedReason: wantActive ? null : 'manual',
      ...(wantActive && (resuming || scheduleChanged || current.nextAt.getTime() <= now)
        ? {
            nextAt: new Date(nextThreadAt(spec, now)),
          }
        : {}),
      ...(resuming || full
        ? {
            failures: 0,
          }
        : {}),
      ...(full
        ? {
            // Whoever saves a template is the one it posts as.
            createdById: actorId,
            title: full.title,
            body: full.body,
            flairId: full.flairId ?? null,
            cadence: spec.cadence,
            weekday: spec.weekday,
            dayOfMonth: spec.dayOfMonth,
            minuteOfDay: spec.minuteOfDay,
            timeZone: spec.timeZone,
          }
        : {}),
    };
    const updated = await tx.communityRecurringThread.update({
      where: {
        id,
      },
      data,
      include: {
        createdBy: AUTHOR_SELECT,
      },
    });
    await logModAction(tx, {
      communityId,
      actorId,
      action: !wantActive && wasActive && !full ? 'recurring_paused' : 'recurring_updated',
      targetType: 'recurring',
      targetId: id,
      detail: {
        name: updated.title.slice(0, 60),
      },
    });
    return updated;
  });
  return toDTO(row);
}

export async function deleteRecurring(args: { communityId: string; id: string; actorId: string }): Promise<void> {
  const { communityId, id, actorId } = args;
  await prisma.$transaction(async (tx) => {
    const current = await tx.communityRecurringThread.findFirst({
      where: {
        id,
        communityId,
      },
      select: {
        id: true,
        title: true,
      },
    });
    if (!current) throw new RecurringError(404, 'not_found', 'Not found');
    await tx.communityRecurringThread.delete({
      where: {
        id,
      },
    });
    await logModAction(tx, {
      communityId,
      actorId,
      action: 'recurring_deleted',
      targetType: 'recurring',
      targetId: id,
      detail: {
        name: current.title.slice(0, 60),
      },
    });
  });
}

export type OccurrenceResult =
  | {
      ok: true;
      postId: string;
    }
  | {
      ok: false;
      reason: PauseReason;
    };

/**
 * Post one occurrence of a template as its current author. Claiming the occurrence (moving `nextAt`) is the
 * caller's job and happens before this runs; nothing here touches the schedule.
 */
export async function postOccurrence(row: Row, now: Date): Promise<OccurrenceResult> {
  const community = await prisma.community.findUnique({
    where: {
      id: row.communityId,
    },
    select: {
      id: true,
    },
  });
  if (!community)
    return {
      ok: false,
      reason: 'community_gone',
    };

  const [member, author] = await Promise.all([
    prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: row.communityId,
          userId: row.createdById,
        },
      },
      select: {
        role: true,
      },
    }),
    prisma.user.findUnique({
      where: {
        id: row.createdById,
      },
      // Not a display shape: only the account-wide ban matters here.
      select: {
        bannedUntil: true,
      },
    }),
  ]);
  if (!member || !canModerate(member.role as CommunityRole))
    return {
      ok: false,
      reason: 'author_not_moderator',
    };
  if (!author)
    return {
      ok: false,
      reason: 'author_not_moderator',
    };
  if (author.bannedUntil && author.bannedUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      reason: 'author_sanctioned',
    };
  }
  if (await activeSanction(row.communityId, row.createdById))
    return {
      ok: false,
      reason: 'author_sanctioned',
    };

  const content = composeContent(row.title, row.body);
  const gate = await prepareCommunityPost({
    communityId: row.communityId,
    userId: row.createdById,
    content,
    flairId: row.flairId,
  });
  if (!gate.ok)
    return {
      ok: false,
      reason: 'gate_refused',
    };
  if (gate.held || gate.flagRule)
    return {
      ok: false,
      reason: 'held_by_automod',
    };

  const draft = await prisma.scheduledPost.create({
    data: {
      userId: row.createdById,
      content,
      communityId: row.communityId,
      scheduledAt: now,
    },
  });
  let postId: string | null = null;
  try {
    postId = await publishScheduledPost(draft);
  } finally {
    if (!postId) {
      // A sanction landed in between (or publishing failed): never leave the row in the moderator's drafts.
      await prisma.scheduledPost
        .deleteMany({
          where: {
            id: draft.id,
            publishedId: null,
          },
        })
        .catch((e: unknown) => console.error('[recurring] draft cleanup error:', e));
    }
  }
  if (!postId)
    return {
      ok: false,
      reason: 'author_sanctioned',
    };

  if (row.flairId) {
    await prisma.communityPostFlair
      .upsert({
        where: {
          postId,
        },
        create: {
          postId,
          flairId: row.flairId,
        },
        update: {
          flairId: row.flairId,
        },
      })
      .catch((e: unknown) => console.error('[recurring] flair error:', e));
  }
  await prisma.communityRecurringThread.updateMany({
    where: {
      id: row.id,
    },
    data: {
      lastPostId: postId,
      lastPostedAt: now,
      failures: 0,
    },
  });
  return {
    ok: true,
    postId,
  };
}

/**
 * Pause a template that cannot post and tell the community's moderators once. The pause is a compare-and-set on
 * `active`, so a retry or a second runner never sends a second notice.
 */
export async function pauseRecurring(
  row: Pick<Row, 'id' | 'communityId' | 'title'>,
  reason: PauseReason,
): Promise<boolean> {
  const { count } = await prisma.communityRecurringThread.updateMany({
    where: {
      id: row.id,
      active: true,
    },
    data: {
      active: false,
      pausedReason: reason,
      failures: {
        increment: 1,
      },
    },
  });
  if (count !== 1) return false;
  try {
    const [community, mods] = await Promise.all([
      prisma.community.findUnique({
        where: {
          id: row.communityId,
        },
        select: {
          name: true,
          slug: true,
        },
      }),
      prisma.communityMember.findMany({
        where: {
          communityId: row.communityId,
          role: {
            in: ['MOD', 'ADMIN'],
          },
        },
        select: {
          userId: true,
        },
        take: 200,
      }),
    ]);
    if (!community) return true;
    for (const m of mods) {
      await createNotification({
        userId: m.userId,
        type: 'SYSTEM',
        entityType: 'community-recurring-paused',
        entityId: row.id,
        preview: `The recurring thread "${row.title}" in ${community.name} was paused`,
        link: `/c/${community.slug}`,
      });
    }
  } catch (e) {
    console.error('[recurring] pause notice error:', e);
  }
  return true;
}

/** "Post now": the next occurrence happens at once and the schedule does not move. */
export async function postRecurringNow(args: { communityId: string; id: string; now?: Date }): Promise<string> {
  const row = await prisma.communityRecurringThread.findFirst({
    where: {
      id: args.id,
      communityId: args.communityId,
    },
  });
  if (!row) throw new RecurringError(404, 'not_found', 'Not found');
  const result = await postOccurrence(row, args.now ?? new Date());
  if (!result.ok) {
    await pauseRecurring(row, result.reason);
    throw new RecurringError(409, result.reason, 'The thread could not be posted and was paused');
  }
  return result.postId;
}

/** Account deletion: the templates the member authored. */
export async function recurringThreadErasureOps(userId: string) {
  // A pre-step outside the transaction: which communities have the member's templates, and who owns them.
  const mine = await prisma.communityRecurringThread.findMany({
    where: {
      createdById: userId,
    },
    select: {
      communityId: true,
    },
    distinct: ['communityId'],
  });
  const communityIds = Array.isArray(mine) ? mine.map((m) => m.communityId) : [];
  const communities =
    communityIds.length > 0
      ? await prisma.community.findMany({
          where: {
            id: {
              in: communityIds,
            },
          },
          select: {
            id: true,
            createdById: true,
          },
        })
      : [];
  const reassign = (Array.isArray(communities) ? communities : []).filter((c) => c.createdById !== userId);
  return [
    // First, every template of theirs stops posting, whatever happens to it next.
    prisma.communityRecurringThread.updateMany({
      where: {
        createdById: userId,
      },
      data: {
        active: false,
        pausedReason: 'author_not_moderator',
      },
    }),
    // De-identified: handed to the community owner and paused, so nothing posts under their name until a moderator saves it.
    ...reassign.map((c) =>
      prisma.communityRecurringThread.updateMany({
        where: {
          createdById: userId,
          communityId: c.id,
        },
        data: {
          createdById: c.createdById,
          active: false,
          pausedReason: 'author_not_moderator',
        },
      }),
    ),
    // What is left (the member owned the community, or it has no owner) goes.
    prisma.communityRecurringThread.deleteMany({
      where: {
        createdById: userId,
      },
    }),
  ];
}

/** The account export: the templates the member authored. */
export async function exportRecurringThreads(userId: string) {
  const rows = await prisma.communityRecurringThread.findMany({
    where: {
      createdById: userId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: 500,
    select: {
      id: true,
      communityId: true,
      title: true,
      body: true,
      cadence: true,
      weekday: true,
      dayOfMonth: true,
      minuteOfDay: true,
      timeZone: true,
      nextAt: true,
      active: true,
      lastPostedAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    communityId: r.communityId,
    title: r.title,
    body: r.body,
    cadence: r.cadence as Cadence,
    weekday: r.weekday,
    dayOfMonth: r.dayOfMonth,
    time: formatTime(r.minuteOfDay),
    timeZone: r.timeZone,
    nextAt: r.nextAt.toISOString(),
    active: r.active,
    lastPostedAt: r.lastPostedAt ? r.lastPostedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
