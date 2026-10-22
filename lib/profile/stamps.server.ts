/**
 * Server half of the stamp wall (P5). Server-only.
 *
 * Moderation goes through the existing report path: a stamp is reportable as
 * `entityType: 'stamp'` (`/api/moderation/report`), and resolving that report
 * with "remove content" calls {@link takedownStamp}.
 */
import { prisma } from '@/lib/prisma.server';
import { optimizeImage, imageDimensions } from '@/lib/image-optimize';
import { putObject, deleteObject } from '@/lib/storage/s3.server';
import { sniffImageType } from '@/lib/media/ingest.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { setProfileModules } from '@/lib/profile/plus.server';
import {
  STAMP_MAX_CREATED,
  STAMP_MAX_PER_DAY,
  STAMP_MAX_UPLOAD_BYTES,
  STAMP_MAX_STORED_BYTES,
  STAMP_WALL_CAP,
  judgeStampImage,
  stampKey,
  stampUrl,
  type StampRejection,
  type StampView,
} from '@/lib/profile/stamps';

const REJECTION_MESSAGE: Record<StampRejection, string> = {
  empty: 'No image provided.',
  'too-large': 'That image is too large. Stamps can be up to 96 KB.',
  format: 'Unsupported image. Use a PNG, GIF or WebP.',
  'too-big-dimensions': 'That image is too big. Stamps can be up to 176×176 pixels.',
  'too-small': 'That image is too small to be a stamp.',
};

export type StampResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const stampSelect = {
  id: true,
  name: true,
  imageUrl: true,
  width: true,
  height: true,
  addCount: true,
  creator: { select: userDisplaySelect },
} as const;

type StampRow = {
  id: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  addCount: number;
  creator: Parameters<typeof resolveUser>[0];
};

function toView(row: StampRow, mine?: ReadonlySet<string>): StampView {
  const creator = resolveUser(row.creator);
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.imageUrl,
    width: row.width,
    height: row.height,
    addCount: row.addCount,
    creator: { id: creator.id, name: creator.name, handle: creator.handle },
    ...(mine ? { onMyWall: mine.has(row.id) } : {}),
  };
}

async function myWallIds(
  viewerId: string | null,
  ids: string[],
): Promise<ReadonlySet<string> | undefined> {
  if (!viewerId || ids.length === 0) return undefined;
  const rows = await prisma.profileStamp.findMany({
    where: { userId: viewerId, stampId: { in: ids } },
    select: { stampId: true },
  });
  return new Set(rows.map((r) => r.stampId));
}

/* -------------------------------------------------------------------------- */
/* Create / delete                                                            */
/* -------------------------------------------------------------------------- */

export async function createStamp(
  userId: string,
  file: File,
  name: string,
  now: Date = new Date(),
): Promise<StampResult<StampView>> {
  // Cheap gates first: file.size is known before the body is read.
  if (file.size > STAMP_MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: REJECTION_MESSAGE['too-large'] };
  }

  const [total, today] = await Promise.all([
    prisma.stamp.count({ where: { creatorId: userId } }),
    prisma.stamp.count({
      where: { creatorId: userId, createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
    }),
  ]);
  if (total >= STAMP_MAX_CREATED) {
    return { ok: false, status: 409, error: `You can create up to ${STAMP_MAX_CREATED} stamps.` };
  }
  if (today >= STAMP_MAX_PER_DAY) {
    return { ok: false, status: 429, error: `You can create ${STAMP_MAX_PER_DAY} stamps a day.` };
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageType(raw);
  const dims = await imageDimensions(raw);
  const rejection = judgeStampImage({
    bytes: raw.length,
    mime,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  });
  if (rejection) {
    return {
      ok: false,
      status: rejection === 'too-large' ? 413 : 400,
      error: REJECTION_MESSAGE[rejection],
    };
  }

  // A fresh WebP encode: no metadata survives, and animated GIFs stay animated.
  const encoded = await optimizeImage(raw, {
    format: 'webp',
    quality: 90,
    animated: mime === 'image/gif' || mime === 'image/webp',
    forceFormat: true,
  });
  if (encoded.buffer.length > STAMP_MAX_STORED_BYTES) {
    return { ok: false, status: 413, error: REJECTION_MESSAGE['too-large'] };
  }

  const filename = `${userId}-${now.getTime()}-${Math.round(Math.random() * 1e9)}.webp`;
  const key = stampKey(filename);
  await putObject(key, encoded.buffer, encoded.contentType);

  const row = await prisma.stamp.create({
    data: {
      creatorId: userId,
      name,
      imageKey: key,
      imageUrl: stampUrl(filename),
      width: encoded.width,
      height: encoded.height,
      bytes: encoded.buffer.length,
    },
    select: stampSelect,
  });
  return { ok: true, value: toView(row) };
}

/** The creator deletes their own stamp; it leaves every wall it was on. */
export async function deleteOwnStamp(userId: string, stampId: string): Promise<boolean> {
  const stamp = await prisma.stamp.findUnique({
    where: { id: stampId },
    select: { creatorId: true, imageKey: true },
  });
  if (!stamp || stamp.creatorId !== userId) return false;
  await prisma.stamp.delete({ where: { id: stampId } });
  await deleteObject(stamp.imageKey).catch(() => {});
  return true;
}

/** Moderation takedown (report resolved with "remove content"). Keeps the row for audit. */
export async function takedownStamp(stampId: string, now: Date = new Date()): Promise<void> {
  const stamp = await prisma.stamp.findUnique({
    where: { id: stampId },
    select: { imageKey: true, removedAt: true },
  });
  if (!stamp || stamp.removedAt) return;
  await prisma.stamp.update({ where: { id: stampId }, data: { removedAt: now } });
  await deleteObject(stamp.imageKey).catch(() => {});
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function listMyStamps(userId: string): Promise<StampView[]> {
  const rows = await prisma.stamp.findMany({
    where: { creatorId: userId, removedAt: null },
    orderBy: { createdAt: 'desc' },
    take: STAMP_MAX_CREATED,
    select: stampSelect,
  });
  return rows.map((r) => toView(r));
}

const PAGE = 40;

export async function browseStamps(args: {
  sort: 'new' | 'popular';
  cursor: string | null;
  viewerId: string | null;
}): Promise<{ stamps: StampView[]; nextCursor: string | null }> {
  const rows = await prisma.stamp.findMany({
    where: { removedAt: null },
    orderBy:
      args.sort === 'popular'
        ? [{ addCount: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    select: stampSelect,
  });
  const page = rows.slice(0, PAGE);
  const mine = await myWallIds(
    args.viewerId,
    page.map((r) => r.id),
  );
  return {
    stamps: page.map((r) => toView(r, mine)),
    nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null,
  };
}

/** A member's wall, newest first. Bounded by {@link STAMP_WALL_CAP}. */
export async function getWall(ownerId: string, viewerId: string | null): Promise<StampView[]> {
  const rows = await prisma.profileStamp.findMany({
    where: { userId: ownerId, stamp: { removedAt: null } },
    orderBy: { createdAt: 'desc' },
    take: STAMP_WALL_CAP,
    select: { stamp: { select: stampSelect } },
  });
  const stamps = rows.map((r) => r.stamp);
  const mine = await myWallIds(
    viewerId,
    stamps.map((s) => s.id),
  );
  return stamps.map((s) => toView(s, mine));
}

/* -------------------------------------------------------------------------- */
/* Wall edits                                                                 */
/* -------------------------------------------------------------------------- */

export async function addToWall(userId: string, stampId: string): Promise<StampResult<true>> {
  const stamp = await prisma.stamp.findUnique({
    where: { id: stampId },
    select: { removedAt: true, creatorId: true },
  });
  if (!stamp || stamp.removedAt) return { ok: false, status: 404, error: 'Stamp not found.' };

  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: stamp.creatorId },
        { blockerId: stamp.creatorId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  if (blocked) return { ok: false, status: 404, error: 'Stamp not found.' };

  const result = await prisma.$transaction(async (tx) => {
    const have = await tx.profileStamp.count({ where: { userId } });
    const existing = await tx.profileStamp.findUnique({
      where: { userId_stampId: { userId, stampId } },
      select: { stampId: true },
    });
    if (existing) return 'already' as const;
    if (have >= STAMP_WALL_CAP) return 'full' as const;
    await tx.profileStamp.create({ data: { userId, stampId } });
    await tx.stamp.update({ where: { id: stampId }, data: { addCount: { increment: 1 } } });
    return 'added' as const;
  });
  if (result === 'full') {
    return { ok: false, status: 409, error: `Your wall is full (${STAMP_WALL_CAP} stamps).` };
  }
  if (result === 'added') await setProfileModules(userId, { stamps: true });
  return { ok: true, value: true };
}

export async function removeFromWall(userId: string, stampId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const res = await tx.profileStamp.deleteMany({ where: { userId, stampId } });
    if (res.count > 0) {
      await tx.stamp.update({ where: { id: stampId }, data: { addCount: { decrement: 1 } } });
    }
  });
}
