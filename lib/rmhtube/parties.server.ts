/**
 * Scheduled RMHTube watch parties — the database side (server-only).
 *
 * A party is an ordinary `RmhTubeRoom` row created ahead of time with `scheduledFor`, so the hub needs no
 * second room model: when someone joins, `RoomManager.loadRoomFromDb` finds the row (`closedAt: null`),
 * hydrates its queue (the optional first video is a `RmhTubeQueueItem` with `playedAt: null`) and the party
 * is a room like any other. What this file owns is everything before that moment: creating the row, who may
 * change it, who is going, and the calendar entry.
 */
import { notice, type NoticePreview } from '@/lib/notifications/notice-keys';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { generateRoomCode } from '@/lib/rmhtube/utils';
import { parseMedia } from '@/lib/rmhtube/media';
import { enqueueTubePartyFanout } from '@/lib/rmhtube/subscriptions.server';
import {
  EXPIRE_AFTER_MS,
  GOING_AVATARS,
  MAX_SCHEDULED_PER_DAY,
  MAX_UPCOMING_PER_HOST,
  REMINDER_LEAD_MS,
  UPCOMING_LIMIT,
  UPCOMING_WINDOW_MS,
  checkStart,
  partyPath,
  roomPath,
  selectReminders,
  type PartyCalendarInput,
} from '@/lib/rmhtube/parties';
import type { PartyDTO, PartyPerson } from '@/lib/rmhtube/parties.contract';
import type { scheduleBody, updatePartyBody } from '@/lib/rmhtube/parties-schema';
import type { z } from 'zod';

/** Why a request was refused; the route maps each to a status and the page to a translated line. */
export type PartyRefusal =
  | 'TOO_SOON'
  | 'TOO_FAR'
  | 'INVALID_TIME'
  | 'HOST_LIMIT'
  | 'DAILY_LIMIT'
  | 'INVALID_VIDEO'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CLOSED';

export type PartyResult<T = PartyDTO> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      reason: PartyRefusal;
    };

const FALLBACK_NAME = 'Watch party';
const ROOM_CODE_ATTEMPTS = 6;

const partyInclude = {
  host: {
    select: userDisplaySelect,
  },
  _count: {
    select: {
      rsvps: true,
    },
  },
  rsvps: {
    orderBy: {
      createdAt: 'asc',
    },
    take: GOING_AVATARS,
    include: {
      user: {
        select: userDisplaySelect,
      },
    },
  },
} as const satisfies Prisma.RmhTubeRoomInclude;

type PartyRow = Prisma.RmhTubeRoomGetPayload<{
  include: typeof partyInclude;
}>;

const person = (u: Parameters<typeof resolveUser>[0]): PartyPerson => {
  const r = resolveUser(u);
  return {
    id: r.id,
    name: r.name,
    image: r.image,
  };
};

function toDto(row: PartyRow, viewerId: string | null, going: ReadonlySet<string>): PartyDTO {
  return {
    roomId: row.id,
    name: row.name?.trim() || FALLBACK_NAME,
    description: row.description,
    scheduledFor: (row.scheduledFor as Date).toISOString(),
    isPublic: row.isPublic,
    maxMembers: row.maxMembers,
    host: person(row.host),
    goingCount: row._count.rsvps,
    firstGoing: row.rsvps.slice(0, GOING_AVATARS).map((r) => person(r.user)),
    viewerGoing: going.has(row.id),
    viewerIsHost: viewerId !== null && row.hostId === viewerId,
    closed: row.closedAt !== null,
  };
}

async function goingSet(viewerId: string | null, roomIds: string[]): Promise<Set<string>> {
  if (!viewerId || roomIds.length === 0) return new Set();
  const rows = await prisma.rmhTubeRoomRsvp.findMany({
    where: {
      userId: viewerId,
      roomId: {
        in: roomIds,
      },
    },
    select: {
      roomId: true,
    },
  });
  return new Set(rows.map((r) => r.roomId));
}

async function dtoFor(row: PartyRow, viewerId: string | null): Promise<PartyDTO> {
  return toDto(row, viewerId, await goingSet(viewerId, [row.id]));
}

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Schedule a party: validates the window and the host's limits, then creates the room row. */
export async function scheduleParty(
  hostId: string,
  input: z.infer<typeof scheduleBody>,
  now: Date = new Date(),
): Promise<PartyResult> {
  const startMs = Date.parse(input.startsAt);
  const window = checkStart(startMs, now.getTime());
  if (window === 'too-soon')
    return {
      ok: false,
      reason: 'TOO_SOON',
    };
  if (window === 'too-far')
    return {
      ok: false,
      reason: 'TOO_FAR',
    };
  if (window === 'invalid')
    return {
      ok: false,
      reason: 'INVALID_TIME',
    };

  // Password rooms cannot be scheduled: the page is public and a password cannot be shared on it, so the
  // room is created without one (this endpoint takes no password at all).
  let video: {
    url: string;
    mediaType: string;
    title: string;
    thumbnailUrl: string | null;
  } | null = null;
  if (input.firstVideoUrl) {
    const media = parseMedia(input.firstVideoUrl);
    if (!media)
      return {
        ok: false,
        reason: 'INVALID_VIDEO',
      };
    video = {
      url: media.url,
      mediaType: media.mediaType,
      title: (media.label || new URL(media.url).hostname).slice(0, 256),
      thumbnailUrl: media.thumbnailUrl,
    };
  }

  const hostUser = await prisma.user.findUnique({
    where: {
      id: hostId,
    },
    select: userDisplaySelect,
  });

  for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt++) {
    try {
      // The limit checks and the insert share one transaction behind a per-host advisory lock, so two
      // concurrent requests cannot both read "under the limit" and both create. A room-code collision
      // aborts the transaction, so the retry loop sits outside it.
      const result = await prisma.$transaction(async (tx): Promise<PartyResult> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rmhtube-party-host:${hostId}`}))`;
        const upcoming = await tx.rmhTubeRoom.count({
          where: {
            hostId,
            closedAt: null,
            scheduledFor: {
              gt: now,
            },
          },
        });
        if (upcoming >= MAX_UPCOMING_PER_HOST)
          return {
            ok: false,
            reason: 'HOST_LIMIT',
          };
        const today = await tx.rmhTubeRoom.count({
          where: {
            hostId,
            scheduledFor: {
              not: null,
            },
            createdAt: {
              gt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            },
          },
        });
        if (today >= MAX_SCHEDULED_PER_DAY)
          return {
            ok: false,
            reason: 'DAILY_LIMIT',
          };

        const row = await tx.rmhTubeRoom.create({
          data: {
            id: generateRoomCode(),
            name: input.name,
            description: input.description || null,
            hostId,
            isPublic: input.isPublic,
            password: null,
            maxMembers: input.maxMembers,
            scheduledFor: new Date(startMs),
            ...(video
              ? {
                  queue: {
                    create: {
                      ...video,
                      addedById: hostId,
                      addedByName: (hostUser && resolveUser(hostUser).name) || 'Host',
                      position: 0,
                    },
                  },
                }
              : {}),
          },
          include: partyInclude,
        });
        return {
          ok: true,
          value: toDto(row, hostId, new Set()),
        };
      });
      // s13-07: the subscribers hear about a public party only once it has committed (a failed queue is logged, not thrown).
      if (result.ok && result.value.isPublic) await enqueueTubePartyFanout(result.value.roomId);
      return result;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error('could not allocate a room code');
}

/** The party behind a room code, or null when the room is not a scheduled party. */
export async function getParty(roomId: string, viewerId: string | null): Promise<PartyDTO | null> {
  const row = await prisma.rmhTubeRoom.findUnique({
    where: {
      id: roomId,
    },
    include: partyInclude,
  });
  if (!row || !row.scheduledFor) return null;
  return dtoFor(row, viewerId);
}

/**
 * Parties for the landing: the member's own (hosting or going, any visibility) first, then public ones, each
 * soonest first. Link-only parties are never listed to anyone but their host and the people going.
 */
export async function listUpcoming(viewerId: string | null, now: Date = new Date()): Promise<PartyDTO[]> {
  const since = new Date(now.getTime() - EXPIRE_AFTER_MS);
  const open = {
    closedAt: null,
    scheduledFor: {
      gte: since,
    },
  } as const;
  const mine = viewerId
    ? await prisma.rmhTubeRoom.findMany({
        where: {
          ...open,
          OR: [
            {
              hostId: viewerId,
            },
            {
              rsvps: {
                some: {
                  userId: viewerId,
                },
              },
            },
          ],
        },
        orderBy: {
          scheduledFor: 'asc',
        },
        take: UPCOMING_LIMIT,
        include: partyInclude,
      })
    : [];
  const publicRows = await prisma.rmhTubeRoom.findMany({
    where: {
      ...open,
      isPublic: true,
      scheduledFor: {
        gte: since,
        lte: new Date(now.getTime() + UPCOMING_WINDOW_MS),
      },
    },
    orderBy: {
      scheduledFor: 'asc',
    },
    take: UPCOMING_LIMIT,
    include: partyInclude,
  });
  const seen = new Set(mine.map((r) => r.id));
  const rows = [...mine, ...publicRows.filter((r) => !seen.has(r.id))];
  const going = await goingSet(
    viewerId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toDto(r, viewerId, going));
}

const NOTIFY_ENTITY = 'rmhtube_party';

async function notifyGoing(roomId: string, name: string, preview: (name: string) => NoticePreview, link: string) {
  const going = await prisma.rmhTubeRoomRsvp.findMany({
    where: {
      roomId,
    },
    select: {
      userId: true,
    },
  });
  await Promise.all(
    going.map((g) =>
      createNotification({
        userId: g.userId,
        type: 'SYSTEM',
        category: 'events',
        entityType: NOTIFY_ENTITY,
        entityId: roomId,
        preview: preview(name),
        link,
      }),
    ),
  );
}

/** Edit a party's name, description or time. Only its host; going members hear once about a new time. */
export async function updateParty(
  roomId: string,
  userId: string,
  patch: z.infer<typeof updatePartyBody>,
  now: Date = new Date(),
): Promise<PartyResult> {
  const room = await prisma.rmhTubeRoom.findUnique({
    where: {
      id: roomId,
    },
  });
  if (!room || !room.scheduledFor)
    return {
      ok: false,
      reason: 'NOT_FOUND',
    };
  if (room.hostId !== userId)
    return {
      ok: false,
      reason: 'FORBIDDEN',
    };
  if (room.closedAt)
    return {
      ok: false,
      reason: 'CLOSED',
    };

  let newStart: Date | null = null;
  if (patch.startsAt !== undefined) {
    const startMs = Date.parse(patch.startsAt);
    const window = checkStart(startMs, now.getTime());
    if (window === 'too-soon')
      return {
        ok: false,
        reason: 'TOO_SOON',
      };
    if (window === 'too-far')
      return {
        ok: false,
        reason: 'TOO_FAR',
      };
    if (window === 'invalid')
      return {
        ok: false,
        reason: 'INVALID_TIME',
      };
    if (startMs !== room.scheduledFor.getTime()) newStart = new Date(startMs);
  }

  // The host is part of the claim, so a request that raced a host transfer changes nothing.
  const claimed = await prisma.rmhTubeRoom.updateMany({
    where: {
      id: roomId,
      hostId: userId,
      closedAt: null,
    },
    data: {
      ...(patch.name !== undefined
        ? {
            name: patch.name,
          }
        : {}),
      ...(patch.description !== undefined
        ? {
            description: patch.description || null,
          }
        : {}),
      ...(newStart
        ? {
            scheduledFor: newStart,
          }
        : {}),
    },
  });
  if (claimed.count === 0)
    return {
      ok: false,
      reason: 'FORBIDDEN',
    };

  const name = patch.name ?? room.name ?? FALLBACK_NAME;
  if (newStart) {
    // A new time means the reminders for it have not been sent.
    await prisma.rmhTubeRoomRsvp.updateMany({
      where: {
        roomId,
      },
      data: {
        remindedAt: null,
        startedNotifiedAt: null,
      },
    });
    await notifyGoing(roomId, name, (n) => notice('party-time-changed', { name: n }), partyPath(roomId));
  }
  const row = await prisma.rmhTubeRoom.findUnique({
    where: {
      id: roomId,
    },
    include: partyInclude,
  });
  if (!row)
    return {
      ok: false,
      reason: 'NOT_FOUND',
    };
  return {
    ok: true,
    value: await dtoFor(row, userId),
  };
}

/** Cancel a party: closes the room (so the hub cannot load it) and tells the people going. Only its host. */
export async function cancelParty(roomId: string, userId: string, now: Date = new Date()): Promise<PartyResult<null>> {
  const room = await prisma.rmhTubeRoom.findUnique({
    where: {
      id: roomId,
    },
  });
  if (!room || !room.scheduledFor)
    return {
      ok: false,
      reason: 'NOT_FOUND',
    };
  if (room.hostId !== userId)
    return {
      ok: false,
      reason: 'FORBIDDEN',
    };
  const closed = await prisma.rmhTubeRoom.updateMany({
    where: {
      id: roomId,
      hostId: userId,
      closedAt: null,
    },
    data: {
      closedAt: now,
    },
  });
  if (closed.count === 0)
    return {
      ok: false,
      reason: 'CLOSED',
    };
  await notifyGoing(
    roomId,
    room.name ?? FALLBACK_NAME,
    (n) => notice('party-cancelled', { name: n }),
    partyPath(roomId),
  );
  return {
    ok: true,
    value: null,
  };
}

/** Say you are going (or not). Reminders that are already past are stamped so a late RSVP is not told "now". */
export async function setGoing(
  roomId: string,
  userId: string,
  going: boolean,
  now: Date = new Date(),
): Promise<PartyResult> {
  const room = await prisma.rmhTubeRoom.findUnique({
    where: {
      id: roomId,
    },
    include: partyInclude,
  });
  if (!room || !room.scheduledFor)
    return {
      ok: false,
      reason: 'NOT_FOUND',
    };
  if (room.closedAt || room.scheduledFor.getTime() + EXPIRE_AFTER_MS <= now.getTime()) {
    return {
      ok: false,
      reason: 'CLOSED',
    };
  }
  if (going) {
    const start = room.scheduledFor.getTime();
    const t = now.getTime();
    await prisma.rmhTubeRoomRsvp.createMany({
      data: [
        {
          roomId,
          userId,
          remindedAt: t >= start - REMINDER_LEAD_MS ? now : null,
          startedNotifiedAt: t >= start ? now : null,
        },
      ],
      skipDuplicates: true,
    });
  } else {
    await prisma.rmhTubeRoomRsvp.deleteMany({
      where: {
        roomId,
        userId,
      },
    });
  }
  const fresh = await prisma.rmhTubeRoom.findUnique({
    where: {
      id: roomId,
    },
    include: partyInclude,
  });
  if (!fresh)
    return {
      ok: false,
      reason: 'NOT_FOUND',
    };
  return {
    ok: true,
    value: await dtoFor(fresh, userId),
  };
}

/** What the calendar download needs; null for anything that is not a party. */
export async function partyForCalendar(roomId: string): Promise<
  | (PartyCalendarInput & {
      isPublic: boolean;
    })
  | null
> {
  const row = await prisma.rmhTubeRoom.findUnique({
    where: {
      id: roomId,
    },
  });
  if (!row || !row.scheduledFor) return null;
  return {
    roomId: row.id,
    name: row.name,
    description: row.description,
    scheduledFor: row.scheduledFor,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
    isPublic: row.isPublic,
  };
}

export interface ReminderRunResult {
  closed: number;
  soon: number;
  started: number;
}

/**
 * One pass of the reminder job. Each reminder is claimed per member with a conditional update
 * (`remindedAt` / `startedNotifiedAt` still null), so a second worker or a re-run sends nothing twice: only
 * the call that flips the stamp sends the notification. Rooms nobody opened within three hours of their time
 * are closed.
 */
export async function runPartyReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const t = now.getTime();
  const result: ReminderRunResult = {
    closed: 0,
    soon: 0,
    started: 0,
  };

  const expired = await prisma.rmhTubeRoom.updateMany({
    where: {
      closedAt: null,
      scheduledFor: {
        not: null,
        lt: new Date(t - EXPIRE_AFTER_MS),
      },
      members: {
        none: {},
      },
    },
    data: {
      closedAt: now,
    },
  });
  result.closed = expired.count;

  const rooms = await prisma.rmhTubeRoom.findMany({
    where: {
      closedAt: null,
      scheduledFor: {
        gte: new Date(t - EXPIRE_AFTER_MS),
        lte: new Date(t + REMINDER_LEAD_MS),
      },
    },
    select: {
      id: true,
      name: true,
      scheduledFor: true,
      rsvps: {
        select: {
          userId: true,
          remindedAt: true,
          startedNotifiedAt: true,
        },
      },
    },
  });

  for (const room of rooms) {
    if (!room.scheduledFor) continue;
    const name = room.name?.trim() || FALLBACK_NAME;
    const due = selectReminders(room.rsvps, room.scheduledFor.getTime(), t);
    for (const userId of due.soon) {
      const claim = await prisma.rmhTubeRoomRsvp.updateMany({
        where: {
          roomId: room.id,
          userId,
          remindedAt: null,
        },
        data: {
          remindedAt: now,
        },
      });
      if (claim.count === 0) continue;
      await createNotification({
        userId,
        type: 'SYSTEM',
        category: 'events',
        entityType: NOTIFY_ENTITY,
        entityId: room.id,
        preview: notice('party-starting-soon', { name }),
        link: roomPath(room.id),
      });
      result.soon++;
    }
    for (const userId of due.started) {
      const claim = await prisma.rmhTubeRoomRsvp.updateMany({
        where: {
          roomId: room.id,
          userId,
          startedNotifiedAt: null,
        },
        data: {
          startedNotifiedAt: now,
        },
      });
      if (claim.count === 0) continue;
      await createNotification({
        userId,
        type: 'SYSTEM',
        category: 'events',
        entityType: NOTIFY_ENTITY,
        entityId: room.id,
        preview: notice('party-starting-now', { name }),
        link: roomPath(room.id),
      });
      result.started++;
    }
  }
  return result;
}

/** Account erasure: the member's RSVPs go, and the parties they host and have not held are closed. */
export function partyErasureOps(userId: string, now: Date = new Date()) {
  return [
    prisma.rmhTubeRoomRsvp.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhTubeRoom.updateMany({
      where: {
        hostId: userId,
        closedAt: null,
        scheduledFor: {
          gt: now,
        },
      },
      data: {
        closedAt: now,
      },
    }),
  ];
}

/** The member's party RSVPs, for the account export. */
export async function exportWatchPartyRsvps(userId: string) {
  const rows = await prisma.rmhTubeRoomRsvp.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      roomId: true,
      createdAt: true,
      room: {
        select: {
          name: true,
          scheduledFor: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    roomId: r.roomId,
    name: r.room.name,
    scheduledFor: r.room.scheduledFor?.toISOString() ?? null,
    wentAt: r.createdAt.toISOString(),
  }));
}

const REFUSAL_STATUS: Record<PartyRefusal, number> = {
  TOO_SOON: 400,
  TOO_FAR: 400,
  INVALID_TIME: 400,
  INVALID_VIDEO: 400,
  HOST_LIMIT: 429,
  DAILY_LIMIT: 429,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CLOSED: 409,
};

/** The error response for a refusal: a stable `reason` the page translates, and a generic `error` line. */
export function refusalResponse(reason: PartyRefusal): Response {
  return Response.json(
    {
      error: 'Request not allowed',
      reason,
    },
    {
      status: REFUSAL_STATUS[reason],
    },
  );
}

/** A room code from the URL: six characters, upper-cased the way the hub does. Null when malformed. */
export function roomIdFromParams(params: Record<string, string>): string | null {
  const id = (params.roomId ?? '').toUpperCase();
  return /^[A-Z0-9]{6}$/.test(id) ? id : null;
}
