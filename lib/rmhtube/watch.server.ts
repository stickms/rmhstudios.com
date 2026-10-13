/** DB access for timed comments, watch later, heat and commentary tracks (P20). */
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import type { CommentaryLine } from './party';

const nameSelect = { name: true, profile: { select: { displayName: true } } } as const;
const authorName = (u: { name: string | null; profile: { displayName: string | null } | null }) =>
  u.profile?.displayName ?? u.name ?? 'Member';

export async function listTimedComments(mediaUrl: string, viewerId: string) {
  const rows = await prisma.rmhTubeTimedComment.findMany({
    where: { mediaUrl },
    orderBy: { atSec: 'asc' },
    take: 600,
    select: { id: true, atSec: true, body: true, userId: true, user: { select: nameSelect } },
  });
  return rows.map((r) => ({
    id: r.id,
    atSec: r.atSec,
    body: r.body,
    author: authorName(r.user),
    mine: r.userId === viewerId,
  }));
}

export async function addTimedComment(
  userId: string,
  mediaUrl: string,
  atSec: number,
  body: string,
) {
  const mineHere = await prisma.rmhTubeTimedComment.count({ where: { userId, mediaUrl } });
  if (mineHere >= 100) return null;
  const r = await prisma.rmhTubeTimedComment.create({
    data: { userId, mediaUrl, atSec, body },
    select: { id: true, atSec: true, body: true, user: { select: nameSelect } },
  });
  return { id: r.id, atSec: r.atSec, body: r.body, author: authorName(r.user), mine: true };
}

export const deleteTimedComment = (userId: string, id: string) =>
  prisma.rmhTubeTimedComment.deleteMany({ where: { id, userId } });

export const listWatchLater = (userId: string) =>
  prisma.rmhTubeWatchLater.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { id: true, url: true, title: true },
  });

export async function addWatchLater(userId: string, url: string, title: string) {
  const row = await prisma.rmhTubeWatchLater.upsert({
    where: { userId_url: { userId, url } },
    create: { userId, url, title },
    update: {},
    select: { id: true, url: true, title: true },
  });
  // Bounded list: drop the oldest beyond 200.
  const extra = await prisma.rmhTubeWatchLater.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: 200,
    select: { id: true },
  });
  if (extra.length)
    await prisma.rmhTubeWatchLater.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  return row;
}

export const deleteWatchLater = (userId: string, id: string) =>
  prisma.rmhTubeWatchLater.deleteMany({ where: { id, userId } });

/** Reaction + rewind counts per 10 s bucket; cached a minute (the hub writes in batches). */
export function heatFor(mediaUrl: string) {
  return cached(`rmhtube:heat:${mediaUrl}`, 60_000, async () => {
    const rows = await prisma.rmhTubeHeatBucket.findMany({
      where: { mediaUrl },
      orderBy: { bucket: 'asc' },
      take: 2000,
      select: { bucket: true, count: true },
    });
    return rows.map((r) => ({ b: r.bucket, n: r.count }));
  });
}

export async function listTracks(mediaUrl: string) {
  const rows = await prisma.rmhTubeCommentaryTrack.findMany({
    where: { mediaUrl },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, title: true, user: { select: nameSelect } },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, author: authorName(r.user) }));
}

export async function getTrack(id: string) {
  const r = await prisma.rmhTubeCommentaryTrack.findUnique({
    where: { id },
    select: { id: true, title: true, lines: true, user: { select: nameSelect } },
  });
  return (
    r && {
      id: r.id,
      title: r.title,
      author: authorName(r.user),
      lines: r.lines as unknown as CommentaryLine[],
    }
  );
}

export async function addTrack(
  userId: string,
  mediaUrl: string,
  title: string,
  lines: CommentaryLine[],
) {
  const mine = await prisma.rmhTubeCommentaryTrack.count({ where: { userId, mediaUrl } });
  if (mine >= 5) return null;
  const sorted = [...lines].sort((a, b) => a.t - b.t);
  return prisma.rmhTubeCommentaryTrack.create({
    data: { userId, mediaUrl, title, lines: JSON.parse(JSON.stringify(sorted)) },
    select: { id: true, title: true },
  });
}
