/**
 * RMHTube subtitles — persistence and authorisation (server-only).
 *
 * Written against a Prisma client passed in, so the hub (its own client) and the site (`prisma.server`) share one
 * implementation. Relative imports only: the hub bundles this file.
 *
 * Who may do what:
 *  - add: the member who queued the item, or the room's host, while they are in the room now;
 *  - remove: the member who added that subtitle, or the room's host;
 *  - read the cues: a member in the room now (an `RmhTubeRoomMember` row with `leftAt` null) or the host, for an item of
 *    that room, while the room is open. Everyone else, and every miss, gets the same `null`.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { lockKey } from '../db/advisory-lock.server';
import {
  SUBTITLE_LIMITS,
  normalizeLabel,
  normalizeLang,
  validateCues,
  type SubtitleCue,
  type SubtitleLabel,
  type SubtitleRefusal,
} from './subtitles';

export type SubtitleDb = Pick<PrismaClient, '$transaction' | 'rmhTubeRoom' | 'rmhTubeRoomMember' | 'rmhTubeSubtitle'>;

export type SubtitleFailure = SubtitleRefusal | 'not_found' | 'forbidden' | 'live' | 'limit' | 'label_taken';

export type AddResult = { ok: true; subtitle: SubtitleLabel } | { ok: false; reason: SubtitleFailure };
export type RemoveResult = { ok: true; queueItemId: string } | { ok: false; reason: SubtitleFailure };

type Reader = Pick<PrismaClient, 'rmhTubeRoom' | 'rmhTubeRoomMember'>;

/** In the room now: the host, or a member row that has not left. A closed room admits nobody. */
export async function isRoomParticipant(db: Reader, roomId: string, userId: string): Promise<boolean> {
  const room = await db.rmhTubeRoom.findUnique({ where: { id: roomId }, select: { hostId: true, closedAt: true } });
  if (!room || room.closedAt) return false;
  if (room.hostId === userId) return true;
  const member = await db.rmhTubeRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { leftAt: true },
  });
  return !!member && member.leftAt === null;
}

export interface AddInput {
  roomId: string;
  itemId: string;
  userId: string;
  label: unknown;
  lang?: unknown;
  cues: unknown;
  /** The hub's view of the item: a live source has no timeline to subtitle. */
  live: boolean;
}

export async function addSubtitle(db: SubtitleDb, input: AddInput): Promise<AddResult> {
  if (input.live) return { ok: false, reason: 'live' };
  const label = normalizeLabel(input.label);
  if (!label) return { ok: false, reason: 'bad_label' };
  let lang: string | null = null;
  if (input.lang !== undefined && input.lang !== null && String(input.lang).trim() !== '') {
    lang = normalizeLang(input.lang);
    if (!lang) return { ok: false, reason: 'bad_lang' };
  }
  const checked = validateCues(input.cues);
  if (!checked.ok) return { ok: false, reason: checked.reason };

  return db.$transaction(async (tx): Promise<AddResult> => {
    // At most three per item: check and insert under one lock, so two adds cannot both see two.
    await lockKey(tx, `rmhtube-subtitles:${input.itemId}`);
    const item = await tx.rmhTubeQueueItem.findUnique({
      where: { id: input.itemId },
      select: { roomId: true, addedById: true },
    });
    if (!item || item.roomId !== input.roomId) return { ok: false, reason: 'not_found' };
    if (!(await isRoomParticipant(tx, input.roomId, input.userId))) return { ok: false, reason: 'forbidden' };
    const room = await tx.rmhTubeRoom.findUnique({ where: { id: input.roomId }, select: { hostId: true } });
    if (item.addedById !== input.userId && room?.hostId !== input.userId) return { ok: false, reason: 'forbidden' };

    const existing = await tx.rmhTubeSubtitle.findMany({
      where: { queueItemId: input.itemId },
      select: { label: true },
    });
    if (existing.some((s) => s.label.toLowerCase() === label.toLowerCase()))
      return { ok: false, reason: 'label_taken' };
    if (existing.length >= SUBTITLE_LIMITS.MAX_PER_ITEM) return { ok: false, reason: 'limit' };

    const row = await tx.rmhTubeSubtitle.create({
      data: {
        queueItemId: input.itemId,
        roomId: input.roomId,
        addedById: input.userId,
        label,
        lang,
        cues: checked.cues as unknown as Prisma.InputJsonValue,
        cueCount: checked.cues.length,
      },
      select: { id: true, label: true, lang: true, cueCount: true },
    });
    return { ok: true, subtitle: row };
  });
}

export async function removeSubtitle(
  db: SubtitleDb,
  input: { roomId: string; subtitleId: string; userId: string },
): Promise<RemoveResult> {
  const row = await db.rmhTubeSubtitle.findUnique({
    where: { id: input.subtitleId },
    select: { id: true, roomId: true, queueItemId: true, addedById: true },
  });
  if (!row || row.roomId !== input.roomId) return { ok: false, reason: 'not_found' };
  if (!(await isRoomParticipant(db, input.roomId, input.userId))) return { ok: false, reason: 'forbidden' };
  const room = await db.rmhTubeRoom.findUnique({ where: { id: input.roomId }, select: { hostId: true } });
  if (row.addedById !== input.userId && room?.hostId !== input.userId) return { ok: false, reason: 'forbidden' };
  await db.rmhTubeSubtitle.deleteMany({ where: { id: row.id } });
  return { ok: true, queueItemId: row.queueItemId };
}

/** The labels of an item's tracks, oldest first. */
export async function listSubtitleLabels(db: Pick<PrismaClient, 'rmhTubeSubtitle'>, itemIds: string[]) {
  if (itemIds.length === 0) return new Map<string, SubtitleLabel[]>();
  const rows = await db.rmhTubeSubtitle.findMany({
    where: { queueItemId: { in: itemIds } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, queueItemId: true, label: true, lang: true, cueCount: true },
  });
  const byItem = new Map<string, SubtitleLabel[]>();
  for (const r of rows) {
    const list = byItem.get(r.queueItemId) ?? [];
    list.push({ id: r.id, label: r.label, lang: r.lang, cueCount: r.cueCount });
    byItem.set(r.queueItemId, list);
  }
  return byItem;
}

/**
 * The cues of one track, for a current participant of that room only. Every other case (a stranger, a member who left,
 * a closed room, a missing room, item or subtitle, an item from another room) is the same `null`.
 */
export async function readSubtitleCues(
  db: Pick<PrismaClient, 'rmhTubeRoom' | 'rmhTubeRoomMember' | 'rmhTubeSubtitle'>,
  input: { roomId: string; itemId: string; subtitleId: string; userId: string },
): Promise<{ id: string; label: string; lang: string | null; cues: SubtitleCue[] } | null> {
  if (!(await isRoomParticipant(db, input.roomId, input.userId))) return null;
  const row = await db.rmhTubeSubtitle.findFirst({
    where: { id: input.subtitleId, queueItemId: input.itemId, roomId: input.roomId },
    select: { id: true, label: true, lang: true, cues: true },
  });
  if (!row) return null;
  // Stored cues were validated on the way in; run them through the same gate on the way out.
  const checked = validateCues(row.cues);
  return checked.ok ? { id: row.id, label: row.label, lang: row.lang, cues: checked.cues } : null;
}
