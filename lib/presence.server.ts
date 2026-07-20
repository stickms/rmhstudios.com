/**
 * Social presence: which people the viewer follows are online right now, and
 * what joinable room (if any) they're in. "Online" matches the rest of the
 * app — a presence heartbeat within the last 2 minutes.
 */

import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { cached } from '@/lib/cached.server';
import { redisEnabled, redisGetJSON, redisSetJSON, redisDel } from '@/lib/redis.server';
import {
  joinTargetFor,
  type PresenceActivity,
  type PresenceVisibility,
  type ActiveFriend,
} from '@/lib/presence-types';

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
    () => computeOnlineFriends(viewerId, limit),
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

// ─── Rich presence activity (§9) ─────────────────────────────────────────────
//
// Activity is ephemeral — it expires with the heartbeat window so a crash/kill
// never leaks a stale "in a match". Backed by Redis when available (shared
// across instances) with an in-process fallback for single-node/dev.

const ACTIVITY_TTL_MS = ONLINE_WINDOW_MS;
const activityKey = (userId: string) => `presence:activity:${userId}`;

/** In-process fallback store (used only when Redis is unconfigured). */
const localActivity = new Map<string, { activity: PresenceActivity; expires: number }>();

/**
 * Set (or clear, with `null`) a user's current activity. Called **server-side
 * only** by the surfaces the user is in (game match join/leave, room join/leave,
 * space join/leave) — never client-asserted. Best-effort; never throws into the
 * caller's transition.
 */
export async function setActivity(userId: string, activity: PresenceActivity | null): Promise<void> {
  try {
    if (redisEnabled()) {
      if (activity) await redisSetJSON(activityKey(userId), activity, ACTIVITY_TTL_MS);
      else await redisDel(activityKey(userId));
      return;
    }
    if (activity) localActivity.set(userId, { activity, expires: Date.now() + ACTIVITY_TTL_MS });
    else localActivity.delete(userId);
  } catch (err) {
    console.error('[presence] setActivity failed:', err);
  }
}

/** Read one user's live activity (or null if idle/expired). */
export async function getActivity(userId: string): Promise<PresenceActivity | null> {
  if (redisEnabled()) return (await redisGetJSON<PresenceActivity>(activityKey(userId))) ?? null;
  const entry = localActivity.get(userId);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    localActivity.delete(userId);
    return null;
  }
  return entry.activity;
}

/** Batch-read activities for a set of users into a Map (missing = idle). */
async function getActivities(userIds: string[]): Promise<Map<string, PresenceActivity>> {
  const out = new Map<string, PresenceActivity>();
  await Promise.all(
    userIds.map(async (id) => {
      const a = await getActivity(id);
      if (a) out.set(id, a);
    }),
  );
  return out;
}

/**
 * The viewer's **mutuals** who are online now, with rich activity + a joinable
 * target, each filtered through the *target's* presence visibility/detail. The
 * base set is mutuals only, so non-mutuals never appear regardless of settings
 * (§9 default scope). Cached 15s per viewer.
 */
export async function getActiveFriends(viewerId: string, limit = 20): Promise<ActiveFriend[]> {
  return cached<ActiveFriend[]>(
    `friends:active:${viewerId}:${limit}`,
    15_000,
    () => computeActiveFriends(viewerId, limit),
  );
}

async function computeActiveFriends(viewerId: string, limit: number): Promise<ActiveFriend[]> {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);

  // Mutuals = people the viewer follows who follow the viewer back.
  const followingIds = await getFollowingIds(viewerId);
  if (followingIds.length === 0) return [];
  const backEdges = await prisma.follow.findMany({
    where: { followerId: { in: followingIds }, followingId: viewerId },
    select: { followerId: true },
  });
  const mutualIds = backEdges.map((f) => f.followerId);
  if (mutualIds.length === 0) return [];

  // Online mutuals + their presence-privacy settings.
  const online = await prisma.user.findMany({
    where: { id: { in: mutualIds }, lastSeenAt: { gte: cutoff }, isBot: false },
    select: {
      ...userDisplaySelect,
      lastSeenAt: true,
      profile: {
        select: {
          displayName: true,
          customImage: true,
          presenceVisibility: true,
          presenceDetail: true,
        },
      },
    },
    orderBy: { lastSeenAt: 'desc' },
    take: limit,
  });
  if (online.length === 0) return [];

  const activities = await getActivities(online.map((u) => u.id));

  const result: ActiveFriend[] = [];
  for (const u of online) {
    const visibility = (u.profile?.presenceVisibility ?? 'mutuals') as PresenceVisibility;
    // 'nobody' hides from every rail. 'mutuals'/'followers' both admit a mutual
    // (the viewer both follows and is followed by them).
    if (visibility === 'nobody') continue;

    const detail = u.profile?.presenceDetail ?? true;
    const activity = detail ? (activities.get(u.id) ?? null) : null;
    const resolved = resolveUser(u);
    result.push({
      user: {
        id: resolved.id,
        name: resolved.name,
        handle: resolved.handle ?? null,
        username: resolved.username ?? null,
        image: resolved.image,
      },
      activity,
      joinable: joinTargetFor(activity),
    });
  }

  // In-something first (a live activity is the useful, actionable state), then
  // by recency (the DB already ordered by lastSeenAt desc).
  result.sort((a, b) => Number(Boolean(b.activity)) - Number(Boolean(a.activity)));
  return result;
}
