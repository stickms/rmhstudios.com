/**
 * Reports of an RMHTube room or watch party (s14-10). The room's code is the report's entity id.
 *
 * - `roomReportAuthor`: the host, who a report of the room is about (null for a missing or already removed room).
 * - `roomReportable`: whether this reporter may report it: it exists, is not removed, is public or the reporter is in
 *   it (`RmhTubeRoomMember`, present or past), and the reporter is not its host. Everyone else gets the same answer as
 *   an unknown code, so a private room's code cannot be probed.
 * - `roomPreviews`: the moderator's one line per room (name, description, host, visibility, time).
 * - `takeDownRoom`: stamp `moderatedAt` and `closedAt` once, tell the members going, tell the hub through Redis.
 * - `recentlyModeratedName`: whether a host's room of this name was removed in the last 30 days.
 *
 * The hub never imports this file: it reads the row through its own Prisma client (`server/rmhtube/room-manager.ts`)
 * and applies the same pure rules from `./room-reports`.
 */
import { notice } from '@/lib/notifications/notice-keys';
import { createNotification } from '@/lib/notifications.server';
import { prisma } from '@/lib/prisma.server';
import { redisPublish } from '@/lib/redis.server';
import { ROOM_CLOSED_CHANNEL } from '@/lib/rmhtube/events';
import { partyPath } from '@/lib/rmhtube/parties';
import {
  isRemovedRoomName,
  removedNameSince,
  roomPreviewLine,
  type RoomPreviewInput,
} from '@/lib/rmhtube/room-reports';
import { PARTY_NOTICE_ENTITY } from '@/lib/rmhtube/subscriptions';

export { ROOM_CLOSED_CHANNEL };

const FALLBACK_NAME = 'Watch party';

/** The member who hosts the room, with no membership check (the report route's best-effort target lookup). */
export async function roomReportAuthor(roomId: string): Promise<string | null> {
  const room = await prisma.rmhTubeRoom.findUnique({
    where: { id: roomId },
    select: { hostId: true, moderatedAt: true },
  });
  return room && room.moderatedAt === null ? room.hostId : null;
}

export type RoomReportTarget = { ok: true; hostId: string } | { ok: false; reason: 'missing' | 'own' };

/**
 * Whether `reporterId` may report the room, and who it is about. A private room the reporter was never in, a removed
 * room and an unknown code all answer `missing`; the host's own room answers `own`.
 */
export async function roomReportable(roomId: string, reporterId: string): Promise<RoomReportTarget> {
  const room = await prisma.rmhTubeRoom.findUnique({
    where: { id: roomId },
    select: { hostId: true, isPublic: true, moderatedAt: true },
  });
  if (!room || room.moderatedAt !== null) return { ok: false, reason: 'missing' };
  if (room.hostId === reporterId) return { ok: false, reason: 'own' };
  if (!room.isPublic) {
    const member = await prisma.rmhTubeRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: reporterId } },
      select: { id: true },
    });
    if (!member) return { ok: false, reason: 'missing' };
  }
  return { ok: true, hostId: room.hostId };
}

/** The moderator's view of each reported room, keyed by room code. */
export async function roomPreviews(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await prisma.rmhTubeRoom.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
      scheduledFor: true,
      hostId: true,
      host: { select: { name: true } },
    },
  });
  for (const row of rows) {
    const input: RoomPreviewInput = {
      id: row.id,
      name: row.name,
      description: row.description,
      isPublic: row.isPublic,
      scheduledFor: row.scheduledFor,
      hostId: row.hostId,
      hostName: row.host.name,
    };
    out.set(row.id, roomPreviewLine(input));
  }
  return out;
}

/** Whether the host had a room with this name (trimmed, any case) removed by a moderator in the last 30 days. */
export async function recentlyModeratedName(
  hostId: string,
  name: string | null | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  if (!name?.trim()) return false;
  const rows = await prisma.rmhTubeRoom.findMany({
    where: { hostId, moderatedAt: { gte: removedNameSince(now) } },
    select: { name: true },
  });
  return isRemovedRoomName(
    name,
    rows.map((r) => r.name),
  );
}

export interface RoomTakedown {
  /** This call removed the room (a second call, or an unknown room, did not). */
  taken: boolean;
  /** Members going who were sent the notice. */
  notified: number;
  /** The hub was told through Redis; false without Redis, when a running room is not reached. */
  published: boolean;
}

/**
 * Take a reported room down. One conditional update stamps `moderatedAt` (`where: moderatedAt: null`), so two
 * moderators resolving at once stamp it once and only the winner sends notices and tells the hub. `closedAt` is
 * stamped only when the room is still open: an earlier close time is never overwritten.
 */
export async function takeDownRoom(roomId: string, now: Date = new Date()): Promise<RoomTakedown> {
  const claim = await prisma.$transaction(async (tx) => {
    const stamped = await tx.rmhTubeRoom.updateMany({
      where: { id: roomId, moderatedAt: null },
      data: { moderatedAt: now },
    });
    if (stamped.count === 0) return null;
    await tx.rmhTubeRoom.updateMany({
      where: { id: roomId, closedAt: null },
      data: { closedAt: now },
    });
    return tx.rmhTubeRoom.findUnique({ where: { id: roomId }, select: { name: true } });
  });
  if (!claim) return { taken: false, notified: 0, published: false };

  const going = await prisma.rmhTubeRoomRsvp.findMany({ where: { roomId }, select: { userId: true } });
  const name = claim.name?.trim() || FALLBACK_NAME;
  await Promise.all(
    going.map((g) =>
      createNotification({
        userId: g.userId,
        type: 'SYSTEM',
        category: 'events',
        entityType: PARTY_NOTICE_ENTITY,
        entityId: roomId,
        preview: notice('party-cancelled', { name }),
        link: partyPath(roomId),
      }),
    ),
  );
  const published = redisPublish(ROOM_CLOSED_CHANNEL, { roomId });
  return { taken: true, notified: going.length, published };
}
