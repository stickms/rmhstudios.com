/** Watch-room persistence and permissions. Server-only. */

import { randomInt } from 'node:crypto';
import type { ElectionRoom, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { publishRoomConfig } from './chat.server';
import { defaultRoomConfig, isRoomCode, sanitizeRoomConfig, type RoomConfig } from './room-config';
import { MAX_ROOMS_PER_USER, describeConfig, generateRoomCode, roomExpiry, type RoomListItem, type RoomView } from './rooms';

const withOwner = { owner: { select: userDisplaySelect } } as const;
type RoomRow = ElectionRoom & { owner: Prisma.UserGetPayload<{ select: typeof userDisplaySelect }> | null };

function ownerView(row: RoomRow): RoomView['owner'] {
  if (!row.owner) return null;
  const u = resolveUser(row.owner);
  return { id: row.ownerId, name: u.name ?? u.username ?? null, handle: u.handle ?? null, image: u.image ?? null };
}

export function toRoomView(row: RoomRow, viewerId: string | null): RoomView {
  return {
    code: row.code,
    name: row.name,
    visibility: row.visibility,
    electionDate: row.electionDate,
    // Whatever is stored is re-sanitised on the way out: a hand-edited row can never break a client.
    config: sanitizeRoomConfig(row.config),
    owner: ownerView(row),
    mine: viewerId != null && row.ownerId === viewerId,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export type CreateRoomResult = { ok: true; room: RoomView } | { ok: false; status: number; error: string };

export async function createRoom(
  userId: string,
  input: { name: string; visibility: 'PUBLIC' | 'PRIVATE'; electionDate: string; config?: RoomConfig },
  now: Date = new Date(),
): Promise<CreateRoomResult> {
  const active = await prisma.electionRoom.count({ where: { ownerId: userId, expiresAt: { gt: now } } });
  if (active >= MAX_ROOMS_PER_USER) {
    return { ok: false, status: 429, error: `You can have ${MAX_ROOMS_PER_USER} active rooms at a time. Delete one first.` };
  }
  const expiresAt = roomExpiry(input.electionDate);
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, status: 422, error: 'That election is over.' };

  const config = sanitizeRoomConfig(input.config ?? defaultRoomConfig());
  // Codes are 32^8 ≈ 10^12: a collision is astronomically unlikely, but retry rather than fail.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode((max) => randomInt(max));
    try {
      const row = await prisma.electionRoom.create({
        data: { code, name: input.name, visibility: input.visibility, ownerId: userId, electionDate: input.electionDate, config: config as unknown as Prisma.InputJsonValue, expiresAt },
        include: withOwner,
      });
      return { ok: true, room: toRoomView(row, userId) };
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002') throw err; // only a unique-code clash is retried
    }
  }
  return { ok: false, status: 503, error: 'Could not allocate a room code. Try again.' };
}

/** A live room by code, or null when unknown or expired (an expired room is treated as gone). */
export async function getRoom(code: string, now: Date = new Date()): Promise<RoomRow | null> {
  if (!isRoomCode(code)) return null;
  const row = await prisma.electionRoom.findUnique({ where: { code }, include: withOwner });
  return row && row.expiresAt.getTime() > now.getTime() ? row : null;
}

export async function listPublicRooms(date: string, now: Date = new Date()): Promise<RoomListItem[]> {
  // Housekeeping rides the read: expired rooms are removed here (cheap, indexed) rather than needing a job.
  void prisma.electionRoom.deleteMany({ where: { expiresAt: { lte: now } } }).catch(() => undefined);
  const rows = await prisma.electionRoom.findMany({
    where: { visibility: 'PUBLIC', electionDate: date, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: withOwner,
  });
  return rows.map((r) => ({ code: r.code, name: r.name, electionDate: r.electionDate, owner: ownerView(r), summary: describeConfig(r.config) }));
}

export type UpdateRoomResult = { ok: true; room: RoomView } | { ok: false; status: number; error: string };

/** Owner-only edit. A config change is pushed to everyone watching the room, live. */
export async function updateRoom(
  code: string,
  userId: string,
  patch: { name?: string; visibility?: 'PUBLIC' | 'PRIVATE'; config?: RoomConfig },
): Promise<UpdateRoomResult> {
  const row = await getRoom(code);
  if (!row) return { ok: false, status: 404, error: 'Room not found.' };
  if (row.ownerId !== userId) return { ok: false, status: 403, error: 'Only the host can change this room.' };
  const data: Prisma.ElectionRoomUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.visibility !== undefined) data.visibility = patch.visibility;
  if (patch.config !== undefined) data.config = sanitizeRoomConfig(patch.config) as unknown as Prisma.InputJsonValue;
  const updated = await prisma.electionRoom.update({ where: { code }, data, include: withOwner });
  if (patch.config !== undefined) publishRoomConfig(`room:${code}`, sanitizeRoomConfig(updated.config));
  return { ok: true, room: toRoomView(updated, userId) };
}

export async function deleteRoom(code: string, userId: string, isAdmin: boolean): Promise<{ ok: boolean; status: number; error?: string }> {
  const row = await getRoom(code);
  if (!row) return { ok: false, status: 404, error: 'Room not found.' };
  if (row.ownerId !== userId && !isAdmin) return { ok: false, status: 403, error: 'Only the host can delete this room.' };
  await prisma.electionRoom.delete({ where: { code } });
  return { ok: true, status: 200 };
}

/** Whether `userId` may delete chat messages in a room's channel (host, or a site admin). */
export async function canModerateRoom(code: string, userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const row = await getRoom(code);
  return row?.ownerId === userId;
}
