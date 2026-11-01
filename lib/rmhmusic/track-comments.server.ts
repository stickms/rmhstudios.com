import { prisma } from '@/lib/prisma.server';
import {
  COMMENT_LIST_LIMIT,
  COMMENTS_PER_USER_PER_TRACK,
  type TrackCommentView,
} from '@/lib/rmhmusic/track-comments';

const authorSelect = {
  name: true,
  profile: { select: { displayName: true } },
} as const;

type Author = { name: string | null; profile: { displayName: string | null } | null };
const authorName = (u: Author) => u.profile?.displayName ?? u.name ?? 'Member';

/** Comments for a track, earliest position first. `viewerId` marks the viewer's own. */
export async function listTrackComments(
  trackUri: string,
  viewerId: string | null,
): Promise<TrackCommentView[]> {
  const rows = await prisma.rmhMusicTrackComment.findMany({
    where: { trackUri },
    orderBy: [{ positionMs: 'asc' }, { createdAt: 'asc' }],
    take: COMMENT_LIST_LIMIT,
    select: { id: true, positionMs: true, body: true, userId: true, user: { select: authorSelect } },
  });
  return rows.map((r) => ({
    id: r.id,
    positionMs: r.positionMs,
    body: r.body,
    author: authorName(r.user),
    mine: viewerId !== null && r.userId === viewerId,
  }));
}

/** Returns null when the user already has the per-track maximum. */
export async function addTrackComment(
  userId: string,
  trackUri: string,
  positionMs: number,
  body: string,
): Promise<TrackCommentView | null> {
  const mineHere = await prisma.rmhMusicTrackComment.count({ where: { userId, trackUri } });
  if (mineHere >= COMMENTS_PER_USER_PER_TRACK) return null;
  const r = await prisma.rmhMusicTrackComment.create({
    data: { userId, trackUri, positionMs, body },
    select: { id: true, positionMs: true, body: true, user: { select: authorSelect } },
  });
  return { id: r.id, positionMs: r.positionMs, body: r.body, author: authorName(r.user), mine: true };
}

/** Only the author can delete; returns whether a row was removed. */
export async function deleteTrackComment(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.rmhMusicTrackComment.deleteMany({ where: { id, userId } });
  return count > 0;
}
