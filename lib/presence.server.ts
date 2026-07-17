/**
 * Social presence: which people the viewer follows are online right now, and
 * what joinable room (if any) they're in. "Online" matches the rest of the
 * app — a presence heartbeat within the last 2 minutes.
 */

import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { cached } from '@/lib/cached.server';

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
/**
 * This is a per-viewer poll (the sidebar refreshes it on a ~minute cadence), so
 * a short read-through cache collapses the repeated fan-out (follow graph + the
 * online/room-membership queries) into one DB pass per viewer per window while
 * staying fresh enough that "who's online" isn't visibly stale.
 */
const PRESENCE_FRIENDS_TTL_MS = 45_000;

export interface OnlineFriend {
  user: ReturnType<typeof resolveUser>;
  /** A joinable public room the friend is in, or null. */
  activity: { kind: 'rmhtube' | 'rmhmusic'; label: string; href: string } | null;
}

export async function getOnlineFriends(viewerId: string, limit = 12): Promise<OnlineFriend[]> {
  return cached<OnlineFriend[]>(
    `presence:friends:${viewerId}:${limit}`,
    PRESENCE_FRIENDS_TTL_MS,
    () => computeOnlineFriends(viewerId, limit)
  );
}

async function computeOnlineFriends(viewerId: string, limit: number): Promise<OnlineFriend[]> {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);

  // Reuse the cached follow-graph reader instead of an unbounded raw findMany —
  // it's the same list the feed already keeps warm, invalidated on follow/block.
  const followingIds = await getFollowingIds(viewerId);
  if (followingIds.length === 0) return [];

  const online = await prisma.user.findMany({
    where: { id: { in: followingIds }, lastSeenAt: { gte: cutoff }, isBot: false },
    select: { ...userDisplaySelect, lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' },
    take: limit,
  });
  if (online.length === 0) return [];

  const onlineIds = online.map((u) => u.id);

  // Active room memberships (leftAt null, room still open + public) so we can
  // show "watching together" / "in a listening room" with a join link.
  const [tubeMembers, musicMembers] = await Promise.all([
    prisma.rmhTubeRoomMember.findMany({
      where: {
        userId: { in: onlineIds },
        leftAt: null,
        room: { closedAt: null, isPublic: true },
      },
      select: { userId: true, roomId: true },
    }),
    prisma.rmhMusicRoomMember.findMany({
      where: { userId: { in: onlineIds }, leftAt: null, room: { isPublic: true } },
      select: { userId: true, room: { select: { code: true } } },
    }),
  ]);

  const tubeByUser = new Map(tubeMembers.map((m) => [m.userId, m.roomId]));
  const musicByUser = new Map(musicMembers.map((m) => [m.userId, m.room.code]));

  return online.map((u) => {
    let activity: OnlineFriend['activity'] = null;
    const tubeRoom = tubeByUser.get(u.id);
    const musicRoom = musicByUser.get(u.id);
    if (tubeRoom) {
      activity = { kind: 'rmhtube', label: 'Watching together', href: `/rmhtube/${tubeRoom}` };
    } else if (musicRoom) {
      activity = { kind: 'rmhmusic', label: 'In a listening room', href: `/rmhmusic/${musicRoom}` };
    }
    return { user: resolveUser(u), activity };
  });
}
